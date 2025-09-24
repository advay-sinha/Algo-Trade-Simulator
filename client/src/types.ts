export interface User {
  id: string;
  email: string;
  name: string;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose?: number | null;
  currency?: string | null;
  updated: string;
}

export interface Simulation {
  id: string;
  symbol: string;
  strategy: string;
  startingCapital: number;
  status: string;
  createdAt: string;
  notes?: string | null;
}

export interface SimulationInput {
  symbol: string;
  strategy: string;
  startingCapital: number;
  notes?: string;
}

export interface SimulationUpdate {
  status?: string;
  notes?: string | null;
}
