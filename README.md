# Algo Trade Lab

A full-stack quantitative research and trading simulation platform for developing, testing, and monitoring algorithmic trading strategies without risking real capital. The system pairs a FastAPI backend with a React + Vite + TypeScript frontend, sources live market data from Yahoo Finance, persists research in MongoDB, and includes a research chat copilot.

The project is evolving from a trading simulator into a modular quant research platform — see the [Roadmap](#roadmap) for what is implemented today versus planned.

## Current features

- **Interactive research console** — a section-based interface: overview dashboard, live monitoring, one page per engine, a training/testing/validation lab, research history, price history with CSV export, and a safety page. Every section opens with a summary and "how it works" steps, and every metric and control has an explanation available on hover, keyboard focus, or tap. Light and dark themes; works from phone to desktop widths.
- **Live market data** — quotes refreshed every 30 seconds while visible, ticker search, candlestick charts, and sparklines for any searchable symbol. Every value carries a source flag (`live`, `offline`, `synthetic`), and anything that isn't live is visibly badged.
- **Backtesting engine** — replay SMA crossover, time-series momentum, or mean-reversion strategies over 6 months to 5 years of daily bars. Signals execute at the next day's open (no lookahead), every fill pays commission and slippage, and each run reports equity vs buy-and-hold, drawdown, a full trade log, and its assumptions. Runs are saved per user.
- **Risk analytics** — every backtest stores a risk report computed from the post-cost equity curve: Sharpe, Sortino, CAGR, annualized volatility, max drawdown with its duration, win rate and profit factor from the trade log, plus beta, alpha, and correlation against a benchmark index (SPY by default, ^NSEI for Indian listings) over the identical trading days, with a configurable risk-free rate. Metrics that can't be computed honestly are returned as null with a reason — never NaN.
- **Feature engineering & dataset builder** — turn daily bars into a model-ready dataset: returns, lagged returns, rolling volatility, RSI, MACD, Bollinger position, moving-average ratios, volume, and momentum features; direction, return-bucket, or volatility-regime labels with a configurable horizon; and a time-ordered train / embargo / test split. Every feature uses only past data and every label only future data (enforced by automated tests). The preview reports shape, split boundaries, label balance, and training-set feature statistics.
- **ML model lab** — train logistic regression, random forest, or gradient-boosting classifiers on the leakage-free datasets. Each run is judged on a later, unseen window: accuracy next to the majority-class baseline, ROC-AUC, precision / recall / F1, a confusion matrix, and a cost-aware backtest of the model's signals against buy-and-hold. Every run is saved in a per-user model registry (features, window, hyperparameters, metrics, artifact) and can produce a live signal traceable to the exact model. Optional MLflow experiment tracking (works with a free hosted DagsHub tracking server).
- **Strategy lab** — a quick zero-cost SMA crossover backtest over six months of daily data with real (in-sample) return, drawdown, Sharpe, and win rate, a price-with-averages chart, and a naive momentum signal.
- **Simulations** — create, track, update, and delete simulated portfolio runs per user.
- **Accounts & sessions** — email/password signup and login, bcrypt-hashed passwords, bearer-token sessions with 7-day expiry, server-side logout, session tokens stored only as SHA-256 hashes, and per-client rate limiting on authentication.
- **Analytics dashboard** — simulation totals, trained strategies, recent simulations, and one-month watchlist trends.
- **Research copilot (tool-calling)** — a LangChain agent on OpenAI chat models that runs real platform tools on your behalf: quotes, price history, backtests (saved), backtest reports, model training (registered), model signals, portfolio summaries, and simulation creation. Tool activity streams to the interface as it happens; every saved action is listed under the reply with a link. Tools run as the signed-in user with the same validation as the forms, at most five tool calls per message, and provider errors are never shown raw.
- **Flexible persistence** — MongoDB (Atlas or local) for durable storage, or a zero-setup in-memory mode for local development; a strict mode refuses to run without the database instead of silently losing data.
- **Input hardening** — ticker symbols, chart ranges, and simulation states are validated before any outbound request; error responses never expose internal details.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, React Router, Radix UI primitives (dialog, popover, tabs, tooltip), TradingView Lightweight Charts |
| Backend | FastAPI, Pydantic, Motor (async MongoDB), Passlib |
| Database | MongoDB — optional in-memory fallback for development |
| Market data | Yahoo Finance via `yfinance` with raw-API and offline fallbacks |
| Copilot | LangChain (langchain-core, langchain-openai) tool-calling over OpenAI chat models, streamed via Server-Sent Events |

## Project structure

```
Algo-Trade-Simulator/
├── backend/                 # FastAPI service
│   ├── main.py              # App entrypoint, routes, stores, market data
│   ├── config.py            # Settings, .env loading, platform detection
│   ├── models/common.py     # Shared validated types (symbols, statuses, password policy)
│   ├── models/backtest.py   # Backtest request model
│   ├── services/            # Market data (cached, async), backtesting engine, rate limiting, token hashing
│   ├── strategies/          # Strategy interface + registry: buy-and-hold, SMA crossover, momentum, mean reversion
│   ├── analytics/           # Risk metrics (metrics.py) and risk report assembly (risk.py)
│   ├── ml/                  # Features, datasets, training, evaluation, inference
│   ├── llm/                 # Copilot tools, prompts, tool-calling loop
│   ├── tests/               # pytest suite (features, backtesting, metrics, ML, experiment tracking)
│   ├── requirements-dev.txt # Test-only dependencies
│   ├── requirements.txt     # Python dependencies
│   └── test.py              # MongoDB connectivity check
├── client/                  # React + Vite frontend
│   ├── index.html
│   └── src/
│       ├── main.tsx         # Vite entrypoint
│       ├── App.tsx          # Router, lazy-loaded routes, auth gate
│       ├── api.ts           # Backend API client (all HTTP goes through here)
│       ├── types.ts         # Shared TypeScript types
│       ├── content/         # Section descriptions and the metric glossary
│       ├── lib/             # Session, data hooks, formatting, errors, theme
│       ├── styles/          # Design tokens (light/dark) and component styles
│       ├── pages/           # One module per route
│       └── components/      # ui/ primitives, charts/, layout/ shell, copilot/ drawer
├── package.json             # Frontend scripts & dependencies
├── vite.config.ts
├── tsconfig.json
├── project_overview.md      # Architecture, API surface, data model, roadmap detail
└── README.md
```

As the roadmap progresses, the backend continues splitting into modules: `ml/` (features, training, inference, registry), `llm/` (copilot tools), `analytics/` (risk, metrics, reports), and `tests/`.

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB is **optional** — in-memory mode needs no database at all.

### Backend

1. Create a virtual environment and install dependencies:
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate        # Windows
   # source venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   ```
2. Start the API from the repository root:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```
   For a zero-setup run, set `USE_IN_MEMORY_DB=true` first — everything works, data resets on restart.

   The API serves under `http://localhost:8000/api` with Swagger docs at `/api/docs`.

### Frontend

1. From the repository root:
   ```bash
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173`. The dev server proxies `/api` to the backend on port 8000, so the browser talks to a single origin — no CORS setup needed.

## Configuration

**You do not need any `.env` file to start.** The defaults run the full app in development mode. Create configuration only when you enable the specific service that needs it.

The backend reads `backend/.env` on startup when present. Variables already set in the process environment take precedence, so hosted deployments configure everything through their environment settings.

### When you want durable storage (MongoDB)

Create `backend/.env` (or export the variables) once you have a MongoDB instance:

| Variable | Description | Default |
|---|---|---|
| `MONGO_URL` | MongoDB connection string (also accepts `MONGODB_URI` / `MONGO_URI`) | `mongodb://localhost:27017` |
| `MONGODB_DB` | Database name | `algo-trade-simulator` |
| `USE_IN_MEMORY_DB` | Skip MongoDB entirely; ephemeral storage | `false` |

| `STRICT_DB` | Fail requests with 503 instead of falling back to in-memory storage when MongoDB is unavailable | `false` locally, `true` on Vercel |
| `MONGO_MAX_POOL_SIZE` | Connection pool size per process | `5` |

Verify connectivity with `python backend/test.py`. The database connection is created on the first request. Without `STRICT_DB`, an unreachable MongoDB logs a warning and the server falls back to the in-memory store — check the log to confirm which store is active.

### When you want the chat copilot

The copilot needs an OpenAI API key. Add to `backend/.env`:

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | API key from platform.openai.com | unset (chat replies with a "not configured" notice) |
| `OPENAI_MODEL` | Chat model identifier | `gpt-4o-mini` |
| `OPENAI_MODEL_FALLBACKS` | Comma-separated backup models tried on rate limits | unset |
| `OPENAI_TEMPERATURE` | Sampling temperature | `0.3` |
| `OPENAI_BASE_URL` / `OPENAI_ORG` | Optional endpoint/organization overrides | unset |

Every other feature works without this key.

### General backend options

| Variable | Description | Default |
|---|---|---|
| `CORS_ORIGINS` | Comma-separated allowed origins (only needed when the frontend is served from a different origin) | unset |
| `FRONTEND_ORIGIN` | Single allowed origin used when `CORS_ORIGINS` is unset | `http://localhost:5173` |
| `SESSION_DURATION_DAYS` | Session lifetime | `7` |
| `ENABLE_DEV_ENDPOINTS` | Enables the development login-bypass route — local dev only; always disabled in production deployments | `false` |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Signup / login attempts allowed per client per minute (each route separately) | `5` |
| `MARKET_RATE_LIMIT_PER_MINUTE` | Watchlist / quote requests allowed per client per minute | `60` |
| `ALLOW_OFFLINE_MARKET_DATA` | Serve clearly flagged fallback quotes/charts when the provider is unreachable; `false` returns an error instead | `true` |
| `RATE_LIMIT_STORAGE_URI` | Rate-limit storage backend (`memory://` today; shared storage planned for multi-instance hosting) | `memory://` |
| `YAHOO_USER_AGENT` | User-Agent for Yahoo Finance requests | preset |

### When you want experiment tracking (MLflow)

Training runs can also be logged to any MLflow tracking server. A free option is a [DagsHub](https://dagshub.com) repository, which provides a hosted MLflow server per repo. Add to `backend/.env` (or the hosting provider's environment settings):

| Variable | Description | Default |
|---|---|---|
| `MLFLOW_TRACKING_URI` | Tracking server URL, e.g. `https://dagshub.com/<user>/<repo>.mlflow` | unset (tracking off) |
| `MLFLOW_TRACKING_USERNAME` | Tracking server username (DagsHub: your username) | unset |
| `MLFLOW_TRACKING_PASSWORD` | Tracking server password or token (DagsHub: an access token) | unset |
| `MLFLOW_EXPERIMENT_NAME` | Experiment runs are grouped under | `algo-trade-lab` |

Models are always trained and saved without it; tracking is a best-effort extra.

### Frontend (`client/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | API base URL — leave unset to use the same-origin `/api` path | `/api` |
| `VITE_ENABLE_LOGIN_BYPASS` | Auto-sign-in via the dev bypass (needs `ENABLE_DEV_ENDPOINTS=true` on the backend) | `false` |
| `VITE_LOGIN_BYPASS_EMAIL` / `VITE_LOGIN_BYPASS_NAME` | Identity used by the bypass session | backend defaults |

## API overview

All routes are served under the `/api` prefix. Authenticated routes expect `Authorization: Bearer <token>`; tokens are issued by signup/login, expire after 7 days (configurable), and are revoked by logout. Authentication and quote routes are rate limited per client (HTTP 429 with `Retry-After`).

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/auth/signup` | Register and receive a session token (password ≥ 8 characters) | — |
| `POST /api/auth/login` | Authenticate an existing user | — |
| `POST /api/auth/logout` | Revoke the current session | ✓ |
| `GET /api/market/watchlist` | Live quotes for a symbol list | ✓ |
| `GET /api/market/quote/{symbol}` | Single quote | ✓ |
| `GET /api/market/search?q=` | Ticker/exchange search | ✓ |
| `GET /api/market/chart/{symbol}` | OHLCV chart data (range/interval params) | ✓ |
| `GET /api/simulations` / `POST /api/simulations` | List / create simulations | ✓ |
| `PATCH /api/simulations/{id}` / `DELETE /api/simulations/{id}` | Update (status: active / paused / completed / archived) / remove a simulation | ✓ |
| `GET /api/analytics/overview` | Dashboard aggregates | ✓ |
| `GET /api/analytics/strategies` | Built-in strategy catalogue | — |
| `GET /api/strategies` | Strategies the backtester can run, with parameter schemas | — |
| `POST /api/backtest/run` | Run and save a backtest (symbol, strategy, params, range, capital, costs, slippage, optional benchmark and risk-free rate); returns the result with its risk report | ✓ |
| `GET /api/backtests` | Your saved backtests (summaries) | ✓ |
| `GET /api/backtest/{id}` | One saved backtest with equity, drawdown, and buy-and-hold series | ✓ |
| `GET /api/backtest/{id}/risk` | Stored risk report: metrics, drawdown episode, buy-and-hold and benchmark comparison | ✓ |
| `GET /api/backtest/{id}/trades` | Trade log of a saved backtest | ✓ |
| `POST /api/analytics/train` | Lab: zero-cost SMA crossover backtest on 6 months of daily data | ✓ |
| `POST /api/analytics/predict` | Lab signal: from your latest ML model for the symbol when one exists, otherwise naive momentum (labeled) | ✓ |
| `GET /api/analytics/sparkline` | Compact price series for the watchlist | ✓ |
| `GET /api/analytics/training` | Past training runs, newest first | ✓ |
| `GET /api/ml/feature-catalog` | Feature generators with groups, descriptions, defaults | — |
| `POST /api/ml/features` | Build a leakage-free dataset preview (features, label, split, balance); nothing stored | ✓ |
| `POST /api/ml/train` | Train, evaluate on the unseen window, and register a model | ✓ |
| `GET /api/ml/models` / `GET /api/ml/models/{id}` | Model registry list / full report | ✓ |
| `POST /api/ml/predict` | Live signal from a registered model (by id, or latest for a symbol) | ✓ |
| `GET /api/status` | Operational snapshot: store type, market-data source health, copilot configured, rate limits (no secrets) | ✓ |
| `POST /api/copilot/chat` | Copilot conversation, streamed as Server-Sent Events (tool start/end, reply, saved actions) | ✓ |
| `POST /api/copilot/action` | Run one structured action (`run_backtest`, `train_model`, `create_simulation`) without free-text parsing | ✓ |
| `POST /api/chat` | Non-streaming copilot reply (compatibility alias) | ✓ |
| `GET /api/health` | Liveness check | — |

## Roadmap

Development proceeds in phases; each phase ships working, verifiable functionality before the next begins.

| Phase | Focus | Key deliverables | Status |
|---|---|---|---|
| 0 | Security & deploy foundations | Hashed session storage, logout/revocation, input validation, rate limiting, error-message hygiene; `/api` route prefix, lazy database initialization, serverless-safe file handling | Done |
| 1 | Interactive research console | Section-based UI — live monitoring, one page per engine, training/testing/validation lab, history & past data, safety — with in-context explanations for every feature and metric | Done |
| 2 | Backtesting engine | Signal→trade conversion, transaction costs & slippage, trade logs, equity & drawdown curves, `POST /backtest/run` | Done |
| 3 | Risk analytics | Sharpe, Sortino, CAGR, volatility, beta, max drawdown, win rate, benchmark comparison per backtest | Done |
| 4 | Feature engineering | OHLCV → indicator feature matrices (RSI, MACD, Bollinger, momentum), leakage-free labels and time-series splits | Done |
| 5 | ML strategies | Directional model training (scikit-learn), time-aware evaluation, model registry with database-backed artifacts, ML signals through the backtester | Done |
| 6 | Copilot 2.0 | Tool-calling research assistant (LangChain) that runs backtests, trains models, explains results, and creates simulations from natural language | Done |
| 7 | NLP research memory | Financial sentiment analysis and embedding-based retrieval over strategy notes and backtest reports (Hugging Face) | Planned |
| 8 | Production hardening | pytest suite, CI, shared Redis cache, structured logging, dependency modernization, optional Docker Compose | Planned |
| 9 | Cloud deployment | Single-origin deployment on Vercel — static frontend + FastAPI serverless function, MongoDB Atlas, managed Redis | Planned |

Planned additional endpoints as phases land (all under `/api`): `POST /research/sentiment`, `POST /research/notes`, `POST /research/rag/query`.

## Methodology notes

Strategy and model evaluation in this project follows standard quant-research discipline as the roadmap lands:

- **No lookahead bias** — signals computed at bar *t* execute at bar *t+1*; features never see future data.
- **Time-series validation** — date-cutoff train/test splits with an embargo gap; never shuffled folds on price data.
- **Risk-adjusted reporting** — strategies are judged against buy-and-hold with Sharpe/Sortino/drawdown, not raw prediction accuracy.
- **Cost realism** — backtests apply transaction costs and slippage on every fill.

## Development

- `npm run check` — TypeScript type check (run before committing frontend changes).
- `npm run build` — production frontend build.
- `python -m py_compile backend/main.py` — quick backend syntax check.
- `python backend/test.py` — MongoDB connectivity check.
- Keep this README in sync when adding scripts, endpoints, or environment variables.


### Tests

Install the test dependencies once, then run the suite from the repository root (no database or network needed):

```bash
pip install -r backend/requirements-dev.txt
pytest backend/tests
```
