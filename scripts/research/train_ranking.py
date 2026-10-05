"""Train and evaluate the walk-forward stock-ranking models (linear benchmark + boosted trees).

Run from the repository root:

    .venv/Scripts/python scripts/research/train_ranking.py --dataset-version <sha256>
    .venv/Scripts/python scripts/research/train_ranking.py --snapshot-file <local .npz>   (offline)

Without --evaluate-holdout only the development and validation windows are used: model and
hyperparameter selection (every trial reported) and walk-forward validation results. The final
holdout is evaluated once, only with --evaluate-holdout, after the promotion criteria in
backend/ml/ranking.py (DEFAULT_CRITERIA) are settled. With --save the experiment (walk-forward
predictions, metrics, gated model files) is stored in MongoDB and logged to MLflow when
tracking is configured; without it nothing is written anywhere.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.ml import ranking  # noqa: E402
from backend.models.research_runs import RunSettings  # noqa: E402
from backend.research import snapshots  # noqa: E402
from backend.services import ranking_service  # noqa: E402


def _fmt(value, pct=False):
    if value is None:
        return "—"
    return f"{value:+.2%}" if pct else f"{value:+.4f}"


async def _with_store(fn):
    from backend.config import resolve_mongo_dsn, settings
    from backend.stores import MongoStore

    dsn = resolve_mongo_dsn(settings)
    if not dsn:
        raise SystemExit("No MongoDB connection string configured; nothing loaded or saved.")
    store = MongoStore(dsn, settings.mongodb_db)
    try:
        await store.init()
        return await fn(store)
    finally:
        await store.close()


def _track(record, artifacts, experiment_id):
    from backend.services import experiment_tracking

    if not experiment_tracking.enabled():
        return None
    params = {"config." + key: value for key, value in record["config"].items() if key != "criteria"} | {"dataset.version": record["dataset"]["version"]}
    metrics = {}
    for kind, family in record["families"].items():
        for key in ("meanIc", "icTstat", "positiveShare", "topDecileSpread"):
            metrics[f"{kind}.validation.{key}"] = family["validation"].get(key)
            if "holdout" in family:
                metrics[f"{kind}.holdout.{key}"] = family["holdout"].get(key)
    tags = {
        "app.ranking_experiment": experiment_id,
        "code.commit": str(record["code"].get("commit")),
        "dataset.version": record["dataset"]["version"],
        "schema.hash": record["schemaHash"],
        "seed": str(record["seed"]),
        "holdout.uses": str(record["holdoutUses"]),
        "trial.count": str(len(record["trials"])),
    } | {f"{kind}.maturity": family["promotion"]["maturity"] for kind, family in record["families"].items()}
    files = {f"model-{kind}.joblib": data for kind, data in artifacts.items()}
    logged = experiment_tracking.log_run("ranking experiment", params, metrics, tags, family="ml/ranking", artifacts=files)
    if logged:
        for kind in artifacts:
            if f"model-{kind}.joblib" in logged.get("artifactsUploaded", []):
                experiment_tracking.register_model_version(f"atl-ranking-{kind}", logged["runId"], f"{logged['artifactUri']}/model-{kind}.joblib")
    return logged


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--dataset-version", help="Load the snapshot from MongoDB")
    source.add_argument("--snapshot-file", help="Load a snapshot file built locally (never commit these)")
    parser.add_argument("--evaluate-holdout", action="store_true", help="Use the final holdout (counted; a second look needs a new holdout)")
    parser.add_argument("--save", action="store_true", help="Store the experiment in MongoDB and log it to MLflow")
    parser.add_argument("--capital", type=float, default=1_000_000)
    args = parser.parse_args()

    if args.snapshot_file:
        snapshot = snapshots.deserialize(Path(args.snapshot_file).read_bytes())
    else:
        async def load(store):
            return await snapshots.load_snapshot(store, args.dataset_version)

        snapshot = asyncio.run(_with_store(load))
        if snapshot is None:
            raise SystemExit("Dataset not found")
    if args.save and args.snapshot_file:
        raise SystemExit("--save needs --dataset-version so the experiment points at a stored dataset")

    config = ranking.RankingConfig()
    settings = RunSettings(datasetVersion=snapshot.version, capital=args.capital)
    print(f"Dataset {snapshot.version[:12]} · {snapshot.universe} · {snapshot.meta['period']['start']} .. {snapshot.meta['period']['end']}")
    print(f"Promotion criteria (fixed before any holdout look): {dict(config.criteria)}")
    started = time.perf_counter()
    record, artifacts = ranking_service.run_experiment(snapshot, settings, config, evaluate_holdout=args.evaluate_holdout)
    print(f"Done in {time.perf_counter() - started:.1f}s · panel {record['panel']} · split {record['split']}")
    print("Trials (validation window only):")
    for trial in record["trials"]:
        print(f"  {trial['index']}/{trial['count']} {trial['kind']:<5} {trial['params']} mean IC {_fmt(trial['meanIc'])} t {_fmt(trial['icTstat'])}")
    for kind, family in record["families"].items():
        v = family["validation"]
        print(f"{family['name']}: validation IC {_fmt(v['meanIc'])} (t {_fmt(v['icTstat'])}, {v['positiveShare'] or 0:.0%} positive, CI {v['icCi']}) top-decile {_fmt(v['topDecileSpread'], True)}")
        if "holdout" in family:
            h = family["holdout"]
            print(f"  holdout IC {_fmt(h['meanIc'])} (t {_fmt(h['icTstat'])})")
        print(f"  maturity: {family['promotion']['maturity']} · gate {'passed' if family['final']['gate']['passed'] else 'FAILED'} · final model trained to {family['final']['trainingCutoff']}")
    for window in ("validationTrading", "holdoutTrading"):
        if not record.get(window):
            continue
        print(f"{window} {record[window]['start']} .. {record[window]['end']}:")
        for key, run in record[window]["runs"].items():
            m = run["metrics"]
            print(f"  {key:<24} return {_fmt(m.get('totalReturn'), True)} maxDD {m.get('maxDrawdown') or 0:.1%} Sharpe {m.get('sharpe') or 0:.2f} turnover {run['turnover']:.2f} vs EW {_fmt(run['excessVsEqualWeight'], True)}")
    if not args.save:
        print("Nothing saved (add --save to store the experiment).")
        return 0

    async def save(store):
        return await store.add_ranking_experiment(record, artifacts)

    stored = asyncio.run(_with_store(save))
    print(f"Saved ranking experiment {stored['id']}")
    logged = _track(record, artifacts, stored["id"])
    print(f"MLflow: {logged['url'] if logged else 'not logged (tracking off or unavailable)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
