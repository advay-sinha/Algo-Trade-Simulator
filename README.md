# Algo Trade Simulator

A full-stack trading simulation platform with live market data, personalised strategy tracking, and persistent user accounts. The project now ships with a Python (FastAPI) backend and a React frontend so you can spin up the experience locally with minimal setup.

## Features

- **Live market data** sourced on demand from Yahoo Finance via `yfinance`
- **User authentication** with secure password hashing and expiring API tokens stored in MongoDB
- **Simulation tracking** that persists strategy details, capital allocation, and status per user
- **Responsive dashboard** showing watchlists, new simulation forms, and saved simulations
- **Session recovery** using browser storage so signed-in users can resume quickly

## Tech stack

| Area     | Technology |
|----------|------------|
| Frontend | React + Vite + TypeScript |
| Backend  | FastAPI, Motor (MongoDB), Passlib |
| Database | MongoDB |
| Market data | `yfinance` (Yahoo Finance) |

## Getting started

### Prerequisites

- Node.js 18 or later
- Python 3.11 or later
- A running MongoDB instance (Atlas or local)

### Backend setup

1. Create a virtual environment and install dependencies:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows use `.venv\\Scripts\\activate`
   pip install -r requirements.txt
   ```
2. Configure environment variables (defaults are provided below). You can create a `.env` file in `backend/` if desired.
3. Start the FastAPI server:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

The API will be available at `http://localhost:8000` and includes automatically generated Swagger docs at `/docs`.

### Frontend setup

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```
2. Start the Vite dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser. The frontend proxies API requests to `http://localhost:8000` by default. You can override this by setting `VITE_API_BASE_URL` in `client/.env`.

## Configuration

The backend recognises the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | Connection string for MongoDB | `mongodb://localhost:27017` |
| `MONGODB_DB` | Database name | `algo-trade-simulator` |
| `FRONTEND_ORIGIN` | Allowed CORS origin for the web app | `http://localhost:5173` |
| `SESSION_DURATION_DAYS` | Optional override for session lifetime in days | `7` |

> **Tip:** When deploying, supply a production MongoDB connection string and set `FRONTEND_ORIGIN` to your hosted frontend URL.

## API overview

The FastAPI server exposes REST endpoints. Key routes include:

- `POST /auth/signup` – register a new user and return an access token
- `POST /auth/login` – authenticate an existing user
- `GET /auth/session` – validate a bearer token and retrieve the current user
- `GET /market/watchlist` – fetch live quotes for a comma separated list of symbols
- `GET /market/quote/{symbol}` – fetch a single market quote
- `GET /simulations` – list saved simulations for the authenticated user
- `POST /simulations` – create a new simulation for the current user
- `PATCH /simulations/{id}` – update status or notes for a simulation
- `DELETE /simulations/{id}` – remove a simulation

Requests that require authentication expect an `Authorization: Bearer <token>` header. Tokens automatically expire after seven days.

## Development tips

- Run `npm run check` before committing frontend TypeScript changes to ensure type safety.
- Run `python -m compileall backend` to catch syntax errors in the FastAPI service.
- Update this README whenever you add or change developer-facing commands or environment variables.

## License

This project is released under the MIT License.
