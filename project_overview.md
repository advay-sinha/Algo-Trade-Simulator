# Algo Trade Lab — Project Overview

A full-stack quantitative research and trading simulation platform. Users research live markets, create simulated portfolio runs, train and inspect trading strategies, and consult a research chat copilot — without risking real capital. The project is evolving from a trading simulator into a modular quant research platform with backtesting, risk analytics, ML strategy pipelines, and LLM-assisted research.

---

## 1. System architecture

```
┌────────────────────────┐        HTTP (fetch, bearer token)        ┌─────────────────────────────┐
│  React + Vite + TS SPA │ ───────────────────────────────────────▶ │  FastAPI backend (port 8000)│
│  (port 5173)           │ ◀─────────────────────────────────────── │  backend/main.py + api/*    │
└────────────────────────┘                                          └──────────┬──────────────────┘
      │                                                                        │
      │ localStorage: "algo-trade-session"                     ┌───────────────┼───────────────────┐
      ▼                                                        ▼               ▼                   ▼
  session persistence                                   ┌────────────┐  ┌─────────────┐  ┌──────────────────┐
                                                        │  MongoDB   │  │ Yahoo       │  │ LLM provider     │
                                                        │ (or in-    │  │ Finance     │  │ (Groq/OpenRouter/│
                                                        │  memory)   │  │ (yfinance → │  │  HF/Ollama/OpenAI│
                                                        └────────────┘  │  raw HTTP → │  │  optional)       │
                                                                        │  offline)   │  └──────────────────┘
                                                                        └─────────────┘
```

- **Single origin** — every backend route lives under `/api`. In development the Vite dev server proxies `/api` to port 8000; in production the SPA and API are served from one domain. The client uses the relative `/api` base (`VITE_API_BASE_URL` overrides it only for a separately hosted API), so no CORS configuration is needed in either case.
- **Auth**: bearer tokens (random 32-byte urlsafe), issued at signup/login, 7-day expiry, revoked by logout, checked by a FastAPI dependency on protected routes. Only the SHA-256 hash of each token is stored. Signup/login are rate limited per client IP.
- **Persistence**: MongoDB via Motor (async), with a drop-in `InMemoryStore` for zero-setup development. The store is created lazily on the first request (no startup hooks) and cached per process; `STRICT_DB` turns database unavailability into HTTP 503 instead of a silent in-memory fallback. Both stores implement the same implicit interface (users, sessions, simulations, training records).
- **Market data fallback chain**: `yfinance` → raw `query1.finance.yahoo.com` HTTP → hardcoded offline quotes / synthetic charts. Keeps the UI alive during rate limits or outages.
- **Shared state for multiple instances**: optional Upstash Redis (REST) holds the market-data cache and rate-limit counters; without it both live in process memory. Redis failures fail open (cache skipped, limits not enforced) with a logged warning.
- **Observability**: one structured log line per request (method, path, status, duration, request id; never query strings or bodies), JSON on hosted platforms; the `X-Request-ID` response header ties a client report to the log line.

## 2. Backend (`backend/`)

| Concern | What exists |
|---|---|
| Assembly | `main.py` — creates the app, adds CORS and the request-context middleware, includes the route modules in `api/` (auth, market, analytics, simulations, backtests, ml, copilot, system); `deps.py` holds the store and current-user dependencies, `stores.py` both stores |
| Logging | `logging_config.py` — JSON or text formatter (`LOG_FORMAT`, `LOG_LEVEL`), pure ASGI request-id middleware (keeps streaming unbuffered) |
| Settings | `backend/config.py` — loads `backend/.env` (process env wins), Pydantic `Settings`, platform detection (`VERCEL`, `VERCEL_ENV`); Mongo DSN resolution `MONGO_URL` → `MONGODB_URI` → `MONGO_URI` → localhost default |
| Auth | Signup/login/logout with bcrypt (passlib), hashed bearer sessions (`services/auth_tokens.py`), password policy (≥ 8 chars, common passwords rejected), per-IP fixed-window rate limiting (`services/rate_limiter.py`; memory or Upstash storage), dev-bypass endpoint gated by `ENABLE_DEV_ENDPOINTS` and always off in production |
| Stores | `InMemoryStore` (asyncio-locked dicts) and `MongoStore` (Motor, small pool, 5 s server-selection timeout); created lazily via the `get_store` dependency; Mongo failure → 503 under `STRICT_DB`, otherwise in-memory with a log warning |
| Validation | `models/common.py` — symbol pattern `^[A-Za-z0-9.^=\-]{1,20}$`, chart range/interval enums, simulation status enum; enforced before any outbound request |
| Market data | `services/market_data_service.py` — quotes, search, OHLCV charts, watchlist batching, three-level fallback chain; async accessors run the sync clients in worker threads behind a TTL cache (15 s quotes, 5 min daily charts; live data only; in memory or Upstash) |
| Strategies | `strategies/` — common interface (`generate_signals(bars, params)` → long/flat series using data ≤ t) and registry: SMA crossover, time-series momentum, mean reversion; parameters validated by per-strategy Pydantic models |
| Features & datasets | `ml/features.py` (9 backward-looking feature generators, serializable config) and `ml/datasets.py` (forward labels, single NaN drop, date-ordered split with embargo ≥ max(1, horizon)); `services/feature_service.py` builds previews off the event loop |
| ML models | `ml/training.py` (logistic / random forest / histogram gradient boosting, fixed seed, scikit-learn imported lazily), `ml/evaluation.py` (classification vs majority baseline + cost-aware test-window backtest), `ml/inference.py` (live signal from stored feature config), `strategies/ml_directional.py` (model as a strategy), `services/model_registry_service.py`, optional `services/experiment_tracking.py` (MLflow REST, no client library) |
| Risk analytics | `analytics/metrics.py` (pure metric functions, annualization constants, NaN-safe sanitizing) and `analytics/risk.py` (report: strategy metrics, drawdown episode, buy-and-hold, benchmark over identical days, beta/alpha/correlation); computed once at run time and stored with the backtest |
| Backtesting | `services/backtesting_service.py` — next-bar-open fills, whole-share sizing, commission + slippage in bps on every fill, equity / drawdown / buy-and-hold series, trade log with open position marked to market, deterministic |
| Lab trainer | `/analytics/train` runs a zero-cost SMA crossover backtest over 6 months (in-sample) and reports real return, CAGR, drawdown, Sharpe, win rate; naive 5-day-momentum live signal; training-run listing |
| Market provenance | Every quote, chart, search result, and sparkline carries `source` (`live` / `offline` / `synthetic`); fallbacks are gated by `ALLOW_OFFLINE_MARKET_DATA`; `/api/status` reports the last observed source per server instance |
| Copilot | `llm/tools.py` (LangChain `StructuredTool`s — incl. `analyze_stock` (`services/stock_analysis.py`: returns, 52-week range, volatility, drawdown, beta, 200-day trend, RSI, each strategy's current signal with its reason, the user's ML signal, signal tilt — units in Pct) for investment questions, which `llm/guardrails.asks_for_advice` detects and answers with a research report plus a disclaimer appended server-side (`with_disclaimer`, `advisory` SSE event) — and research tools `list_research_runs`, `get_research_run`, `explain_position`, `list_ranking_models` that read stored runs through `services/research_explain.py` with percent / INR units — incl. `search_symbols` which returns live listings only built per request with the user's id/store in a closure), `llm/langchain_agent.py` (tool-calling loop, 5-call budget, every call answered), `llm/prompts.py` (scope, grounding, symbol-resolution, and instruction-priority rules), `llm/guardrails.py` (regex injection detection over the message, user-authored history, retrieved notes and tool results; `<<untrusted ...>>` fencing of notes and flagged tool output; a closing system reminder after the user turn — flags never block, they add a targeted reminder and a log line without content), `llm/providers.py` (OpenAI-compatible presets: Groq, Cerebras, OpenRouter, Hugging Face, Ollama, OpenAI; `resolve_chain` builds the primary-plus-free-fallback provider chain), `services/copilot_service.py` (model and provider failover on rate limits / outages with per-route cooldowns, a resumable recap of finished tool steps when every provider is exhausted mid-task, SSE event stream, provider-error masking); shared action code in `services/research_actions.py` so REST and tools use one path |
| Research NLP | `services/hf_inference.py` (hosted Hugging Face inference over REST — no client library; cold-start retry within a 10 s budget, then 503 + Retry-After; optional in-process `local` provider), `services/sentiment_service.py` (label mapping to bullish/bearish/neutral), `llm/rag.py` (note creation incl. backtest/model summaries, embeddings on the documents, stale re-embedding on query, NumPy cosine scan or Atlas `$vectorSearch` filtered by user, copilot context + citations) |
| Market intelligence | `services/market_flows.py` (blocking fetchers + parsers: NSE `fiidiiTradeReact`, NSE participant-wise OI CSV, NSDL fortnightly sector report, yfinance annual cash flows; failures return `source: unavailable` with a generic reason), `services/flows_service.py` (snapshots in `market_flows`, scheduled + throttled on-demand capture, history assembly, Nifty 50 sector capex weekly), `api/flows.py` (reads + `CRON_SECRET`-protected refresh); per-source health in `/api/status` |
| Portfolio (privacy-first) | `services/pii.py` (detectors, mirrored by `client/src/lib/pii.ts`, both tested on `shared/pii-vectors.json`; `mask()` for chat), `services/portfolio_service.py` (scan raw rows → allowlist schema → resolve via `symbol_catalog` / `amfi` / live quote → store holding fields only; any finding refuses the whole import), `services/portfolio_report.py` + `analytics/portfolio.py` (value, concentration, mix, portfolio-as-held risk, VaR/CVaR, beta, tracking error, correlation, XIRR, what-if, stress, factual observations), `services/amfi.py` (AMFI NAV file; fund NAV history from the public mfapi.in mirror). `api/errors.py`: validation errors never echo input |
| Research data & engine | `research/snapshots.py` (versioned daily snapshots: split-adjusted OHLC for fills, dividend-adjusted closes for signals, dividends as cash, universe-derived trading calendar, sha256 content version, verified on load, cached per process; stored in GridFS `research_snapshots` + `research_datasets`), `research/universe.py` (Nifty 50 / Nifty 100 current-constituent universes flagged survivorship-biased, point-in-time eligibility, rebalance calendars), `services/cost_model.py` (dated NSE delivery charges with sources, flat-bps model, cost stress), `services/portfolio_engine.py` (engine v2: target weights at a close → next-open whole-share fills, sells before buys, cash-limited buys, participation cap, pending orders, dividends, FIFO P&L, cost breakdown, turnover, config/result hashes); `scripts/build_research_snapshot.py` builds snapshots offline |
| Universe strategies & research runs | `strategies/portfolio_base.py` (separate registry, `DecisionContext`, caps, trailing return/volatility helpers), `strategies/xs_momentum.py`, `strategies/vol_trend.py`, `strategies/equal_weight.py`; every strategy (single-asset too) declares data needs, warm-up, rebalance, holding horizon, risk controls and maturity; `services/research_runs.py` (decisions with point-in-time eligibility → engine → metrics vs the index → capped, user-scoped record; comparisons with baseline + cost stress), `models/research_runs.py`, routes in `api/research_runs.py` |
| ML ranking pilot | `ml/panel.py` (one row per decision date × eligible stock; cross-sectional rank features, executable 20-session universe-relative target, `label_end` for purging, schema hash), `ml/ranking.py` (development / validation / holdout split, per-date walk-forward refits with purge + embargo, ridge and histogram gradient boosting with a fixed seed, rank IC and bootstrap intervals, prespecified promotion, integrity gate), `strategies/ml_ranking.py` (top-N from stored walk-forward predictions), `services/ranking_service.py` (experiment orchestration incl. trading evaluation through the engine), `scripts/research/train_ranking.py` (offline training; holdout only on request) |
| Run traceability | `services/run_tracking.py` (manifest artifacts — config, equity, fills, holdings, decisions — with SHA-256 hashes in the manifest; MLflow logging per strategy family with tags for commit / dataset / engine / hashes / trial; artifact upload through the tracking server's proxy when available; replay with identity check), `services/build_info.py` (commit from `VERCEL_GIT_COMMIT_SHA`, `GIT_COMMIT` or local git), `experiment_tracking.log_run` / `register_model_version` (REST, best effort) |
| Simulations | `services/simulation_service.py` — forward paper trading computed on read: frozen strategy config, deterministic replay from the start time (next-session-open fills, warm-up bars never trade, paused days place no orders), live mark-to-market, daily FX for non-INR instruments, buy-and-hold and benchmark comparison, final report frozen on completion |


## 3. Frontend (`client/src/`)

A section-based research console. Every page follows the same anatomy: a summary header (what the section does, its status, and "how it works" steps), feature and metric cards with explanations that open on hover, keyboard focus, or tap, and explicit loading / empty / error / fallback-data / planned states.

| Route | Section | Layout |
|---|---|---|
| `/` | Overview | Dashboard: key figures, watchlist trends, recent simulations, section directory |
| `/monitor` | Live monitoring | Range filter, type-ahead symbol search (offline catalog, Yahoo as an explicit fallback), key figures, candlestick chart, 30-second quote table |
| `/engines`, `/engines/:id` | Engines | Engine list; each engine has Overview / Workbench (or "What's coming") / Glossary tabs |
| `/lab` | Training · testing · validation | Parameters → run → metrics, price-with-averages chart, validation status, signal |
| `/lab/datasets` | Dataset builder | Parameters + feature groups → shape, split timeline (train / embargo / test), label balance, train-set feature stats, first/last rows |
| `/lab/models`, `/lab/models/:id` | Model lab | Train form → honest verdict, KPIs vs baseline, split timeline, test-window backtest vs buy-and-hold, confusion matrix, per-class table; registry with live signals; detail page (Report / Signal / Configuration) |
| `/backtests`, `/backtests/:id` | Backtests | Run form → KPIs, equity vs buy-and-hold vs benchmark, drawdown, risk report, trade log, assumptions; saved runs open in a tabbed detail page (Performance / Risk / Trades / Assumptions) |
| `/lab/strategies`, `/lab/runs/:id` | Strategy research | Dataset + shared settings + strategies with parameters → comparison (results table incl. stress reruns and the index, growth-of-100 chart of one chosen run vs the baseline vs the index, caveats, comparability conventions); each run opens a tabbed page (Performance / Holdings / Fills with reasons / Charges / Assumptions with reproducibility hashes) |
| `/lab/ranking/:id` | ML ranking model card | Target, development / validation / holdout windows, feature families, every trial, rank IC with intervals, trading results vs momentum / baseline / stress, promotion criteria and file checks, "Run comparison" from the stored walk-forward scores |
| `/simulations` | Simulations | Table with value, P&L, vs-hold, equity sparkline and signal per simulation; create (strategy + parameters) in a slide-over; named delete confirmation |
| `/flows` | Market flows | FII / DII cash KPIs, cumulative chart, positioning chart and daily table; sector FPI flows table with recent fortnights and sector index returns; company capex lookup and Nifty 50 sector capex |
| `/portfolio` | Portfolio | Import flow (checklist → CSV or manual → column map → preview with personal-data flags → upload), holdings by import with hard delete, report (KPIs, observations, weights, sector/asset mix, growth vs index, drawdown, correlation, what-if/stress, positions with price sources) |
| `/simulations/:id` | Simulation detail | KPIs, signal and pending order, position, value vs hold vs index chart, price chart with fill markers, fills with reasons, risk metrics, assumptions; pause / resume / complete |
| `/history`, `/history/prices` | History | Research records list; daily price history with chart, table, and CSV export |
| `/safety` | Safety | Data integrity, research honesty, account & access, known limitations |

| Folder | Role |
|---|---|
| `content/` | `sections.ts` (every section/engine: summary, steps, features, status, phase) and `glossary.ts` (metric definitions and formulas) — pages render from these |
| `components/ui/` | Primitives: section header, info hints, status pills, metric cards, data-source badges, states, slide-over, confirm dialog, icon buttons, pagination, `SymbolCombobox` (accessible type-ahead used by every symbol field) |
| `components/charts/` | Lightweight Charts wrapper (candles + lines, value readout/legend, UTC times) and SVG sparklines |
| `components/layout/` | App shell: sidebar navigation (menu drawer on narrow screens), status strip, theme toggle, copilot drawer |
| `lib/` | `cas.ts` (pdf.js reader, lazy chunk, same-origin worker, no WebAssembly) + `casParse.ts` (line grouping; rows built only from validated ISINs and the numbers beside them — quantity × price = value for demat, unit balance / cost value for funds; totals check), `pii.ts`, `csv.ts`, `portfolioImport.ts`, `symbolSearch.ts` (pure ranking over the offline catalog: ticker, alias, name prefix, any-order tokens, initials, one-typo tolerance), `useSymbolCatalog.ts` (lazy chunk loaded on first focus), `symbols.ts` (shared ticker pattern), session context, data hooks (stale-response protection, visibility-aware polling), formatters, recovery-oriented error copy, theme |
| `styles/` | Design tokens for light and dark themes; component styles |

Routes are code-split; the charting library loads only on pages with charts. All HTTP goes through `api.ts`.

## 4. Data model

| Collection / dict | Shape (key fields) |
|---|---|
| `users` | `_id`, `email` (unique), `name`, `password_hash`, `createdAt` |
| `sessions` | `_id` = SHA-256 of the token (`tokenHash`), `userId`, `expiresAt` (TTL-indexed in Mongo) |
| `simulations` | `_id`, `userId`, `symbol`, `strategy` (registry id), `params`, `config` (costBps, slippageBps, benchmark), `startingCapital` (INR), `status`, `statusHistory`, `startedAt`, `engineVersion`, `finalReport` (completed only), `notes`, `createdAt` |
| `training` | `_id` = `userId:SYMBOL` (one record per user+symbol), `strategy_id`, `payload` (full training result), `trained_at` |
| `backtests` | `_id`, `userId`, `symbol`, `strategy` {id, name, params}, `range`, `config` (capital, costs, slippage), `period`, `summary`, `equity` / `drawdown` / `buyHold` series (≤ 2,000 points each), `trades`, `assumptions`, `risk` (stored risk report), `benchmarkEquity`, `dataSource`, `createdAt` |

| `models` | `_id`, `userId`, `symbol`, `modelType`, `hyperparams`, `featureConfig`, `featureNames`, `label`, `range`, `split`, `labelDistribution`, `classification`, `strategy` (test-window backtest), `artifactId` (GridFS `model_artifacts` bucket), `artifactBytes`, `tracking`, `trainedAt` |

| `market_flows` | `_id` = `kind:date`, `kind` (fii_dii_cash / participant_oi / fpi_sector / sector_capex), `date`, `data`, `source`, `storedAt` — public market data, no user fields; indexed on (kind, date) |
| `portfolio_imports` | `_id`, `userId`, `source`, `rowCount`, `createdAt` |
| `holdings` | `_id`, `userId`, `importId`, `symbol`, `isin`, `schemeCode`, `name`, `exchange`, `currency`, `type`, `sector`, `assetType`, `quantity`, `avgCost`, `buyDate`, `createdAt` — allowlisted fields only; names/exchanges are looked up server-side |
| `research_datasets` | `_id` = content version (sha256), `universe`, `benchmarkSymbol`, `source`, `downloadedAt`, `period`, `symbolCount`, `excludedDates`, `benchmarkCoverage`, `coverage` (per symbol: first/last date, bars, missing / zero-volume sessions, dividends, splits), `coverageSummary`, `survivorshipBiased`, `caveats`, `conventions`, `blobId` (GridFS `research_snapshots`), `sizeBytes`, `storedAt` — shared research data, no user fields |
| `research_runs` | `_id`, `userId`, `kind` (run / comparison), `label`, `strategy` {id, name, params, metadata}, `dataset` {version, universe, survivorshipBiased}, `settings`, `costMultiplier`, `engineVersion`, `configHash`, `resultHash`, `period`, `summary` (incl. cost breakdown, turnover, dividends), `metrics`, `benchmark`, `series` (≤ 2,000 points each), `fills` (latest 3,000), `holdings` / `decisions` as [symbol, value] pairs, `orderEvents`, `pending`, `assumptions`, `caveats`, `comparisonId`; comparisons hold `rows` and rebased `series`; indexed on (userId, createdAt) |
| `ranking_experiments` | `_id`, `dataset`, `code`, `seed`, `config` (grid, horizon, split sizes, criteria), `settings`, `schemaHash`, `features`, `featureFamilies`, `target`, `split` (development / validation / holdout dates), `trials` (every candidate with its validation IC), `families` (ridge / hgb: validation and holdout IC with intervals, training cutoffs, promotion verdict, final-model gate), `validationTrading` / `holdoutTrading`, `holdoutUses`, `predictions` (walk-forward scores by date as [symbol, score] pairs), `artifactIds` (GridFS `ranking_models`), `storedAt` — shared research data, written only by the training script |
| `research_notes` | `_id`, `userId`, `kind` (note / backtest / model), `title`, `body`, `refId`, `symbol`, `tags`, `sentiment` {label, confidence, scores}, `embedding` (float list), `embeddingModel`, `createdAt` — indexed on (userId, createdAt) and (userId, kind, refId) |

## 5. API surface

### Implemented

All routes are prefixed with `/api`.

| Route | Purpose | Auth |
|---|---|---|
| `POST /auth/signup`, `POST /auth/login` | Account + session issuance (rate limited) | — |
| `POST /auth/logout` | Revoke the current session | ✓ |
| `POST /dev/auth/bypass` | Dev-only login bypass (`ENABLE_DEV_ENDPOINTS`, never in production) | — |
| `GET /market/watchlist`, `GET /market/quote/{symbol}` | Live quotes (rate limited) | ✓ |
| `GET /market/search?q=`, `GET /market/chart/{symbol}` | Search, OHLCV charts | ✓ |
| `GET/POST /simulations`, `PATCH/DELETE /simulations/{id}` | Simulation CRUD; validated lifecycle (active ⇄ paused → completed → archived) | ✓ |
| `GET /simulations/{id}`, `GET /simulations/{id}/report`, `GET /simulations/summaries` | One simulation, its live evaluation, card summaries | ✓ |
| `GET /analytics/overview`, `GET /analytics/sparkline`, `GET /analytics/training` | Dashboard aggregates, mini price series, past training runs | ✓ |
| `GET /status` | Operational snapshot for the console (no secrets) | ✓ |
| `GET /strategies` | Runnable strategies with parameter schemas | — |
| `POST /backtest/run`, `GET /backtests`, `GET /backtest/{id}`, `GET /backtest/{id}/risk`, `GET /backtest/{id}/trades` | Run, list, and inspect saved backtests and their risk reports | ✓ |
| `GET /ml/feature-catalog`, `POST /ml/features` | Feature catalog; leakage-free dataset preview | — / ✓ |
| `POST /ml/train`, `GET /ml/models`, `GET /ml/models/{id}`, `POST /ml/predict` | Train + register, list, inspect, live signal | ✓ |
| `GET /analytics/strategies` | Strategy catalog | — |
| `POST /analytics/train`, `POST /analytics/predict` | SMA training, momentum signal | ✓ |
| `POST /research/sentiment` | FinBERT sentiment for up to 20 texts | ✓ |
| `POST /research/notes`, `GET /research/notes`, `DELETE /research/notes/{id}` | Research memory: save (notes, or backtest/model summaries), list, delete | ✓ |
| `POST /research/rag/query` | Semantic search over your notes (cosine similarity) | ✓ |
| `POST /copilot/chat` | Copilot conversation streamed as Server-Sent Events (cites retrieved notes) | ✓ |
| `POST /copilot/action` | Structured action execution (backtest / train / simulation) | ✓ |
| `POST /chat` | Non-streaming copilot alias | ✓ |
| `GET /research-runs/datasets`, `GET /research-runs/datasets/{version}` | Research snapshots and their coverage | ✓ |
| `GET /research-runs/universes`, `GET /research-runs/fee-schedules`, `GET /research-runs/engine` | Universes with caveats, dated cost schedules with sources, engine version + assumptions | ✓ |
| `GET /research-runs/strategies`, `POST /research-runs`, `POST /research-runs/compare` | Universe strategies; run one; compare several on identical settings (+ baseline, + cost stress) | ✓ |
| `GET /research-runs`, `GET /research-runs/{id}`, `GET /research-runs/{id}/fills`, `GET /research-runs/{id}/holdings` | Saved runs and comparisons, fills with reasons, holdings as of a date | ✓ |
| `POST /research-runs/{id}/replay`, `GET /research-runs/{id}/export` | Deterministic replay check; artifact zip | ✓ |
| `GET /research-runs/models`, `GET /research-runs/models/{id}` | Stored ranking experiments and their full evaluation | ✓ |
| `GET /health` | Liveness | — |


## 6. Roadmap

| Phase | Focus | Status |
|---|---|---|
| 0 | Security hardening + deploy foundations — hashed session storage, logout/revocation, input validation, rate limiting, error hygiene, `/api` prefix, lazy store init, serverless-safe file handling | Done |
| 1 | Interactive research console — section-based UI (monitoring, engines, lab, history, safety) with in-context feature/metric explanations | Done |
| 2 | Backtesting engine — signal→trade conversion, costs/slippage, trade logs, equity & drawdown curves | Done |
| 3 | Risk analytics — Sharpe, Sortino, CAGR, volatility, beta, max drawdown, win rate, benchmark comparison | Done |
| 4 | Feature engineering — OHLCV → indicator matrices, leakage-free labels, time-series splits | Done |
| 5 | ML strategies — directional models, time-aware evaluation, model registry (artifacts in GridFS), ML signals through the backtester | Done |
| 6 | Copilot 2.0 — tool-calling assistant that runs backtests, trains models, explains results | Done |
| 7 | NLP research memory — FinBERT sentiment, embeddings stored on MongoDB documents, user-scoped retrieval (NumPy or Atlas Vector Search), copilot citations | Done |
| 8 | Production hardening — route modules, API + unit tests, CI, shared Redis cache and rate limits, structured logging, pinned dependencies, deployed-size budget, Docker Compose | Done |
| 9 | Cloud deployment — one Vercel project: static frontend + FastAPI as a Python function (`api/index.py`) under `/api`, region `bom1` next to MongoDB Atlas, deployment smoke test | Done — live at algo-trade-simulator-lovat.vercel.app |
| 10 | Portfolio analysis of real holdings — offline symbol catalog + company-name type-ahead; personal-data detectors and allowlist import (reject, never store); in-browser CAS reader (pdf.js, NSDL/CDSL/CAMS/KFintech, totals check); portfolio risk report with what-if/stress; copilot `analyze_portfolio` (aggregates only), chat masking, note refusal, research reports with a not-financial-advice disclaimer | Done (optional read-only broker sync not built) |
| 11 | Market intelligence data — FII/DII cash flows, participant-wise derivatives positioning, sector-wise FPI flows, sector index performance, company and sector capex, with daily capture and copilot tools | Done |
| 12 | Live paper-trading simulations — deterministic forward replay with next-open fills, live mark-to-market, FX for non-INR listings, buy-and-hold and index comparison, lifecycle with frozen final reports | Done |
| 13 | Strategy research upgrade — versioned research datasets, multi-asset portfolio engine with INR accounting and dated Indian transaction charges, cross-sectional momentum and volatility-managed trend following against equal-weight and index baselines, experiment tracking with deterministic replay, a walk-forward ML stock-ranking pilot, and a strategy comparison view | Done — offline steps (publishing a snapshot, evaluating the ranking holdout once) are run by the operator |

Build order rationale: make the finance core credible first (backtesting → risk), then ML workflows, then LLM/NLP as supporting intelligence layers, then packaging and deployment. The interactive console comes early so every engine ships its UI into one consistent design system.

**Deployment target.** The whole app deploys as one Vercel project: the Vite build is served as static files and the FastAPI app runs as a Python function (`api/index.py`) for every `/api/*` path on the same origin. The scientific Python stack installs to about 320 MB, inside Vercel's 500 MB limit for Python functions; Hobby functions get 2 GB / 1 vCPU and up to 300 s per request. The same API also ships as a Docker image for container hosts. This shapes the architecture from the first phase onward:

- No source-of-truth state in process memory — MongoDB (Atlas in production) for all persistence; the in-memory store is for local development and tests only.
- No writes outside the temp directory — trained model artifacts live in MongoDB GridFS; research-note embeddings live on MongoDB documents.
- Shared Redis (Upstash) for market-data caching and rate limiting when more than one instance runs; a single free instance uses process memory.
- Heavy ML/NLP models are served through hosted inference APIs rather than bundled into the function.
- Every endpoint finishes within a single request; no background jobs or websockets (the copilot streams over SSE).
- Production mode (`APP_ENV=production`, set by the image): strict database mode, JSON logs, proxy-aware client IPs, development routes disabled.

## 7. Configuration

No `.env` file is required to start; defaults run the whole app in development mode with `USE_IN_MEMORY_DB=true`.

| Group | Variables |
|---|---|
| Experiment tracking | `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, `MLFLOW_TRACKING_PASSWORD`, `MLFLOW_EXPERIMENT_NAME` |
| Storage | `MONGO_URL` (or `MONGODB_URI`/`MONGO_URI`), `MONGODB_DB`, `USE_IN_MEMORY_DB`, `STRICT_DB`, `MONGO_MAX_POOL_SIZE` |
| Copilot | `LLM_PROVIDER`, `LLM_PROVIDER_FALLBACKS`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`, `OPENAI_API_KEY`, `LLM_MODEL`, `<PROVIDER>_MODEL`, `LLM_MODEL_FALLBACKS`, `LLM_BASE_URL`, `LLM_API_KEY`, `OLLAMA_BASE_URL`, `OPENAI_TEMPERATURE` |
| Research NLP | `HF_TOKEN`, `SENTIMENT_MODEL`, `EMBEDDING_MODEL`, `NLP_PROVIDER`, `HF_INFERENCE_URL`, `ATLAS_VECTOR_INDEX` |
| Shared cache / limits | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) |
| Logging | `LOG_FORMAT`, `LOG_LEVEL` |
| General | `CORS_ORIGINS`, `FRONTEND_ORIGIN`, `SESSION_DURATION_DAYS`, `ENABLE_DEV_ENDPOINTS`, `YAHOO_USER_AGENT` |
| Rate limiting | `AUTH_RATE_LIMIT_PER_MINUTE`, `MARKET_RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_STORAGE_URI` |
| Frontend | `VITE_API_BASE_URL`, `VITE_ENABLE_LOGIN_BYPASS`, `VITE_LOGIN_BYPASS_EMAIL`, `VITE_LOGIN_BYPASS_NAME` |

> The backend loads `backend/.env` when present; variables already set in the process environment take precedence (hosted deployments set everything in their environment settings).

## 8. Commands

| Task | Command |
|---|---|
| Backend dev server | `uvicorn backend.main:app --reload --port 8000` (repo root) |
| Frontend dev server | `npm run dev` (port 5173, strict) |
| Type check | `npm run check` |
| Frontend build | `npm run build` |
| Backend syntax check | `python -m py_compile backend/main.py` |
| Connection checks (HF token, MongoDB) | `python scripts/check_connections.py` (`--hf`, `--mongo`); opt-in pytest: `LIVE_CHECKS=1 pytest backend/tests/test_live_connections.py` |
| Tests | `pip install -r backend/requirements-dev.txt`, then `pytest backend/tests` |
| Deployed size check | `python scripts/check_bundle_size.py` |
| Ranking experiment | `python scripts/research/train_ranking.py --dataset-version <version>` (validation only; `--evaluate-holdout` once; `--save` to store) |
| Research snapshot | `python scripts/build_research_snapshot.py --universe nifty100-current` (dry run; `--save` stores it in MongoDB) |
| Full local stack | `docker compose up --build` (http://localhost:8080) |

## 9. Current limitations (honest status)

- **Lab results are in-sample** — the Lab's quick trainer measures a zero-cost backtest over the same window it describes; use Backtests (with costs and longer history) for anything you'd rely on. Out-of-sample validation arrives with the feature pipeline.
- **Predictive edge is small** — on liquid large caps, next-day direction models typically land near the majority-class baseline; the interface reports this plainly rather than overstating results.
- **Fallback data during outages** — when Yahoo is unreachable, quotes/charts/search fall back to reference or synthetic values. They are always flagged in the payload and badged in the interface, but they are not real prices.
- **Store fallback outside strict mode** — without `STRICT_DB`, an unreachable MongoDB makes the server log a warning and run in-memory; data appears to save but vanishes on restart. Strict mode is on by default in hosted deployments.
- **Sentiment reads wording, not markets** — FinBERT scores the tone of text; it is not a return forecast, and generated backtest/model summaries are not scored.
- **Daily price quirks** — Yahoo publishes flat, zero-volume bars on some NSE holidays; backtests and simulations currently treat them as trading days, so a signal on the eve of a holiday fills at the previous close. Primary-source bars are adjusted for splits and dividends, but the backup source adjusts for splits only, so long-window results can differ slightly depending on which source answered. Both are scheduled to be addressed with the research-data work in Phase 13.
- **ML ranking pilot** — on the Nifty 100 snapshot the models show no reliable ranking skill in validation (mean rank IC about zero, intervals spanning zero); they stay research results. The holdout has not been evaluated in the published configuration. Monthly retraining over ten years takes about 10–15 s offline; training never runs inside a web request.
- **Strategy research results** — the bundled strategies are research methods with starting-point parameters, not tuned or validated; on the Nifty 100 snapshot neither beats the equal-weight universe on a risk-adjusted basis, and all universe results (baseline included) are flattered by survivorship bias. The index line is the Nifty 50 price index (no dividends, not tradable). Comparisons store the latest 3,000 fills per run.
- **Research data limits** — research universes are today's Nifty 50 / Nifty 100 members applied to the past (survivorship-biased, labelled everywhere); most delisted NSE stocks are not available from Yahoo; sectors are today's classification. Statutory charges are exact from October 2024 and approximated before it; brokerage defaults to zero (delivery) and is a per-run choice. Dividends are credited as cash, before any tax.
- **Long/flat only** — backtests and simulations hold either a full long position or cash; no shorting, leverage, or position scaling yet.
- **Portfolio report** — risk figures describe the current mix applied to past prices ("as held"), not the account's actual history; holdings with under 60% price coverage in the window are left out of the risk figures and listed; US listings have no sector tag; fund history comes from a public AMFI mirror; at most 100 holdings per import.
- **Market-flow sources** — NSE and NSDL are public websites, not APIs: NSE may refuse requests from cloud servers and NSDL is sometimes slow, so data can be unavailable on a given day (reported as such). FII/DII cash history exists only from the day capture started; positioning and sector reports can be backfilled. Yahoo has price history for only a few NSE sector indices. Capex is annual and lags by months.
- **CAS layouts** — the reader targets the NSDL / CDSL eCAS and CAMS / KFintech CAS layouts and is tested on synthetic statements in those formats; a layout it can't read is reported and the CSV route offered. Demat statements show market value, not cost, so P&L and XIRR need costs entered in the preview.
- **Personal-data detection** — pattern and checksum based (PAN, Aadhaar, demat/BO, bank account, IFSC, email, phone, UPI, and dates in structured fields); names and addresses can't be pattern-matched and are excluded structurally (no free-text field, unmatched columns never uploaded).
- **Simulation sessions** — simulations use regular exchange hours for NSE, NYSE/Nasdaq and London and don't model exchange holidays; fills use daily bars (next session open), not intraday prices. Up to 20 running simulations are valued on the list page per request.
- **No browser end-to-end tests in CI** — CI runs the backend unit and API tests plus the frontend type check and build; interface checks are run manually.
- **Rate limits are per process without Redis** — when Upstash isn't configured, each server instance counts separately; with Redis unreachable, limits fail open.
- **Untyped responses** — request bodies are Pydantic models, but most responses are plain dictionaries, so the OpenAPI schema doesn't describe response shapes and frontend types are maintained by hand.
- **Serverless cold starts** — the first request to a new function instance loads pandas / NumPy / scikit-learn (a few seconds); Yahoo Finance may rate-limit cloud IPs (fallback quotes are flagged).
- **Per-instance limits without Redis** — without Upstash, each function instance keeps its own rate-limit counters and market-data cache.

## 10. Repository layout

```
Algo-Trade-Simulator/
├── backend/
│   ├── main.py              # App assembly: middleware + routers
│   ├── api/                 # Route modules (auth, market, analytics, simulations, backtests, ml, copilot, system)
│   ├── config.py            # Settings, .env loading, platform detection
│   ├── deps.py / stores.py  # Dependencies; MongoDB + in-memory stores
│   ├── logging_config.py    # Structured logs, request ids
│   ├── models/              # Pydantic request models, shared validated types
│   ├── services/            # Market data, backtesting, rate limiting, Upstash, copilot, registry, tracking
│   ├── strategies/ analytics/ ml/ llm/
│   ├── tests/               # pytest suite
│   ├── requirements*.txt    # deployed / dev / local-ml
│   └── test.py              # MongoDB connectivity check
├── deploy/ scripts/ .github/ # nginx config, size check, CI
├── Dockerfile / Dockerfile.client / docker-compose.yml
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx         # Vite entrypoint
│       ├── App.tsx          # Router, lazy routes, auth gate
│       ├── api.ts           # All HTTP
│       ├── types.ts
│       ├── content/         # Section descriptions, glossary
│       ├── lib/             # Session, hooks, formatting, theme
│       ├── styles/          # Tokens + component styles
│       ├── pages/           # One module per route
│       └── components/      # ui/, charts/, layout/, copilot/
├── project_overview.md      # This document
├── README.md
├── package.json / tsconfig.json / vite.config.ts
└── (planned) backend/{services,strategies,ml,llm,analytics,tests}/, api/index.py, vercel.json, .github/workflows/, optional Dockerfile + docker-compose.yml
```
