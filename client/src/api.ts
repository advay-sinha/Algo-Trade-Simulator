import type {
  MarketQuote,
  Simulation,
  SimulationInput,
  SimulationUpdate,
  User,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const detail = data?.detail ?? response.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return data as T;
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

export function devAuthBypass(payload?: DevAuthBypassPayload) {
  return request<AuthResponse>("/dev/auth/bypass", { method: "POST", body: payload });
}

export function fetchWatchlist(symbols?: string[]) {
  const query = symbols?.length ? `?symbols=${symbols.join(",")}` : "";
  return request<MarketQuote[]>(`/market/watchlist${query}`);
}

export function fetchQuote(symbol: string) {
  return request<MarketQuote>(`/market/quote/${encodeURIComponent(symbol)}`);
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
