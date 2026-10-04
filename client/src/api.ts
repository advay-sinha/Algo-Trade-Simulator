import type {
  MarketQuote,
  Simulation,
  SimulationInput,
  SimulationUpdate,
  User,
  OverviewResponse,
  TrainingPayload,
  TrainingResult,
  PredictionResult,
  StrategyDefinition,
  ChatRequestPayload,
  ChatResponsePayload,
  ChatAction,
  SparklineSeries,
  SearchResult,
  ChartResponse,
  SystemStatus,
  TrainingRun,
  StrategySpec,
  BacktestRequestPayload,
  BacktestRecord,
  BacktestListItem,
  BacktestTrade,
  RiskReport,
  FeatureCatalogEntry,
  FeaturesRequestPayload,
  DatasetPreview,
  TrainModelPayload,
  ModelRecord,
  ModelSummary,
  ModelSignal,
  CopilotEvent,
} from "./types";

// Same-origin by default: the Vite dev server proxies /api to the backend, and production
// serves the SPA and the API from one domain. Override only for a separately hosted API.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network failure (server down, offline, DNS). Status 0 lets callers explain it.
    throw new ApiError("Network request failed", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: { detail?: unknown } | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (response.status === 401 && typeof window !== "undefined") {
    window.localStorage.removeItem("algo-trade-session");
  }

  if (!response.ok) {
    const detail = data?.detail ?? response.statusText;
    throw new ApiError(
      typeof detail === "string" ? detail : "Request validation failed",
      response.status,
      response.headers.get("Retry-After"),
    );
  }

  return data as T;
}

/** Error carrying the HTTP status (0 = network failure) so the UI can pick recovery copy. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface DevAuthBypassPayload {
  email?: string;
  name?: string;
}

export function signup(payload: SignupPayload) {
  return request<AuthResponse>("/auth/signup", { method: "POST", body: payload });
}

export function login(payload: LoginPayload) {
  return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
}

export function logout(token: string) {
  return request<void>("/auth/logout", { method: "POST", token });
}

export function devAuthBypass(payload?: DevAuthBypassPayload) {
  return request<AuthResponse>("/dev/auth/bypass", { method: "POST", body: payload });
}

export function fetchWatchlist(token: string, symbols?: string[]) {
  const query = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  return request<MarketQuote[]>(`/market/watchlist${query}`, { token });
}

export function fetchQuote(token: string, symbol: string) {
  return request<MarketQuote>(`/market/quote/${encodeURIComponent(symbol)}`, { token });
}

export function fetchSimulations(token: string) {
  return request<Simulation[]>("/simulations", { token });
}

export function createSimulation(token: string, payload: SimulationInput) {
  return request<Simulation>("/simulations", { method: "POST", body: payload, token });
}

export function updateSimulation(token: string, id: string, payload: SimulationUpdate) {
  return request<Simulation>(`/simulations/${id}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteSimulation(token: string, id: string) {
  return request<void>(`/simulations/${id}`, {
    method: "DELETE",
    token,
  });
}

export function fetchOverview(token: string) {
  return request<OverviewResponse>("/analytics/overview", { token });
}

export function fetchStrategies() {
  return request<StrategyDefinition[]>("/analytics/strategies");
}

export function trainStrategy(token: string, payload: TrainingPayload) {
  return request<TrainingResult>("/analytics/train", { method: "POST", body: payload, token });
}

export function predictStrategy(token: string, symbol: string) {
  return request<PredictionResult>("/analytics/predict", {
    method: "POST",
    body: { symbol },
    token,
  });
}

export function askChat(token: string, payload: ChatRequestPayload) {
  return request<ChatResponsePayload>("/chat", { method: "POST", body: payload, token });
}

export function fetchSparkline(token: string, symbols?: string[]) {
  const params = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  return request<SparklineSeries[]>(`/analytics/sparkline${params}`, { token });
}

export function searchSymbols(token: string, query: string) {
  const encoded = encodeURIComponent(query);
  return request<SearchResult[]>(`/market/search?q=${encoded}`, { token });
}

export function fetchStatus(token: string) {
  return request<SystemStatus>("/status", { token });
}

export function fetchTrainingRuns(token: string) {
  return request<TrainingRun[]>("/analytics/training", { token });
}

export function fetchChart(token: string, symbol: string, options?: { range?: string; interval?: string }) {
  const params = new URLSearchParams();
  if (options?.range) {
    params.set("range", options.range);
  }
  if (options?.interval) {
    params.set("interval", options.interval);
  }
  const query = params.toString();
  const path = `/market/chart/${encodeURIComponent(symbol)}${query ? `?${query}` : ""}`;
  return request<ChartResponse>(path, { token });
}

export function fetchRunnableStrategies() {
  return request<StrategySpec[]>("/strategies");
}

export function runBacktest(token: string, payload: BacktestRequestPayload) {
  return request<BacktestRecord>("/backtest/run", { method: "POST", body: payload, token });
}

export function fetchBacktests(token: string) {
  return request<BacktestListItem[]>("/backtests", { token });
}

export function fetchBacktest(token: string, id: string) {
  return request<BacktestRecord>(`/backtest/${encodeURIComponent(id)}`, { token });
}

export function fetchBacktestTrades(token: string, id: string) {
  return request<BacktestTrade[]>(`/backtest/${encodeURIComponent(id)}/trades`, { token });
}

export function fetchBacktestRisk(token: string, id: string) {
  return request<RiskReport>(`/backtest/${encodeURIComponent(id)}/risk`, { token });
}

export function fetchFeatureCatalog() {
  return request<FeatureCatalogEntry[]>("/ml/feature-catalog");
}

export function previewDataset(token: string, payload: FeaturesRequestPayload) {
  return request<DatasetPreview>("/ml/features", { method: "POST", body: payload, token });
}

export function trainModel(token: string, payload: TrainModelPayload) {
  return request<ModelRecord>("/ml/train", { method: "POST", body: payload, token });
}

export function fetchModels(token: string) {
  return request<ModelSummary[]>("/ml/models", { token });
}

export function fetchModel(token: string, id: string) {
  return request<ModelRecord>(`/ml/models/${encodeURIComponent(id)}`, { token });
}

export function predictWithModel(token: string, body: { modelId?: string; symbol?: string }) {
  return request<ModelSignal>("/ml/predict", { method: "POST", body, token });
}

/**
 * Stream a copilot reply (Server-Sent Events over a POST). Calls `onEvent` for every event and
 * resolves when the stream ends. Abort with the signal to stop early.
 */
export async function streamCopilot(
  token: string,
  body: { message: string; history: Array<{ role: "user" | "assistant"; content: string }> },
  onEvent: (event: CopilotEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/copilot/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("Network request failed", 0);
  }
  if (!response.ok || !response.body) {
    if (response.status === 401 && typeof window !== "undefined") window.localStorage.removeItem("algo-trade-session");
    let detail = response.statusText;
    try {
      detail = (await response.json())?.detail ?? detail;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(typeof detail === "string" ? detail : "Request failed", response.status, response.headers.get("Retry-After"));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)) as CopilotEvent);
          } catch {
            // ignore malformed event
          }
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
