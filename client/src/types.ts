export interface User {
  id: string;
  email: string;
  name: string;
}

/** Where a market value came from. Anything other than "live" must be badged in the UI. */
export type DataSource = "live" | "cached" | "offline" | "synthetic";

export interface MarketQuote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose?: number | null;
  currency?: string | null;
  updated: string;
  source?: DataSource;
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

/** Lifecycle states accepted by the API when updating a simulation. */
export type SimulationStatus = "active" | "paused" | "completed" | "archived";

export interface SimulationUpdate {
  status?: SimulationStatus;
  notes?: string | null;
}

export interface OverviewTotals {
  totalSimulations: number;
  activeSimulations: number;
  completedSimulations: number;
  totalStartingCapital: number;
  averageStartingCapital: number;
  trainedModels: number;
}

export interface OverviewResponse {
  totals: OverviewTotals;
  watchlist: string[];
  recentSimulations: Simulation[];
  strategiesTrained: string[];
}

/** Lab trainer metrics from a zero-cost, in-sample SMA backtest. Ratios are fractions; null = not computable. */
export interface StrategyMetrics {
  totalReturn: number | null;
  annualizedReturn: number | null;
  winRate: number | null;
  /** Closed round-trip trades. */
  trades: number;
  sharpe: number | null;
  /** Magnitude of the worst peak-to-trough decline, as a fraction. */
  maxDrawdown: number | null;
}

export interface TrainingRun {
  symbol: string;
  strategyId: string;
  shortWindow?: number | null;
  longWindow?: number | null;
  metrics: Partial<StrategyMetrics>;
  trainedAt: string;
}

export interface TrainingPayload {
  symbol: string;
  shortWindow: number;
  longWindow: number;
  strategyId?: string;
}

export interface TrainingResult {
  symbol: string;
  strategyId: string;
  shortWindow: number;
  longWindow: number;
  metrics: StrategyMetrics;
  sample: Array<{ timestamp: string; close: number; shortSma: number; longSma: number }>;
  trainedAt: string;
  basis?: string;
  dataSource?: DataSource;
}

export interface PredictionResult {
  symbol: string;
  strategyId: string;
  signal: string;
  confidence: number;
  summary: string;
  metadata: Record<string, unknown>;
  generatedAt: string;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  recommendedFor: string[];
  parameters: Array<Record<string, string>>;
  /** True when the backtester can run it. */
  runnable?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actions?: ChatAction[];
  citations?: string[];
}

export interface ChatAction {
  type: string;
  label: string;
  data: Record<string, unknown>;
}

export interface ChatRequestPayload {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatResponsePayload {
  reply: string;
  citations: string[];
  actions: ChatAction[];
}

export interface SparklinePoint {
  timestamp: string;
  close: number;
}

export interface SparklineSeries {
  symbol: string;
  points: SparklinePoint[];
  source?: DataSource;
}

export interface SearchResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  type?: string;
  source?: DataSource;
}

export interface ChartPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface ChartResponse {
  symbol: string;
  points: ChartPoint[];
  timezone?: string | null;
  currency?: string | null;
  range: string;
  interval: string;
  previousClose?: number | null;
  source?: DataSource;
}

export interface SystemStatus {
  version: string;
  serverTime: string;
  store: "mongo" | "memory";
  strictDb: boolean;
  devEndpoints: boolean;
  copilotConfigured: boolean;
  experimentTracking?: boolean;
  offlineMarketDataAllowed: boolean;
  marketData: {
    lastSource: DataSource | null;
    lastLiveAt: string | null;
    lastFallbackAt: string | null;
  };
  rateLimits: {
    authPerMinute: number;
    marketPerMinute: number;
    shared: boolean;
  };
}

/* Backtesting ------------------------------------------------------------------------------ */

export interface StrategyParamSpec {
  name: string;
  label: string;
  type: "integer" | "number" | string;
  default?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  description?: string | null;
}

export interface StrategySpec {
  id: string;
  name: string;
  description: string;
  parameters: StrategyParamSpec[];
}

export type BacktestRange = "6mo" | "1y" | "2y" | "5y";

export interface BacktestRequestPayload {
  symbol: string;
  strategy: string;
  params: Record<string, number>;
  range: BacktestRange;
  startingCapital: number;
  costBps: number;
  slippageBps: number;
  benchmark?: string;
  riskFreeRate?: number;
}

export interface SeriesPoint {
  timestamp: string;
  value: number;
}

/** All ratios are fractions (0.12 = 12%). */
export interface BacktestSummaryStats {
  startingCapital: number;
  finalEquity: number;
  totalReturn: number;
  buyHoldReturn: number;
  excessReturn: number;
  maxDrawdown: number;
  tradeCount: number;
  winningTrades: number;
  openPosition: boolean;
  exposure: number;
  totalCosts: number;
}

export interface BacktestTrade {
  entryTime: string;
  entryPrice: number;
  exitTime: string | null;
  exitPrice: number;
  shares: number;
  pnl: number;
  returnPct: number;
  costs: number;
  open: boolean;
}

export interface BacktestListItem {
  id: string;
  symbol: string;
  strategy: { id: string; name: string; params: Record<string, number> };
  range: BacktestRange;
  period: { start: string; end: string; bars: number };
  summary: BacktestSummaryStats;
  dataSource: DataSource;
  createdAt: string;
  riskHeadline?: Partial<Record<"sharpe" | "sortino" | "cagr" | "volatility" | "winRate", number | null>> | null;
}

/** Curve metrics; every value is a fraction or ratio, null when it can't be computed (see `unavailable`). */
export interface CurveMetrics {
  totalReturn: number | null;
  cagr: number | null;
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
}

export interface RiskReport {
  periodsPerYear: number;
  riskFreeRate: number;
  metrics: CurveMetrics & { winRate: number | null; profitFactor: number | null };
  unavailable: Record<string, string>;
  drawdown: {
    maxDrawdown: number | null;
    peak?: string | null;
    trough?: string | null;
    recovery?: string | null;
    durationBars?: number;
    recovered?: boolean;
    reason?: string;
  };
  buyHold: { metrics: CurveMetrics; unavailable: Record<string, string> };
  benchmark: {
    symbol: string;
    source: DataSource | null;
    available: boolean;
    overlapBars?: number;
    metrics?: CurveMetrics;
    unavailable?: Record<string, string>;
    reason?: string;
  };
  comparison: { beta?: number | null; alpha?: number | null; correlation?: number | null; excessReturn?: number | null };
  comparisonUnavailable: Record<string, string>;
}

export interface BacktestRecord extends BacktestListItem {
  config: { startingCapital: number; costBps: number; slippageBps: number; benchmark?: string; riskFreeRate?: number };
  risk?: RiskReport;
  benchmarkEquity?: SeriesPoint[];
  currency?: string | null;
  equity: SeriesPoint[];
  drawdown: SeriesPoint[];
  buyHold: SeriesPoint[];
  assumptions: Record<string, string>;
  trades?: BacktestTrade[];
  tradeCount?: number;
}

/* Feature engineering ------------------------------------------------------------------------ */

export type LabelKind = "direction" | "return_bucket" | "volatility_regime";

export interface FeatureCatalogEntry {
  name: string;
  group: string;
  description: string;
  defaults: Record<string, number | number[]>;
}

export interface FeaturesRequestPayload {
  symbol: string;
  range: "1y" | "2y" | "5y";
  features?: string[];
  label: LabelKind;
  horizon: number;
  testFraction: number;
  embargo: number;
}

export interface LabelShare {
  label: number;
  name: string;
  count: number;
  share: number;
}

export interface DatasetPreviewRow {
  timestamp: string;
  label: number;
  values: Record<string, number>;
}

export interface DatasetPreview {
  symbol: string;
  range: string;
  dataSource: DataSource;
  featureConfig: Record<string, Record<string, number | number[]>>;
  featureNames: string[];
  shape: { rows: number; columns: number };
  inputBars: number;
  droppedRows: number;
  label: { kind: LabelKind; horizon: number; names: Record<string, string> };
  split: { trainStart: string; trainEnd: string; testStart: string; testEnd: string; trainRows: number; testRows: number; embargoBars: number };
  labelDistribution: { train: LabelShare[]; test: LabelShare[]; all: LabelShare[] };
  trainStats: Record<string, { mean: number | null; std: number | null; min: number | null; max: number | null }>;
  head: DatasetPreviewRow[];
  tail: DatasetPreviewRow[];
}

/* ML models ---------------------------------------------------------------------------------- */

export type ModelType = "logistic" | "random_forest" | "gradient_boosting";

export interface TrainModelPayload extends FeaturesRequestPayload {
  model: ModelType;
  costBps: number;
  slippageBps: number;
}

export interface ClassificationReport {
  accuracy: number;
  baselineAccuracy: number;
  baselineClass: number;
  beatsBaseline: boolean;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  rocAucReason?: string | null;
  averaging: "binary" | "macro";
  confusionMatrix: { labels: string[]; matrix: number[][] };
  perClass: Array<{ label: number; name: string; precision: number; recall: number; f1: number; support: number }>;
  testRows: number;
}

export interface ModelStrategyReport {
  rule: string;
  costs: { costBps: number; slippageBps: number };
  period: { start: string; end: string; bars: number };
  summary: BacktestSummaryStats;
  metrics: CurveMetrics & { winRate: number | null; profitFactor: number | null };
  unavailable: Record<string, string>;
  buyHoldMetrics: CurveMetrics;
  equity: SeriesPoint[];
  buyHold: SeriesPoint[];
  trades: BacktestTrade[];
}

export interface ModelTracking {
  enabled: boolean;
  logged?: boolean;
  runId?: string;
  url?: string;
}

export interface ModelRecord {
  id: string;
  symbol: string;
  modelType: ModelType;
  modelName: string;
  hyperparams: Record<string, string | number | null>;
  featureConfig: Record<string, Record<string, number | number[]>>;
  featureNames: string[];
  label: { kind: LabelKind; horizon: number };
  range: string;
  split: { trainStart: string; trainEnd: string; testStart: string; testEnd: string; trainRows: number; testRows: number; embargoBars: number };
  labelDistribution: { train: LabelShare[]; test: LabelShare[]; all: LabelShare[] };
  classification: ClassificationReport;
  strategy: ModelStrategyReport;
  artifactBytes: number;
  dataSource: DataSource;
  trainedAt: string;
  tracking?: ModelTracking;
}

export interface ModelSummary {
  id: string;
  symbol: string;
  modelType: ModelType;
  modelName: string;
  label: { kind: LabelKind; horizon: number };
  range: string;
  trainedAt: string;
  dataSource: DataSource;
  artifactBytes: number;
  accuracy: number | null;
  baselineAccuracy: number | null;
  rocAuc: number | null;
  strategyReturn: number | null;
  buyHoldReturn: number | null;
  strategySharpe: number | null;
  tracking?: ModelTracking | null;
}

export interface ModelSignal {
  modelId: string;
  modelType: ModelType;
  trainedAt: string;
  symbol: string;
  asOf: string;
  prediction: number;
  predictionName: string;
  probabilities: Record<string, number>;
  signal: "buy" | "flat";
  rule?: string | null;
  dataSource: DataSource;
}
