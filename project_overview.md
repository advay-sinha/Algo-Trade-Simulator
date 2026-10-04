# Algo Trade Lab — Project Overview

A full-stack quantitative research and trading simulation platform. Users research live markets, create simulated portfolio runs, train and inspect trading strategies, and consult a research chat copilot — without risking real capital. The project is evolving from a trading simulator into a modular quant research platform with backtesting, risk analytics, ML strategy pipelines, and LLM-assisted research.

---

## 1. System architecture

```
┌────────────────────────┐        HTTP (fetch, bearer token)        ┌─────────────────────────────┐
│  React + Vite + TS SPA │ ───────────────────────────────────────▶ │  FastAPI backend (port 8000)│
│  (port 5173)           │ ◀─────────────────────────────────────── │  backend/main.py            │
└────────────────────────┘                                          └──────────┬──────────────────┘
      │                                                                        │
      │ localStorage: "algo-trade-session"                     ┌───────────────┼───────────────────┐
      ▼                                                        ▼               ▼                   ▼
  session persistence                                   ┌────────────┐  ┌─────────────┐  ┌──────────────────┐
                                                        │  MongoDB   │  │ Yahoo       │  │ OpenAI Chat      │
                                                        │ (or in-    │  │ Finance     │  │ Completions      │
                                                        │  memory)   │  │ (yfinance → │  │ (optional; chat  │
                                                        └────────────┘  │  raw HTTP → │  │  degrades w/o key│
                                                                        │  offline)   │  └──────────────────┘
                                                                        └─────────────┘
```

- **Single origin** — every backend route lives under `/api`. In development the Vite dev server proxies `/api` to port 8000; in production the SPA and API are served from one domain. The client uses the relative `/api` base (`VITE_API_BASE_URL` overrides it only for a separately hosted API), so no CORS configuration is needed in either case.
- **Auth**: bearer tokens (random 32-byte urlsafe), issued at signup/login, 7-day expiry, revoked by logout, checked by a FastAPI dependency on protected routes. Only the SHA-256 hash of each token is stored. Signup/login are rate limited per client IP.
- **Persistence**: MongoDB via Motor (async), with a drop-in `InMemoryStore` for zero-setup development. The store is created lazily on the first request (no startup hooks) and cached per process; `STRICT_DB` turns database unavailability into HTTP 503 instead of a silent in-memory fallback. Both stores implement the same implicit interface (users, sessions, simulations, training records).
- **Market data fallback chain**: `yfinance` → raw `query1.finance.yahoo.com` HTTP → hardcoded offline quotes / synthetic charts. Keeps the UI alive during rate limits or outages.

## 2. Backend (`backend/main.py`, single file today)

| Concern | What exists |
|---|---|
| Settings | `backend/config.py` — loads `backend/.env` (process env wins), Pydantic `Settings`, platform detection (`VERCEL`, `VERCEL_ENV`); Mongo DSN resolution `MONGO_URL` → `MONGODB_URI` → `MONGO_URI` → localhost default |
| Auth | Signup/login/logout with bcrypt (passlib), hashed bearer sessions (`services/auth_tokens.py`), password policy (≥ 8 chars, common passwords rejected), per-IP rate limiting (`services/rate_limiter.py`), dev-bypass endpoint gated by `ENABLE_DEV_ENDPOINTS` and always off in production |
| Stores | `InMemoryStore` (asyncio-locked dicts) and `MongoStore` (Motor, small pool, 5 s server-selection timeout); created lazily via the `get_store` dependency; Mongo failure → 503 under `STRICT_DB`, otherwise in-memory with a log warning |
| Validation | `models/common.py` — symbol pattern `^[A-Za-z0-9.^=\-]{1,20}$`, chart range/interval enums, simulation status enum; enforced before any outbound request |
| Market data | `services/market_data_service.py` — quotes, search, OHLCV charts, watchlist batching, three-level fallback chain; async accessors run the sync clients in worker threads behind a TTL cache (15 s quotes, 5 min daily charts; live data only) |
| Strategies | `strategies/` — common interface (`generate_signals(bars, params)` → long/flat series using data ≤ t) and registry: SMA crossover, time-series momentum, mean reversion; parameters validated by per-strategy Pydantic models |
| Features & datasets | `ml/features.py` (9 backward-looking feature generators, serializable config) and `ml/datasets.py` (forward labels, single NaN drop, date-ordered split with embargo ≥ max(1, horizon)); `services/feature_service.py` builds previews off the event loop |
| ML models | `ml/training.py` (logistic / random forest / histogram gradient boosting, fixed seed, scikit-learn imported lazily), `ml/evaluation.py` (classification vs majority baseline + cost-aware test-window backtest), `ml/inference.py` (live signal from stored feature config), `strategies/ml_directional.py` (model as a strategy), `services/model_registry_service.py`, optional `services/experiment_tracking.py` (MLflow REST, no client library) |
| Risk analytics | `analytics/metrics.py` (pure metric functions, annualization constants, NaN-safe sanitizing) and `analytics/risk.py` (report: strategy metrics, drawdown episode, buy-and-hold, benchmark over identical days, beta/alpha/correlation); computed once at run time and stored with the backtest |
| Backtesting | `services/backtesting_service.py` — next-bar-open fills, whole-share sizing, commission + slippage in bps on every fill, equity / drawdown / buy-and-hold series, trade log with open position marked to market, deterministic |
| Lab trainer | `/analytics/train` runs a zero-cost SMA crossover backtest over 6 months (in-sample) and reports real return, CAGR, drawdown, Sharpe, win rate; naive 5-day-momentum live signal; training-run listing |
| Market provenance | Every quote, chart, search result, and sparkline carries `source` (`live` / `offline` / `synthetic`); fallbacks are gated by `ALLOW_OFFLINE_MARKET_DATA`; `/api/status` reports the last observed source per server instance |
| Copilot | `llm/tools.py` (10 LangChain `StructuredTool`s built per request with the user's id/store in a closure), `llm/langchain_agent.py` (tool-calling loop, 5-call budget, every call answered), `llm/prompts.py`, `services/copilot_service.py` (model fallbacks on rate limits, SSE event stream, provider-error masking); shared action code in `services/research_actions.py` so REST and tools use one path |
| Simulations | Per-user CRUD (create / list / patch status+notes / delete) |

The backend is scheduled to split into `services/`, `strategies/`, `ml/`, `llm/`, and `analytics/` packages as the roadmap lands (see §6).

## 3. Frontend (`client/src/`)

A section-based research console. Every page follows the same anatomy: a summary header (what the section does, its status, and "how it works" steps), feature and metric cards with explanations that open on hover, keyboard focus, or tap, and explicit loading / empty / error / fallback-data / planned states.

| Route | Section | Layout |
|---|---|---|
| `/` | Overview | Dashboard: key figures, watchlist trends, recent simulations, section directory |
| `/monitor` | Live monitoring | Range + symbol filters, key figures, candlestick chart, 30-second quote table |
| `/engines`, `/engines/:id` | Engines | Engine list; each engine has Overview / Workbench (or "What's coming") / Glossary tabs |
| `/lab` | Training · testing · validation | Parameters → run → metrics, price-with-averages chart, validation status, signal |
| `/lab/datasets` | Dataset builder | Parameters + feature groups → shape, split timeline (train / embargo / test), label balance, train-set feature stats, first/last rows |
| `/lab/models`, `/lab/models/:id` | Model lab | Train form → honest verdict, KPIs vs baseline, split timeline, test-window backtest vs buy-and-hold, confusion matrix, per-class table; registry with live signals; detail page (Report / Signal / Configuration) |
| `/backtests`, `/backtests/:id` | Backtests | Run form → KPIs, equity vs buy-and-hold vs benchmark, drawdown, risk report, trade log, assumptions; saved runs open in a tabbed detail page (Performance / Risk / Trades / Assumptions) |
| `/simulations` | Simulations | Searchable, filterable table; create in a slide-over; named delete confirmation |
| `/history`, `/history/prices` | History | Research records list; daily price history with chart, table, and CSV export |
| `/safety` | Safety | Data integrity, research honesty, account & access, known limitations |

| Folder | Role |
|---|---|
| `content/` | `sections.ts` (every section/engine: summary, steps, features, status, phase) and `glossary.ts` (metric definitions and formulas) — pages render from these |
| `components/ui/` | Primitives: section header, info hints, status pills, metric cards, data-source badges, states, slide-over, confirm dialog, icon buttons, pagination |
| `components/charts/` | Lightweight Charts wrapper (candles + lines, value readout/legend, UTC times) and SVG sparklines |
| `components/layout/` | App shell: sidebar navigation (menu drawer on narrow screens), status strip, theme toggle, copilot drawer |
| `lib/` | Session context, data hooks (stale-response protection, visibility-aware polling), formatters, recovery-oriented error copy, theme |
| `styles/` | Design tokens for light and dark themes; component styles |

Routes are code-split; the charting library loads only on pages with charts. All HTTP goes through `api.ts`.

## 4. Data model

| Collection / dict | Shape (key fields) |
|---|---|
| `users` | `_id`, `email` (unique), `name`, `password_hash`, `createdAt` |
| `sessions` | `_id` = SHA-256 of the token (`tokenHash`), `userId`, `expiresAt` (TTL-indexed in Mongo) |
| `simulations` | `_id`, `userId`, `symbol`, `strategy`, `startingCapital`, `status`, `notes`, `createdAt` |
| `training` | `_id` = `userId:SYMBOL` (one record per user+symbol), `strategy_id`, `payload` (full training result), `trained_at` |
| `backtests` | `_id`, `userId`, `symbol`, `strategy` {id, name, params}, `range`, `config` (capital, costs, slippage), `period`, `summary`, `equity` / `drawdown` / `buyHold` series (≤ 2,000 points each), `trades`, `assumptions`, `risk` (stored risk report), `benchmarkEquity`, `dataSource`, `createdAt` |

| `models` | `_id`, `userId`, `symbol`, `modelType`, `hyperparams`, `featureConfig`, `featureNames`, `label`, `range`, `split`, `labelDistribution`, `classification`, `strategy` (test-window backtest), `artifactId` (GridFS `model_artifacts` bucket), `artifactBytes`, `tracking`, `trainedAt` |

Planned collections as the roadmap lands: research notes (user-scoped), vector-index doc mappings.

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
| `GET/POST /simulations`, `PATCH/DELETE /simulations/{id}` | Simulation CRUD (status: active / paused / completed / archived) | ✓ |
| `GET /analytics/overview`, `GET /analytics/sparkline`, `GET /analytics/training` | Dashboard aggregates, mini price series, past training runs | ✓ |
| `GET /status` | Operational snapshot for the console (no secrets) | ✓ |
| `GET /strategies` | Runnable strategies with parameter schemas | — |
| `POST /backtest/run`, `GET /backtests`, `GET /backtest/{id}`, `GET /backtest/{id}/risk`, `GET /backtest/{id}/trades` | Run, list, and inspect saved backtests and their risk reports | ✓ |
| `GET /ml/feature-catalog`, `POST /ml/features` | Feature catalog; leakage-free dataset preview | — / ✓ |
| `POST /ml/train`, `GET /ml/models`, `GET /ml/models/{id}`, `POST /ml/predict` | Train + register, list, inspect, live signal | ✓ |
| `GET /analytics/strategies` | Strategy catalog | — |
| `POST /analytics/train`, `POST /analytics/predict` | SMA training, momentum signal | ✓ |
| `POST /copilot/chat` | Copilot conversation streamed as Server-Sent Events | ✓ |
| `POST /copilot/action` | Structured action execution (backtest / train / simulation) | ✓ |
| `POST /chat` | Non-streaming copilot alias | ✓ |
| `GET /health` | Liveness | — |

### Planned (per roadmap)

`POST /research/sentiment`, `POST /research/notes`, `POST /research/rag/query`.

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
| 7 | NLP research memory — financial sentiment, embeddings stored in MongoDB with vector retrieval over notes/reports | Planned |
| 8 | Production hardening — pytest suite, CI, shared Redis cache, structured logging, dependency modernization, optional Docker | Planned |
| 9 | Cloud deployment — Vercel (static frontend + FastAPI serverless function, same origin), MongoDB Atlas, managed Redis | Planned |

Build order rationale: make the finance core credible first (backtesting → risk), then ML workflows, then LLM/NLP as supporting intelligence layers, then packaging and deployment. The interactive console comes early so every engine ships its UI into one consistent design system.

**Deployment target.** The platform is designed to run on Vercel as a single project: the Vite build is served as static files and the FastAPI app runs as a Python serverless function under `/api` on the same origin. This shapes the architecture from the first phase onward:

- No source-of-truth state in process memory — MongoDB (Atlas in production) for all persistence; the in-memory store is for local development and tests only.
- No writes outside the temp directory — trained model artifacts live in MongoDB GridFS; research-note embeddings live on MongoDB documents.
- Shared Redis for market-data caching and rate limiting across instances.
- Heavy ML/NLP models are served through hosted inference APIs rather than bundled into the function.
- Every endpoint is sized to finish within a single function invocation.

## 7. Configuration

No `.env` file is required to start; defaults run the whole app in development mode with `USE_IN_MEMORY_DB=true`.

| Group | Variables |
|---|---|
| Experiment tracking | `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, `MLFLOW_TRACKING_PASSWORD`, `MLFLOW_EXPERIMENT_NAME` |
| Storage | `MONGO_URL` (or `MONGODB_URI`/`MONGO_URI`), `MONGODB_DB`, `USE_IN_MEMORY_DB`, `STRICT_DB`, `MONGO_MAX_POOL_SIZE` |
| Copilot | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_FALLBACKS`, `OPENAI_TEMPERATURE`, `OPENAI_BASE_URL`, `OPENAI_ORG` |
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
| Mongo connectivity check | `python backend/test.py` |

## 9. Current limitations (honest status)

- **Lab results are in-sample** — the Lab's quick trainer measures a zero-cost backtest over the same window it describes; use Backtests (with costs and longer history) for anything you'd rely on. Out-of-sample validation arrives with the feature pipeline.
- **Predictive edge is small** — on liquid large caps, next-day direction models typically land near the majority-class baseline; the interface reports this plainly rather than overstating results.
- **Fallback data during outages** — when Yahoo is unreachable, quotes/charts/search fall back to reference or synthetic values. They are always flagged in the payload and badged in the interface, but they are not real prices.
- **Store fallback outside strict mode** — without `STRICT_DB`, an unreachable MongoDB makes the server log a warning and run in-memory; data appears to save but vanishes on restart. Strict mode is on by default when deployed to Vercel.
- **Partly modular backend** — configuration, validation, market data, strategies, backtesting, rate limiting, and token hashing are separate modules; routes and stores still live in `main.py` pending the final split.
- **Long/flat only** — backtests hold either a full long position or cash; no shorting, leverage, or position scaling yet.
- **Unit tests, no CI yet** — a pytest suite covers features (leakage), backtesting accounting, and risk metrics; API tests and CI arrive in Phase 8.
- **Rate limits are per process** — limits are kept in memory, so multiple server instances each count separately until shared Redis storage lands (Phase 8).
- **Deployment configuration pending** — the code is serverless-ready (lazy store, `/api` prefix, temp-dir-only caches), but deployment files land in Phase 9.

## 10. Repository layout

```
Algo-Trade-Simulator/
├── backend/
│   ├── main.py              # FastAPI app: routes, stores, market data, analytics, chat
│   ├── config.py            # Settings, .env loading, platform detection
│   ├── models/common.py     # Shared validated types
│   ├── services/            # rate_limiter.py, auth_tokens.py
│   ├── requirements.txt
│   └── test.py              # MongoDB connectivity check
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
