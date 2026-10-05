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

export interface SimulationStatusChange {
  status: SimulationStatus;
  at: string;
}

export interface Simulation {
  currency: "INR";
  id: string;
  symbol: string;
  /** Registry strategy id (older records may hold free text until set up). */
  strategy: string;
  strategyName?: string;
  params?: Record<string, number>;
  config?: { costBps: number; slippageBps: number; benchmark: string };
  startingCapital: number;
  status: string;
  createdAt: string;
  startedAt?: string;
  statusHistory?: SimulationStatusChange[];
  /** "needs_setup" = saved before strategies were tracked; choose one to start tracking. */
  tracking?: "tracked" | "needs_setup";
  notes?: string | null;
}

export interface SimulationInput {
  currency?: "INR";
  symbol: string;
  strategy: string;
  params?: Record<string, number>;
  startingCapital: number;
  costBps?: number;
  slippageBps?: number;
  benchmark?: string;
  notes?: string;
}

/** Lifecycle states accepted by the API when updating a simulation. */
export type SimulationStatus = "active" | "paused" | "completed" | "archived";

export interface SimulationUpdate {
  status?: SimulationStatus;
  notes?: string | null;
  strategy?: string;
  params?: Record<string, number>;
}

export type SimulationState = "ok" | "waiting" | "needs_setup" | "unavailable";

export interface SimulationSummary {
  state: SimulationState;
  reason?: string | null;
  equity: number | null;
  pnl: number | null;
  totalReturn: number | null;
  buyHoldReturn: number | null;
  excessVsBuyHold: number | null;
  tradingDays: number | null;
  signal?: "Long" | "Flat" | null;
  pendingSide?: "buy" | "sell" | null;
  spark: number[];
  asOf: string;
}

export interface SimulationFill {
  side: "buy" | "sell";
  time: string;
  date: string;
  barTime: string;
  /** Instrument currency, slippage included. */
  price: number;
  shares: number;
  fxRate: number;
  /** INR. */
  notional: number;
  cost: number;
  reason: string;
  pnl?: number;
  returnPct?: number | null;
}

export interface SimulationReport {
  simulationId: string;
  symbol: string;
  status: string;
  state: SimulationState;
  reason: string | null;
  currency: "INR";
  startingCapital: number;
  startedAt: string;
  strategy: { id: string; name: string; params: Record<string, number> } | null;
  benchmarkSymbol: string | null;
  costs: { costBps: number; slippageBps: number } | null;
  legacy: boolean;
  notes: string[];
  assumptions: string[];
  asOf: string;
  instrument: { name?: string | null; exchange?: string | null; currency: string; timezone: string; source?: DataSource } | null;
  fx: { pair: string; rate: number; source?: DataSource; basis: string } | null;
  session: { timezone: string; open: boolean; label: string } | null;
  signal: {
    current: 0 | 1;
    label: "Long" | "Flat";
    provisional: boolean;
    paused?: boolean;
    pending: { side: "buy" | "sell"; when: string | null; provisional: boolean; reason: string } | null;
  } | null;
  summary: {
    startingCapital: number;
    equity: number;
    cash: number;
    pnl: number;
    totalReturn: number;
    buyHoldReturn: number | null;
    excessVsBuyHold: number | null;
    benchmarkReturn: number | null;
    excessVsBenchmark: number | null;
    maxDrawdown: number | null;
    exposure: number;
    totalCosts: number;
    fills: number;
    closedTrades: number;
    winningTrades: number;
    tradingDays: number;
    firstSession: string | null;
    lastSession: string | null;
  };
  position: {
    shares: number;
    avgPrice: number | null;
    lastPrice: number;
    costBasis: number;
    marketValue: number;
    unrealizedPnl: number;
    unrealizedReturn: number | null;
  } | null;
  trades: SimulationFill[];
  equity: Array<{ timestamp: string; value: number }>;
  buyHold: Array<{ timestamp: string; value: number }>;
  benchmark: Array<{ timestamp: string; value: number }>;
  benchmarkSource?: DataSource | null;
  metrics: Record<string, number | null>;
  metricReasons: Record<string, string>;
  mark: { price: number; source?: DataSource; time?: string | null } | null;
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
  currency?: string | null;
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
  copilotProvider?: { provider: string; model: string } | null;
  experimentTracking?: boolean;
  nlp?: NlpStatus;
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

/* Copilot ------------------------------------------------------------------------------------ */

export interface CopilotAction {
  type: "backtest" | "model" | "simulation" | "note";
  id: string;
  label: string;
  path: string;
}

export type CopilotEvent =
  | { type: "tool_start"; id: string; name: string; args: string; stateChanging: boolean }
  | { type: "tool_end"; id: string; name: string; ok: boolean; error: string | null; result: Record<string, unknown> | null }
  | { type: "message"; content: string; budgetReached?: boolean }
  | { type: "actions"; actions: CopilotAction[] }
  | { type: "sources"; sources: RagHit[] }
  | { type: "masked"; kinds: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

// --- Research NLP (sentiment, notes, retrieval) ---------------------------------------------

export interface NlpStatus {
  configured: boolean;
  provider: "hf-api" | "local";
  sentimentModel: string;
  embeddingModel: string;
  vectorSearch: "atlas" | "exact";
}

export type SentimentLabel = "bullish" | "bearish" | "neutral";

export interface SentimentScore {
  label: SentimentLabel;
  /** Probability of the winning label (0–1); null when the model returned no known label. */
  confidence: number | null;
  scores: Record<SentimentLabel, number | null>;
}

export interface SentimentResult extends SentimentScore {
  text: string;
}

export interface SentimentResponse {
  provider: string;
  model: string;
  results: SentimentResult[];
}

export type NoteKind = "note" | "backtest" | "model";

export interface ResearchNote {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  refId: string | null;
  symbol: string | null;
  tags: string[];
  sentiment: SentimentScore | null;
  embeddingModel: string | null;
  /** False until the note has an embedding (saved while NLP was unavailable). */
  indexed: boolean;
  createdAt: string;
}

export interface NoteCreatePayload {
  kind?: NoteKind;
  title?: string;
  body?: string;
  refId?: string;
  tags?: string[];
}

export interface RagHit {
  id: string;
  title: string;
  kind: NoteKind;
  refId: string | null;
  symbol: string | null;
  snippet: string;
  /** Cosine similarity, -1..1 (higher = closer in meaning). */
  score: number;
  createdAt: string;
  path: string;
}

export interface RagResult {
  embeddingModel: string;
  searched: number;
  reindexed: number;
  pendingIndex: number;
  method: "numpy" | "atlas";
  hits: RagHit[];
}

/* Portfolio of real holdings (Phase 10) ------------------------------------------------------ */
export interface PortfolioImport {
  id: string;
  source: string;
  rowCount: number;
  createdAt: string;
}

export interface PortfolioHolding {
  id: string;
  importId: string;
  symbol: string | null;
  isin: string | null;
  schemeCode: string | null;
  name: string;
  exchange: string | null;
  currency: string | null;
  type: string | null;
  sector: string | null;
  assetType: "equity" | "etf" | "mutual_fund" | "gold" | "other";
  quantity: number;
  avgCost: number | null;
  buyDate: string | null;
  createdAt: string;
}

export interface Portfolio {
  imports: PortfolioImport[];
  holdings: PortfolioHolding[];
}

export interface ImportRowPayload {
  symbol?: string;
  isin?: string;
  quantity: number;
  avgCost?: number;
  buyDate?: string;
  assetType: string;
}

/** Structured 422 bodies from POST /portfolio/imports. Never contain submitted values. */
export type ImportRejection =
  | { code: "personal_data_detected"; message: string; findings: Array<{ row: number; field: string; kind: string; label: string }> }
  | { code: "unresolved_instruments"; message: string; rows: Array<{ row: number; field: string }> }
  | { code: "invalid_rows"; message: string; problems: Array<{ row: number | null; field: string | null; type: string; message: string }> }
  | { code: "fund_lookup_unavailable"; message: string };

export interface PortfolioPosition {
  key: string;
  label: string;
  symbol: string | null;
  isin: string | null;
  assetType: string;
  sector: string | null;
  currency: string;
  quantity: number;
  price: number;
  priceSource: string;
  priceAsOf: string | null;
  fxRate: number | null;
  value: number;
  weight: number;
  cost: number | null;
  pnl: number | null;
  pnlReturn: number | null;
  beta: number | null;
  inRiskFigures: boolean;
}

export interface MixItem {
  label: string;
  weight: number;
}

export interface ConcentrationFigures {
  top1: number | null;
  top5: number | null;
  hhi: number | null;
  effectiveHoldings: number | null;
}

export interface PortfolioReportData {
  asOf: string;
  currency: "INR";
  range: string;
  confidence: number;
  benchmark: { symbol: string; source?: DataSource | null };
  totals: { value: number; positions: number; lots: number; cost: number | null; costCoverage: number | null; unrealizedPnl: number | null };
  positions: PortfolioPosition[];
  unpriced: Array<{ key: string; label: string; reason: string }>;
  concentration: ConcentrationFigures;
  sectorMix: MixItem[];
  assetMix: MixItem[];
  risk: Record<string, number | null>;
  riskReasons: Record<string, string>;
  window: { start: string | null; end: string | null; days: number };
  coverage: { included: string[]; excluded: Array<{ key: string; label: string; reason: string }> };
  equity: Array<{ timestamp: string; value: number }>;
  benchmarkCurve: Array<{ timestamp: string; value: number }>;
  drawdown: Array<{ timestamp: string; value: number }>;
  correlation: { keys: string[]; matrix: Array<Array<number | null>>; reason: string | null };
  xirr: { value: number | null; reason: string | null; positionsCovered: number };
  observations: string[];
  disclaimer: string;
}

export interface WhatIfPayload {
  range?: string;
  benchmark?: string;
  confidence?: number;
  cap?: { key: string; maxWeight: number };
  remove?: string[];
  shock?: { kind: "market" | "sector"; pct: number; sector?: string };
}

export interface WhatIfSide {
  concentration: ConcentrationFigures;
  sectorMix: MixItem[];
  risk: Record<string, number | null>;
  riskReasons?: Record<string, string>;
}

export interface WhatIfResult {
  before: WhatIfSide;
  after: WhatIfSide & { weights: Record<string, number> };
  shock?: {
    kind: string;
    pct: number;
    sector?: string | null;
    before: { change: number | null; changeInr: number | null };
    after: { change: number | null; changeInr: number | null };
    assumedBetaOne: string[];
  };
}

/* Market intelligence (Phase 11) ------------------------------------------------------------- */
export interface FlowSide {
  buy: number | null;
  sell: number | null;
  net: number | null;
}

export interface InstitutionalFlows {
  cash: Array<{ date: string; fii: FlowSide; dii: FlowSide; fiiCumulative: number; diiCumulative: number }>;
  positioning: Array<{ date: string; fiiIndexFuturesLongShare: number | null; indexFuturesNet: Record<string, number> }>;
  unit: { cash: string; positioning: string };
  asOf: { cash: string | null; positioning: string | null };
  historySince: { cash: string | null; positioning: string | null };
  health: Record<string, { status: string; checkedAt: string; asOf?: string | null } | null>;
}

export interface SectorFlowEntry {
  sector: string;
  netEquity: number | null;
  netTotal: number | null;
  aucEquity: number | null;
  aucShare: number | null;
}

export interface SectorFlows {
  reports: Array<{ date: string; period: string; sectors: SectorFlowEntry[]; total: SectorFlowEntry | null }>;
  unit: string;
  frequency: string;
  asOf: string | null;
  indexPerformance: Array<{ symbol: string; label: string; return: number | null; from?: string; to?: string; reason?: string }>;
  performanceRange: string;
  health: { status: string; checkedAt: string } | null;
}

export interface CapexYear {
  fiscalYearEnd: string;
  capex: number;
  operatingCashFlow: number | null;
  revenue: number | null;
  capexToRevenue: number | null;
  capexToOperatingCashFlow: number | null;
  capexGrowth: number | null;
}

export interface CompanyCapex {
  symbol: string;
  name?: string;
  sector?: string | null;
  source: "live" | "unavailable";
  asOf?: string;
  reason?: string;
  data?: { symbol: string; currency: string | null; years: CapexYear[]; frequency: string };
}

export interface SectorCapex {
  source: "live" | "stored" | "unavailable";
  asOf?: string;
  reason?: string;
  note?: string;
  universe?: string;
  coverage?: { reporting: number; total: number };
  sectors?: Array<{ sector: string; companies: number; years: Array<{ fiscalYear: string; capex: number; revenue: number; reporting: number; capexGrowth: number | null; capexToRevenue: number | null }> }>;
}

// ---------------------------------------------------------------------------------------------
// Strategy research (Phase 13): universe strategies, research datasets, runs and comparisons.

export type Maturity = "baseline" | "research" | "validated";

export interface ResearchParamSpec {
  name: string;
  label: string;
  type: "integer" | "number" | "string" | string;
  default?: number | string | null;
  minimum?: number | null;
  maximum?: number | null;
  options?: string[] | null;
  description?: string | null;
}

export interface StrategyMetadata {
  executionMode: "single-asset" | "universe";
  dataRequirements: string;
  warmupSessions: number;
  rebalance: string;
  holdingHorizon: string;
  riskControls: string[];
  maturity: Maturity;
  defaultTolerance?: number;
  caveats?: string[];
}

export interface ResearchStrategy {
  id: string;
  name: string;
  description: string;
  parameters: ResearchParamSpec[];
  metadata: StrategyMetadata;
}

export interface ResearchDataset {
  version: string;
  universe: string;
  benchmarkSymbol: string;
  source: string;
  downloadedAt: string;
  storedAt?: string;
  survivorshipBiased: boolean;
  caveats: string[];
  period: { start: string; end: string; sessions: number };
  symbolCount: number;
  excludedDates?: { weekend: string[]; noTrading: string[] };
  benchmarkCoverage?: { sessions: number; missing: number };
  coverageSummary?: { symbols: number; lateListings: number; missingSessions: number; zeroVolumeSessions?: number };
}

export interface ResearchRunSettings {
  datasetVersion: string;
  start?: string;
  end?: string;
  capital: number;
  feeSchedule: "nse-delivery" | "flat-bps";
  brokerage: "zero" | "flat" | "bps";
  brokerageFlatInr?: number;
  brokerageBps?: number;
  costBps?: number;
  slippageBps: number;
  participationCap: number;
  minMedianTradedValueInr: number;
  priceFloor: number;
  cashBuffer?: number;
  minTradeValue?: number;
  riskFreeRate: number;
}

export interface ResearchStrategyChoice {
  strategy: string;
  params: Record<string, number | string>;
  tolerance?: number;
  label?: string;
}

export interface ResearchComparePayload extends ResearchRunSettings {
  strategies: ResearchStrategyChoice[];
  costStress: number;
}

export type ResearchMetrics = Partial<Record<"totalReturn" | "cagr" | "volatility" | "sharpe" | "sortino" | "maxDrawdown", number | null>>;

export interface ResearchHeadline {
  totalReturn: number | null;
  cagr: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  annualTurnover: number | null;
  totalCosts: number | null;
  excessReturn: number | null;
}

export interface ResearchFill {
  date: string;
  symbol: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  notional: number;
  costs: Record<string, number>;
  costTotal: number;
  realisedPnl: number | null;
  decidedOn: string;
  reason: string;
  feeSchedule?: string;
  feeVersion?: string;
}

export interface ResearchRunSummaryBlock {
  startingCapital: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  realisedPnl: number;
  unrealisedPnl: number;
  dividends: number;
  totalCosts: number;
  costBreakdown: Record<string, number>;
  tradedNotional: number;
  turnover: number;
  annualTurnover: number;
  averageExposure: number;
  fills: number;
  staleMarks: number;
  openPositions: number;
}

export interface ResearchSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ResearchRunRecord {
  id: string;
  kind: "run";
  label: string;
  createdAt: string;
  comparisonId?: string;
  strategy: { id: string; name: string; params: Record<string, number | string>; metadata: StrategyMetadata };
  dataset: { version: string; universe: string; benchmarkSymbol: string; period: { start: string; end: string; sessions: number }; survivorshipBiased: boolean };
  settings: ResearchRunSettings;
  tolerance: number;
  costMultiplier: number;
  engineVersion: number;
  configHash: string;
  resultHash: string;
  period: { start: string; end: string; sessions: number };
  summary: ResearchRunSummaryBlock;
  metrics: ResearchMetrics;
  metricReasons: Record<string, string>;
  drawdown: { maxDrawdown?: number | null; peak?: string | null; trough?: string | null; recovery?: string | null; durationBars?: number; recovered?: boolean };
  benchmark: { symbol: string; label: string; available: boolean; metrics?: ResearchMetrics; beta?: number | null; alpha?: number | null; correlation?: number | null; excessReturn?: number | null; missingSessions?: number };
  series: { equity: ResearchSeriesPoint[]; drawdown: ResearchSeriesPoint[]; exposure: ResearchSeriesPoint[]; benchmark: ResearchSeriesPoint[] };
  pending: Array<{ symbol: string; side: "buy" | "sell"; shares: number; decidedOn: string; reason?: string | null }>;
  assumptions: Record<string, string>;
  caveats: string[];
  counts: { fills: number; fillsStored: number; holdingChanges: number; decisions: number; orderEvents: number; dividends: number };
  manifest?: ResearchManifest;
  tracking?: { enabled: boolean; logged?: boolean; runId?: string; url?: string; experiment?: string; artifactsUploaded?: string[] };
  lastReplay?: ResearchReplay;
}

export interface ResearchManifest {
  code: { commit: string; dirty: boolean; source: string };
  dataset: { version: string; universe: string; benchmark: string; source?: string; downloadedAt?: string; survivorshipBiased: boolean; sectorCatalog?: string | null };
  window: { start: string; end: string };
  engine: { version: number; configHash: string; resultHash: string };
  costs: { feeSchedule: string; feeVersions: string[]; brokerage: string; slippageBps: number; costMultiplier: number };
  trial: { index: number; count: number };
  artifacts?: Record<string, string>;
}

export interface ResearchReplay {
  identical: boolean;
  replayed: boolean;
  reason?: string | null;
  resultHash?: string;
  storedResultHash?: string;
  configHashMatches?: boolean;
  maxAbsEquityDiff?: number | null;
  checkedAt: string;
}

export interface ResearchComparisonRow {
  runId: string;
  label: string;
  strategyId: string;
  maturity: Maturity;
  costMultiplier: number;
  headline: ResearchHeadline;
  metrics: ResearchMetrics;
  summary: Partial<ResearchRunSummaryBlock>;
}

export interface ResearchComparison {
  id: string;
  kind: "comparison";
  label: string;
  createdAt: string;
  dataset: ResearchRunRecord["dataset"];
  settings: ResearchRunSettings;
  costStress: number;
  period: { start: string; end: string; sessions: number };
  rows: ResearchComparisonRow[];
  series: { runs: Array<{ runId: string; label: string; equity: ResearchSeriesPoint[] }>; benchmark: ResearchSeriesPoint[] };
  benchmark: { symbol: string; label: string; metrics?: ResearchMetrics; available: boolean };
  caveats: string[];
  conventions: Record<string, string>;
}

export interface ResearchRunListItem {
  id: string;
  kind: "run" | "comparison";
  label: string;
  createdAt: string;
  costMultiplier?: number;
  comparisonId?: string;
  period?: { start: string; end: string; sessions: number };
  strategy?: { id: string; name: string; maturity: Maturity };
  dataset?: { version: string; universe: string; survivorshipBiased: boolean };
  headline?: ResearchHeadline;
  runs?: Array<{ runId: string; label: string }>;
  status?: { replayIdentical?: boolean | null; tracked?: boolean | null };
}

export interface RankingFamilySummary {
  name: string;
  maturity: Maturity;
  validationMeanIc: number | null;
  trainingCutoff: string | null;
}

export interface RankingExperimentSummary {
  id: string;
  createdAt: string;
  dataset: { version: string; universe: string; survivorshipBiased: boolean; period?: { start: string; end: string; sessions: number } };
  holdoutUses: number;
  families: Record<string, RankingFamilySummary>;
}

export interface IcSummary {
  meanIc: number | null;
  icStd: number | null;
  icTstat: number | null;
  positiveShare: number | null;
  dates: number;
  topDecileSpread?: number | null;
  icCi?: { low: number | null; high: number | null; draws: number };
}

export interface RankingTradingRow {
  label: string;
  metrics: ResearchMetrics;
  turnover: number;
  costs: number;
  excessVsEqualWeight: number | null;
  monthlyExcessCi?: { low: number | null; high: number | null; draws: number } | null;
  maxDrawdownWorseThanIndex?: number | null;
}

export interface RankingFamily {
  name: string;
  params: Record<string, number | string>;
  validation: IcSummary;
  holdout?: IcSummary;
  promotion: { maturity: Maturity; passed: boolean; criteria: Array<{ criterion: string; value: number | null; passed: boolean; reason?: string }> };
  final: { trainingCutoff: string; trainRows: number; gate: { passed: boolean; checks: Array<{ check: string; passed: boolean; reason?: string }> }; artifactBytes: number };
}

export interface RankingExperiment {
  id: string;
  createdAt: string;
  storedAt?: string;
  dataset: RankingExperimentSummary["dataset"];
  code: { commit: string; dirty: boolean };
  seed: number;
  config: Record<string, unknown>;
  settings: ResearchRunSettings;
  schemaHash: string;
  featureFamilies: Array<{ family: string; description: string; features: string[] }>;
  target: string;
  panel: { rows: number; labelled: number; decisionDates: number };
  split: Record<"development" | "validation" | "holdout", { start: string; end: string; dates: number }>;
  trials: Array<{ index: number; count: number; kind: string; params: Record<string, number>; meanIc: number | null; icTstat: number | null }>;
  families: Record<string, RankingFamily>;
  validationTrading: { start: string; end: string; runs: Record<string, RankingTradingRow>; index?: ResearchMetrics } | null;
  holdoutTrading: { start: string; end: string; runs: Record<string, RankingTradingRow>; index?: ResearchMetrics } | null;
  holdoutUses: number;
  criteria: Record<string, number>;
  caveats: string[];
}

export interface ResearchFillsPage {
  total: number;
  totalInRun: number;
  items: ResearchFill[];
  orderEvents: Array<{ date: string; symbol: string; event: string; decidedOn: string }>;
  dividends: Array<{ date: string; symbol: string; shares: number; perShare: number; amount: number }>;
}

export interface ResearchHoldings {
  asOf: string | null;
  positions: Array<{ symbol: string; shares: number }>;
  decision: { date: string; weights: Array<{ symbol: string; weight: number }> } | null;
  truncated?: boolean;
}
