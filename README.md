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
- **Research memory (NLP)** — save research notes, or one-click summaries of backtests and models, and find them again by meaning (sentence embeddings + cosine similarity, scoped to your account). Score headlines as bullish, bearish, or neutral with FinBERT. Inference runs on the hosted Hugging Face service, so nothing heavy is installed on the server; notes saved while it is unavailable are indexed automatically later.
- **Simulations** — create, track, update, and delete simulated portfolio runs per user.
- **Accounts & sessions** — email/password signup and login, bcrypt-hashed passwords, bearer-token sessions with 7-day expiry, server-side logout, session tokens stored only as SHA-256 hashes, and per-client rate limiting on authentication.
- **Analytics dashboard** — simulation totals, trained strategies, recent simulations, and one-month watchlist trends.
- **Research copilot (tool-calling)** — a LangChain agent on free open-weight models (Groq, OpenRouter, Hugging Face), a fully local Ollama model, or OpenAI, that runs real platform tools on your behalf: quotes, price history, backtests (saved), backtest reports, model training (registered), model signals, portfolio summaries, simulation creation, and research-note search and saving. Before answering, it reads your saved notes most relevant to the question and cites the ones it used. Tool activity streams to the interface as it happens; every saved action is listed under the reply with a link. Tools run as the signed-in user with the same validation as the forms, at most five tool calls per message, and provider errors are never shown raw.
- **Flexible persistence** — MongoDB (Atlas or local) for durable storage, or a zero-setup in-memory mode for local development; a strict mode refuses to run without the database instead of silently losing data.
- **Input hardening** — ticker symbols, chart ranges, and simulation states are validated before any outbound request; error responses never expose internal details.
- **Operations** — structured JSON logs with a per-request `X-Request-ID`, an optional shared Redis (Upstash) cache and rate limiter for multi-instance hosting, pinned dependencies, a CI pipeline (tests, type check, build, deployed-size budget), and Docker Compose for a one-command local stack.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, React Router, Radix UI primitives (dialog, popover, tabs, tooltip), TradingView Lightweight Charts |
| Backend | FastAPI, Pydantic, Motor (async MongoDB), Passlib |
| Database | MongoDB — optional in-memory fallback for development |
| Market data | Yahoo Finance via `yfinance` with raw-API and offline fallbacks |
| Copilot | LangChain (langchain-core, langchain-openai) tool-calling over any OpenAI-compatible chat API — Groq, OpenRouter, Hugging Face, Ollama, OpenAI — streamed via Server-Sent Events |
| ML | scikit-learn, pandas, NumPy; optional MLflow tracking over REST (e.g. DagsHub) |
| NLP | Hugging Face inference over REST — FinBERT sentiment, all-MiniLM-L6-v2 embeddings; NumPy cosine search or MongoDB Atlas Vector Search |
| Operations | Structured logging, Upstash Redis (REST) for shared cache and rate limits, GitHub Actions CI, Docker / Docker Compose |

## Project structure

```
Algo-Trade-Simulator/
├── backend/                 # FastAPI service
│   ├── main.py              # App assembly: middleware and routers
│   ├── api/                 # Route modules: auth, market, analytics, simulations, backtests, ml, copilot, system
│   ├── config.py            # Settings, .env loading, platform detection
│   ├── deps.py              # Store and current-user dependencies
│   ├── stores.py            # MongoDB and in-memory stores (shared interface)
│   ├── logging_config.py    # Structured logging and request-id middleware
│   ├── models/              # Request/response models and shared validated types
│   ├── services/            # Market data (cached), backtesting engine, rate limiting, Upstash client, copilot, model registry, HF inference, sentiment
│   ├── strategies/          # Strategy interface + registry: buy-and-hold, SMA crossover, momentum, mean reversion
│   ├── analytics/           # Risk metrics (metrics.py) and risk report assembly (risk.py)
│   ├── ml/                  # Features, datasets, training, evaluation, inference
│   ├── llm/                 # Copilot tools, prompts, tool-calling loop, provider presets, research memory (rag.py)
│   ├── tests/               # pytest suite (features, backtesting, metrics, ML, tracking, copilot, API, cache/limits)
│   ├── requirements.txt     # Deployed dependencies (pinned)
│   ├── requirements-dev.txt # + test tools
│   ├── requirements-local-ml.txt # Local-only heavy ML (never deployed)
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
├── deploy/nginx.conf        # Frontend container: static files + /api proxy
├── scripts/                 # Connection checks (HF, MongoDB), deployed bundle size check, local HF inference stand-in
├── .github/workflows/       # CI
├── Dockerfile               # Backend image
├── Dockerfile.client        # Frontend image
├── docker-compose.yml       # Local stack: frontend + backend + MongoDB
├── package.json             # Frontend scripts & dependencies
├── api/index.py             # Vercel Python function entrypoint (loads backend.main:app)
├── requirements.txt         # Function dependencies (includes backend/requirements.txt)
├── .python-version          # Python version for the function
├── vercel.json              # Deployment: frontend build, /api function routing, SPA fallback, security headers
├── vite.config.ts
├── tsconfig.json
├── project_overview.md      # Architecture, API surface, data model, roadmap detail
└── README.md
```

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

| `STRICT_DB` | Fail requests with 503 instead of falling back to in-memory storage when MongoDB is unavailable | `false` locally, `true` when hosted |
| `MONGO_MAX_POOL_SIZE` | Connection pool size per process | `5` |

Verify connectivity with `python scripts/check_connections.py --mongo`. The database connection is created on the first request. Without `STRICT_DB`, an unreachable MongoDB logs a warning and the server falls back to the in-memory store — check the log to confirm which store is active.

### When you want the chat copilot

The copilot works with any OpenAI-compatible chat API that supports tool calling. Free options are built in:

| Provider | Cost | Setup | Default model |
|---|---|---|---|
| `groq` | Free tier, no card | Create a key at console.groq.com → `GROQ_API_KEY` | `openai/gpt-oss-120b` (falls back to `openai/gpt-oss-20b`) |
| `openrouter` | Free `:free` models | Create a key at openrouter.ai → `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` |
| `huggingface` | Small free monthly credits | Access token from huggingface.co → `HF_TOKEN`, plus `LLM_PROVIDER=huggingface` | `Qwen/Qwen2.5-72B-Instruct` |
| `ollama` | Free, fully local, open source | Install Ollama, `ollama pull qwen2.5:7b`, set `LLM_PROVIDER=ollama` (local development only) | `qwen2.5:7b` |
| `openai` | Paid | Key from platform.openai.com → `OPENAI_API_KEY` | `gpt-4o-mini` |

| Variable | Description | Default |
|---|---|---|
| `LLM_PROVIDER` | One of the providers above | first provider with a key: Groq, then OpenRouter, then OpenAI |
| `LLM_MODEL` | Override the provider's default model | preset |
| `LLM_MODEL_FALLBACKS` | Comma-separated backup models tried on rate limits | unset |
| `LLM_BASE_URL` / `LLM_API_KEY` | Point at any other OpenAI-compatible endpoint | preset |
| `OLLAMA_BASE_URL` | Ollama endpoint | `http://localhost:11434/v1` |
| `OPENAI_TEMPERATURE` | Sampling temperature (all providers) | `0.3` |

Without a provider the chat replies with a "not configured" notice; every other feature works.

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
| `RATE_LIMIT_STORAGE_URI` | `memory://` forces per-process limits; leave unset to use Upstash automatically when configured | unset (auto) |
| `LOG_FORMAT` | `json` (one object per line) or `text` | `json` when hosted, `text` locally |
| `APP_ENV` | `production` on hosted deployments (set by the Docker image): strict database mode, JSON logs, proxy-aware client IPs, development routes off | unset |
| `TRUST_PROXY_HEADERS` | Take the client IP from `X-Forwarded-For` (only behind a trusted proxy) | `true` when hosted |
| `LOG_LEVEL` | Backend log level | `INFO` |
| `YAHOO_USER_AGENT` | User-Agent for Yahoo Finance requests | preset |

### When you run more than one instance (shared cache and rate limits)

Serverless and multi-instance hosting don't share process memory, so the market-data cache and rate limits can use a free [Upstash](https://upstash.com) Redis database over its REST API (the `KV_REST_API_*` names set by the Vercel marketplace integration are also accepted):

| Variable | Description | Default |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | REST URL of the database (or `KV_REST_API_URL`) | unset (per-process memory) |
| `UPSTASH_REDIS_REST_TOKEN` | REST token (or `KV_REST_API_TOKEN`) | unset |

If Redis is unreachable, requests still succeed: the cache is skipped and limits fail open, with a warning in the log.

### When you want research memory (sentiment and semantic search)

Sentiment and note search use the hosted Hugging Face inference service. Create a free **read** access token at huggingface.co → Settings → Access Tokens and add it to `backend/.env`:

| Variable | Description | Default |
|---|---|---|
| `HF_TOKEN` | Hugging Face access token (read) | unset (sentiment/search return 503 with a hint; notes still save) |
| `SENTIMENT_MODEL` | Text-classification model | `ProsusAI/finbert` |
| `EMBEDDING_MODEL` | Sentence-embedding model | `sentence-transformers/all-MiniLM-L6-v2` |
| `NLP_PROVIDER` | `hf-api`, or `local` to run the models in-process (needs `requirements-local-ml.txt`; local development only) | `hf-api` |
| `HF_INFERENCE_URL` | Inference endpoint base | `https://router.huggingface.co/hf-inference/models` |
| `ATLAS_VECTOR_INDEX` | Name of an Atlas Vector Search index on `research_notes` (optional) | unset (exact NumPy scan) |

Hosted models sleep when idle: the first request can take a few seconds, and if a model is still loading the API answers 503 with `Retry-After`. Changing `EMBEDDING_MODEL` is safe — notes embedded with another model are re-embedded on the next search.

Optional, MongoDB Atlas only: create a Vector Search index on the `research_notes` collection with this definition and set `ATLAS_VECTOR_INDEX` to its name (without it, search is an exact scan over your notes, which is fast for personal corpora):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 384, "similarity": "cosine" },
    { "type": "filter", "path": "userId" },
    { "type": "filter", "path": "embeddingModel" }
  ]
}
```

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

All routes are served under the `/api` prefix. Authenticated routes expect `Authorization: Bearer <token>`; tokens are issued by signup/login, expire after 7 days (configurable), and are revoked by logout. Authentication and quote routes are rate limited per client (HTTP 429 with `Retry-After`). Every response carries an `X-Request-ID` header (a valid incoming one is reused) that also appears in the server log.

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
| `GET /api/status` | Operational snapshot: version, store type, market-data source health, copilot provider and model, experiment tracking, rate limits and whether they are shared (no secrets) | ✓ |
| `POST /api/research/sentiment` | Bullish / bearish / neutral with confidence for up to 20 texts | ✓ |
| `POST /api/research/notes` / `GET /api/research/notes` | Save a note (or a backtest/model summary via `kind` + `refId`; idempotent) / list your notes | ✓ |
| `DELETE /api/research/notes/{id}` | Delete a note | ✓ |
| `POST /api/research/rag/query` | Your notes ranked by semantic similarity to a query | ✓ |
| `POST /api/copilot/chat` | Copilot conversation, streamed as Server-Sent Events (notes consulted, tool start/end, reply, saved actions) | ✓ |
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
| 7 | NLP research memory | FinBERT sentiment, embedding-based retrieval over notes and backtest/model summaries, copilot answers that cite your notes (hosted Hugging Face inference) | Done |
| 8 | Production hardening | Route modules, API + unit test suite, CI, shared Redis cache and rate limits, structured logging, pinned dependencies, deployed-size budget, Docker Compose | Done |
| 9 | Cloud deployment | One Vercel project: static frontend + FastAPI as a Python function under `/api`, MongoDB Atlas, deployment smoke test | Ready to deploy |


## Methodology notes

Strategy and model evaluation in this project follows standard quant-research discipline as the roadmap lands:

- **No lookahead bias** — signals computed at bar *t* execute at bar *t+1*; features never see future data.
- **Time-series validation** — date-cutoff train/test splits with an embargo gap; never shuffled folds on price data.
- **Risk-adjusted reporting** — strategies are judged against buy-and-hold with Sharpe/Sortino/drawdown, not raw prediction accuracy.
- **Cost realism** — backtests apply transaction costs and slippage on every fill.

## Deployment

The whole app deploys as **one Vercel project** on one domain:

```
Browser ──► Vercel ─┬─ static frontend (Vite build, dist/)
                    └─ /api/*  ──►  Python function api/index.py (FastAPI)
                                     ├── MongoDB Atlas (data, model artifacts, note embeddings)
                                     ├── Hugging Face inference (sentiment, embeddings)
                                     ├── Groq or another LLM provider (copilot)
                                     └── DagsHub MLflow (optional experiment tracking)
```

`vercel.json` builds the frontend, routes every `/api/*` request to the FastAPI app in `api/index.py`, falls back to `index.html` for deep links, and sets security headers. The function installs `requirements.txt` (which includes `backend/requirements.txt`; about 320 MB installed, within Vercel's 500 MB limit for Python functions) on Python 3.12 (`.python-version`). Same origin, so no CORS configuration.

### 1. MongoDB Atlas

- Network Access → add `0.0.0.0/0` (serverless functions have no fixed outbound IP), and rely on a strong password.
- Database Access → a dedicated user with `readWrite` on one database only.
- Check the connection string locally: `python scripts/check_connections.py --mongo`.

### 2. Vercel project

1. Vercel → Add New Project → import this repository (root directory: repository root). The settings come from `vercel.json`.
2. Settings → Environment Variables (Production, and Preview if you want previews to work):

   | Variable | Value |
   |---|---|
   | `MONGO_URL` | Atlas connection string |
   | `MONGODB_DB` | database name, e.g. `algo-trade-simulator` |
   | `GROQ_API_KEY` | copilot (or another provider from the copilot table) |
   | `HF_TOKEN` | research memory and sentiment (a read token) |
   | `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, `MLFLOW_TRACKING_PASSWORD` | optional, DagsHub tracking |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | optional, recommended: shares the market-data cache and rate limits across function instances (the Vercel Marketplace Upstash integration sets `KV_REST_API_*`, also accepted) |

   On Vercel the app automatically runs with strict database mode (no silent in-memory fallback), JSON logs, and client IPs from Vercel's `X-Forwarded-For`; the development sign-in route stays off in production. Never set `ENABLE_DEV_ENDPOINTS` or `USE_IN_MEMORY_DB`.
3. Settings → Functions → Region: pick the region closest to your Atlas cluster (the default is Washington, D.C., `iad1`).
4. Deploy. Every push to `main` deploys production; pull requests get preview deployments.

### 3. Verify

```bash
python scripts/smoke_deploy.py https://<project>.vercel.app
```

It signs up a throwaway account and exercises auth, simulations, market data (reporting whether quotes are live), a backtest and its risk report, research memory and the copilot when configured, and logout. It cleans up the simulation and note it creates.

### Operating notes

- **Cold starts**: the first request to a new function instance loads the scientific Python stack, which takes a few seconds; warm instances answer quickly.
- **Limits** (Hobby plan): 2 GB memory and 1 vCPU per function, at most 300 s per request (the slowest route, model training on five years of data, takes seconds), 4.5 MB request/response bodies.
- **Market data**: Yahoo Finance may rate-limit cloud IP ranges. Quotes then fall back to clearly flagged offline values, and the interface badges them.
- **Rollback**: Vercel's instant rollback restores any earlier deployment.
- **Containers**: the same API also runs as a Docker image (`Dockerfile`, production mode via `APP_ENV=production`) on any container host such as Render; point the `/api` rewrite in `vercel.json` at it instead of the function.

## Development

- `npm run check` — TypeScript type check (run before committing frontend changes).
- `npm run build` — production frontend build.
- `python -m py_compile backend/main.py` — quick backend syntax check.
- `python scripts/smoke_deploy.py <url>` — end-to-end smoke test of a deployed instance (see Deployment).
- `python scripts/check_connections.py` — checks the Hugging Face token (plus the sentiment and embedding models) and the MongoDB connection with the backend's settings; `--hf` / `--mongo` for one, `--no-inference` to skip model calls. Prints PASS/FAIL with a fix hint, never secrets; exit code 1 on failure. `python backend/test.py` runs the MongoDB part only.
- `python scripts/fake_hf_inference.py` — local stand-in for the Hugging Face inference API (keyword-based, not a real model) for offline development; run the backend with `HF_TOKEN=local HF_INFERENCE_URL=http://127.0.0.1:8765`.
- `python scripts/check_bundle_size.py` — installed size of the deployed Python dependencies (warns above 250 MB, fails above 500 MB).
- Keep this README in sync when adding scripts, endpoints, or environment variables.

### Tests

Install the test dependencies once, then run the suite from the repository root (no database, network, or API keys needed — market data, language models, MLflow, and Redis are stubbed or served by local fakes):

```bash
pip install -r backend/requirements-dev.txt
pytest backend/tests
```

Live connection checks are opt-in (they use the network and your `backend/.env`): `LIVE_CHECKS=1 pytest backend/tests/test_live_connections.py -v`.

The suite covers feature leakage, the backtesting engine, risk metrics, ML training and the registry, experiment tracking, copilot tools and providers, the HTTP API contract (auth, ownership, validation, rate limits), and the shared cache and rate limiter.

### Continuous integration

Every push and pull request to `main` runs four jobs: backend tests (Python 3.12), frontend type check and build (Node 20), the deployed-bundle size check, and a build of the backend Docker image that is started and smoke-tested (health, request ids, sign-up, production settings, development routes closed).

### Docker (optional)

Run the whole stack — frontend, backend, and MongoDB — with one command:

```bash
docker compose up --build
```

Open `http://localhost:8080`. The frontend container serves the build and proxies `/api` to the backend (streaming responses unbuffered). Keys such as `GROQ_API_KEY` are read from `backend/.env` at runtime and never baked into images. The backend image alone (`Dockerfile`) honours `$PORT`, so it also runs on free container hosts.
