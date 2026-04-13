# Algo Trade Simulator

A full-stack trading simulation platform that lets you research live markets, train and backtest algorithmic strategies, and manage simulated portfolios — all without risking real capital. The app pairs a FastAPI backend with a React + Vite frontend, sources market data from Yahoo Finance, and uses an OpenAI-backed copilot (with heuristic fallbacks) to assist with research and automation.

## What the project does

- Streams live quotes, charts, and intraday stats from Yahoo Finance for any searchable ticker.
- Trains an SMA crossover strategy on five years of historical data and serves live signals against the latest market regime.
- Persists user accounts, sessions, and simulations in MongoDB (or an in-memory store for quick local runs).
- Provides a hybrid chatbot copilot that can answer research questions and spin up simulations from natural-language prompts (e.g. "create a simulation for AAPL with 25k").
- Surfaces portfolio stats, trained strategies, and recent results through a home analytics dashboard.
- Restores sessions via browser storage so signed-in users can resume where they left off.

## Tech stack

| Area        | Technology |
|-------------|------------|
| Frontend    | React + Vite + TypeScript |
| Backend     | FastAPI, Motor (async MongoDB), Passlib |
| Database    | MongoDB (Atlas or local) — optional in-memory fallback |
| Market data | Yahoo Finance quote & chart APIs (via `requests`) |
| AI copilot  | OpenAI Chat Completions with configurable model fallbacks |

## Project structure

```
Algo-Trade-Simulator/
├── backend/                 # FastAPI service
│   ├── main.py              # App entrypoint, routes, services, DB wiring
│   ├── requirements.txt     # Python dependencies
│   ├── test.py              # MongoDB connectivity check
│   └── ctest.py             # Auxiliary connectivity / sanity script
├── client/                  # React + Vite frontend
│   ├── index.html
│   └── src/
│       ├── main.tsx         # Vite entrypoint
│       ├── App.tsx          # Top-level routing & layout
│       ├── api.ts           # Backend API client
│       ├── types.ts         # Shared TypeScript types
│       ├── index.css
│       └── components/
│           ├── HomeOverview.tsx
│           ├── Dashboard.tsx
│           ├── LiveMarketPage.tsx
│           ├── Watchlist.tsx
│           ├── SparklineChart.tsx
│           ├── StrategyCatalog.tsx
│           ├── StrategyTrainer.tsx
│           ├── SimulationForm.tsx
│           ├── SimulationList.tsx
│           ├── ChatbotPanel.tsx
│           ├── LoginForm.tsx
│           └── SignupForm.tsx
├── package.json             # Frontend scripts & dependencies
├── vite.config.ts           # Vite dev server / proxy config
├── tsconfig.json
└── README.md
```

## Getting started

### Prerequisites

- Node.js 18 or later
- Python 3.11 or later
- A running MongoDB instance (Atlas or local) — optional if you use the in-memory mode

### Backend setup

1. Create a virtual environment and install dependencies:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. (Optional) Create a `.env` file in `backend/` to override defaults — see [Configuration](#configuration).
3. Start the FastAPI server from the repository root:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```
   > To run without MongoDB during development, export `USE_IN_MEMORY_DB=true`. All data is ephemeral and resets on restart.
4. (Optional) Verify MongoDB connectivity:
   ```bash
   python backend/test.py
   ```

The API will be available at `http://localhost:8000`, with auto-generated Swagger docs at `/docs`.

### Frontend setup

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```
2. Start the Vite dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173`. The frontend proxies API requests to `http://localhost:8000` by default. Override with `VITE_API_BASE_URL` in `client/.env` if needed.

## Configuration

The backend recognises the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | Preferred connection string for MongoDB | unset (falls back to defaults) |
| `MONGODB_URI` | Alternate connection string (used if `MONGO_URL` is unset) | `mongodb://localhost:27017` |
| `MONGO_URI` | Legacy connection string key (used if the others are unset) | unset |
| `MONGODB_DB` | Database name | `algo-trade-simulator` |
| `FRONTEND_ORIGIN` | Allowed CORS origin for the web app | `http://localhost:5173` |
| `SESSION_DURATION_DAYS` | Optional override for session lifetime in days | `7` |
| `ENABLE_DEV_ENDPOINTS` | Enables development-only routes such as the login bypass helper | `false` |
| `USE_IN_MEMORY_DB` | Stores users, sessions, and simulations in memory for local testing (no MongoDB required) | `false` |
| `YAHOO_USER_AGENT` | Optional override for the header sent to Yahoo Finance endpoints | `Mozilla/5.0 (compatible; AlgoTradeSimulator/1.0; +https://example.com)` |
| `OPENAI_API_KEY` | API key used for chatbot completions | unset |
| `OPENAI_MODEL` | Chat completion model identifier | `gpt-4o-mini` |
| `OPENAI_TEMPERATURE` | Sampling temperature for completions | `0.3` |
| `OPENAI_BASE_URL` | (Optional) Override base URL for Azure/OpenAI-compatible endpoints | unset |
| `OPENAI_ORG` | (Optional) Organisation ID when using OpenAI accounts | unset |
| `OPENAI_MODEL_FALLBACKS` | Comma-separated list of backup models tried if the primary model fails | unset |

> **Tip:** When deploying, supply a production MongoDB connection string and set `FRONTEND_ORIGIN` to your hosted frontend URL.

> If multiple Mongo variables are set, `MONGO_URL` wins, followed by `MONGODB_URI`, then the legacy `MONGO_URI`.

### Frontend environment

The Vite frontend honours the following environment variables (set in `client/.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL for API requests | `http://localhost:8000` |
| `VITE_ENABLE_LOGIN_BYPASS` | Auto-sign in via the dev bypass endpoint when set to `true` | `false` |
| `VITE_LOGIN_BYPASS_EMAIL` | Optional email used when creating the bypass session | unset (backend default) |
| `VITE_LOGIN_BYPASS_NAME` | Optional name applied to the bypass session | unset (backend default) |

> To skip the login page during development, run the backend with `ENABLE_DEV_ENDPOINTS=true` and set `VITE_ENABLE_LOGIN_BYPASS=true` before starting the Vite dev server.
> You can also navigate to `http://localhost:5173/dev/auth/bypass` while the Vite dev server is running to trigger the bypass on demand.

## API overview

The FastAPI server exposes REST endpoints. Key routes include:

- `POST /auth/signup` — register a new user and return an access token
- `POST /auth/login` — authenticate an existing user
- `GET /auth/session` — validate a bearer token and retrieve the current user
- `GET /market/watchlist` — fetch live quotes for a comma-separated list of symbols
- `GET /market/quote/{symbol}` — fetch a single market quote
- `GET /market/search` — look up tickers and exchanges that match a user query
- `GET /market/chart/{symbol}` — return candlestick-ready chart data with configurable range and interval
- `GET /simulations` — list saved simulations for the authenticated user
- `POST /simulations` — create a new simulation for the current user
- `PATCH /simulations/{id}` — update status or notes for a simulation
- `DELETE /simulations/{id}` — remove a simulation
- `GET /analytics/overview` — retrieve aggregated dashboard metrics for the signed-in user
- `GET /analytics/strategies` — list the built-in strategy catalogue shown on the info page
- `POST /analytics/train` — backtest/train the SMA crossover strategy on the last five years of data
- `POST /analytics/predict` — generate a live signal using the last trained strategy
- `GET /analytics/sparkline` — return sparkline-friendly price series for requested symbols
- `POST /chat` — query the hybrid chatbot backed by OpenAI completions

Requests that require authentication expect an `Authorization: Bearer <token>` header. Tokens automatically expire after seven days.

## Strategy lab & chatbot

1. Ensure the backend can reach Yahoo Finance (no VPN/proxy required) and that `OPENAI_API_KEY` is set for the backend service. Optionally add `OPENAI_MODEL_FALLBACKS` (e.g. `gpt-4o,gpt-3.5-turbo`) so the assistant can fall back when a model hits account limits.
2. Train a strategy from the **Simulations** page or via `POST /analytics/train` with a symbol plus short/long SMA windows (default 20/60).
3. Request a fresh prediction from the **Home** page or `POST /analytics/predict` to evaluate the current market regime.
4. Use the **Chatbot** page to ask questions, run quick research, or say "create a simulation for AAPL with 25k" to auto-spin a test scenario.

## Development tips

- Run `npm run check` before committing frontend TypeScript changes to ensure type safety.
- Run `python -m compileall backend` to catch syntax errors in the FastAPI service.
- Update this README whenever you add or change developer-facing commands or environment variables.

## License

This project is released under the MIT License.
