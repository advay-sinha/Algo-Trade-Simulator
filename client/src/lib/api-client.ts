import { QueryClient } from "@tanstack/react-query";
import { ApiResponse } from "@/types";

// Export queryClient from queryClient.ts
export { queryClient } from "./queryClient";

// Function to handle API requests
export async function apiRequest<T>(
  method: string,
  url: string,
  data?: unknown
): Promise<T> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    if (!res.ok) {
      // Try to parse error message from response
      try {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status}: ${res.statusText}`);
      } catch (parseError) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
    }

    // Return empty object for 204 No Content responses
    if (res.status === 204) {
      return {} as T;
    }

    return await res.json();
  } catch (error) {
    console.error(`API request failed: ${method} ${url}`, error);
    throw error instanceof Error ? error : new Error("An unknown error occurred");
  }
}

// Typed API request wrappers
export const api = {
  get: <T>(url: string) => apiRequest<T>("GET", url),
  post: <T>(url: string, data: unknown) => apiRequest<T>("POST", url, data),
  put: <T>(url: string, data: unknown) => apiRequest<T>("PUT", url, data),
  patch: <T>(url: string, data: unknown) => apiRequest<T>("PATCH", url, data),
  delete: <T>(url: string) => apiRequest<T>("DELETE", url),
};

// Market data API functions
export const marketDataApi = {
  getMarketData: (symbol: string) => api.get<ApiResponse<any>>(`/api/market-data?symbol=${symbol}`),
  getMarketHistory: (symbol: string, limit: number = 100) => 
    api.get<ApiResponse<any>>(`/api/market-data/history?symbol=${symbol}&limit=${limit}`),
};

// Simulation API functions
export const simulationApi = {
  getSimulations: () => api.get<ApiResponse<any>>(`/api/simulations`),
  getSimulation: (id: number) => api.get<ApiResponse<any>>(`/api/simulations/${id}`),
  createSimulation: (data: any) => api.post<ApiResponse<any>>(`/api/simulations`, data),
  updateSimulation: (id: number, data: any) => api.patch<ApiResponse<any>>(`/api/simulations/${id}`, data),
};

// Trade API functions
export const tradeApi = {
  getTrades: (simulationId?: number) => 
    api.get<ApiResponse<any>>(simulationId ? `/api/trades?simulationId=${simulationId}` : `/api/trades`),
};

// Strategy API functions
export const strategyApi = {
  getStrategies: () => api.get<ApiResponse<any>>(`/api/strategies`),
};
