"""Model training on time-ordered datasets.

scikit-learn is imported lazily (inside functions) so routes that don't train models keep
fast cold starts. Every model uses a fixed, recorded seed; scaling is fitted on the training
rows only (inside the pipeline), never on test data.
"""

from __future__ import annotations

import io
from typing import Any, Dict, Literal, Tuple

from backend.ml.datasets import Dataset

ModelType = Literal["logistic", "random_forest", "gradient_boosting"]
SEED = 42

MODEL_INFO: Dict[str, Dict[str, Any]] = {
    "logistic": {
        "name": "Logistic regression",
        "hyperparams": {"C": 1.0, "max_iter": 2000, "class_weight": "balanced"},
    },
    "random_forest": {
        "name": "Random forest",
        "hyperparams": {"n_estimators": 200, "max_depth": 6, "min_samples_leaf": 5, "class_weight": "balanced_subsample"},
    },
    "gradient_boosting": {
        "name": "Gradient boosting (histogram)",
        "hyperparams": {"max_iter": 200, "learning_rate": 0.05, "max_depth": 3, "l2_regularization": 1.0},
    },
}


def make_model(model_type: ModelType):
    from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    params = MODEL_INFO[model_type]["hyperparams"]
    if model_type == "logistic":
        return make_pipeline(StandardScaler(), LogisticRegression(random_state=SEED, **params))
    if model_type == "random_forest":
        return RandomForestClassifier(random_state=SEED, n_jobs=1, **params)
    if model_type == "gradient_boosting":
        return HistGradientBoostingClassifier(random_state=SEED, **params)
    raise ValueError(f"Unknown model type: {model_type}")


def train_model(dataset: Dataset, model_type: ModelType):
    if len(set(dataset.train_index) & set(dataset.test_index)):
        raise ValueError("Train and test rows overlap")  # build_dataset makes this impossible; belt and braces
    if dataset.y_train.nunique() < 2:
        raise ValueError("The training window contains only one label class; choose a longer range or another label")
    model = make_model(model_type)
    model.fit(dataset.X_train, dataset.y_train)
    return model


MAX_ARTIFACT_BYTES = 10 * 1024 * 1024


def serialize_model(model) -> bytes:
    import joblib

    buffer = io.BytesIO()
    joblib.dump(model, buffer, compress=3)
    data = buffer.getvalue()
    if len(data) > MAX_ARTIFACT_BYTES:
        raise ValueError(f"Model artifact is {len(data) / 1e6:.1f} MB, above the {MAX_ARTIFACT_BYTES / 1e6:.0f} MB limit")
    return data


def deserialize_model(data: bytes):
    import joblib

    # Artifacts are only ever produced by this server (serialize_model) and read back by their
    # owner; never load artifacts supplied by clients (pickle executes code on load).
    return joblib.load(io.BytesIO(data))


def model_name(model_type: str) -> str:
    return MODEL_INFO.get(model_type, {}).get("name", model_type)


def describe(model_type: ModelType) -> Tuple[str, Dict[str, Any]]:
    info = MODEL_INFO[model_type]
    return info["name"], dict(info["hyperparams"]) | {"random_state": SEED}
