/**
 * Metric and term definitions shown in info hints and on reference pages.
 * Formulas follow the project's quant conventions exactly — change them there first.
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
  formula?: string;
  caveat?: string;
}

export const GLOSSARY = {
  totalReturn: {
    term: "Total return",
    definition: "How much the value changed over the whole window, as a fraction of the starting value.",
    formula: "end / start − 1",
  },
  annualizedReturn: {
    term: "Annualized return",
    definition: "The total return rescaled to a one-year pace so windows of different length compare fairly.",
    formula: "(1 + total return)^(365 / days) − 1",
    caveat: "Short windows exaggerate this number in both directions.",
  },
  cagr: {
    term: "CAGR",
    definition: "Compound annual growth rate of the equity curve.",
    formula: "(end / start)^(periods per year / periods) − 1",
  },
  sharpe: {
    term: "Sharpe ratio",
    definition: "Average excess return per unit of total volatility, annualized. Higher means more return for the risk taken.",
    formula: "mean(r − rf) / std(r) × √252  (daily data)",
    caveat: "A flat equity curve has no Sharpe ratio (division by zero), so it shows as —.",
  },
  sortino: {
    term: "Sortino ratio",
    definition: "Like Sharpe, but only downside volatility counts as risk.",
    formula: "mean(r − rf) / std(negative r) × √252",
  },
  volatility: {
    term: "Volatility",
    definition: "Annualized standard deviation of period returns — how widely returns swing.",
    formula: "std(r) × √252",
  },
  maxDrawdown: {
    term: "Max drawdown",
    definition: "The worst peak-to-trough fall of the equity curve, shown as a positive percentage.",
    formula: "min((equity − running peak) / running peak)",
    caveat: "Report it with its duration — a long shallow drawdown can hurt as much as a short deep one.",
  },
  winRate: {
    term: "Win rate",
    definition: "Share of closed trades that made money, measured from the real trade log.",
    formula: "winning closed trades / closed trades",
    caveat: "Shown as — when there are no closed trades.",
  },
  profitFactor: {
    term: "Profit factor",
    definition: "Gross profit divided by gross loss across closed trades. Above 1 means winners outweigh losers.",
    formula: "Σ winning PnL / |Σ losing PnL|",
  },
  beta: {
    term: "Beta",
    definition: "How strongly the strategy moves with its benchmark. 1 moves in lockstep; 0 is unrelated.",
    formula: "OLS slope of strategy returns on benchmark returns",
  },
  alpha: {
    term: "Alpha",
    definition: "Return the strategy earned beyond what its beta to the benchmark explains (simple CAPM).",
    formula: "r_strategy − (rf + β × (r_benchmark − rf))",
  },
  finalEquity: {
    term: "Final equity",
    definition: "Cash plus the market value of any open position on the last bar, after every cost and slippage charge.",
  },
  excessReturn: {
    term: "Excess return vs buy-and-hold",
    definition: "Strategy total return minus the buy-and-hold return of the same symbol over the same window, both after costs.",
    caveat: "Negative means simply holding the stock would have done better.",
  },
  exposure: {
    term: "Exposure",
    definition: "Share of bars the strategy held a position. Lower exposure means more time in cash.",
  },
  closedTrades: {
    term: "Closed trades",
    definition: "Round trips (entry and exit) completed in the window. An open position at the end is shown separately and marked to market.",
  },
  correlation: {
    term: "Correlation",
    definition: "How closely the strategy's daily returns move with the benchmark's, from −1 (opposite) to 1 (in lockstep).",
  },
  riskFreeRate: {
    term: "Risk-free rate",
    definition: "Annual return of a riskless asset (for example short-term T-bills). Sharpe, Sortino, and alpha measure returns above it.",
  },
  drawdownDuration: {
    term: "Drawdown duration",
    definition: "Trading days from the peak before the worst drawdown until the equity curve recovered to that peak (or the end of the window if it never did).",
  },
  trades: {
    term: "Trades",
    definition: "How many position changes the strategy made. More trades mean more costs and more chance of overfitting.",
  },
  crossovers: {
    term: "Crossovers",
    definition: "Days where the short moving average crossed the long one. Each crossover is a potential entry or exit.",
  },
  sma: {
    term: "Simple moving average",
    definition: "The mean closing price over the last N days. A short SMA reacts quickly; a long SMA shows the trend.",
    formula: "SMA_N(t) = mean(close[t−N+1 … t])",
  },
  smaCrossover: {
    term: "SMA crossover",
    definition: "Go long when the short average rises above the long average; step aside when it falls below.",
  },
  lookahead: {
    term: "Lookahead bias",
    definition: "Using information that wasn't available yet when the decision was made. It makes backtests look far better than reality.",
    caveat: "Signals computed on bar t must execute on bar t+1.",
  },
  trainTestSplit: {
    term: "Train / test split",
    definition: "Fit on an earlier date range, evaluate on a later one. Never shuffle price data — the future must stay unseen.",
  },
  embargo: {
    term: "Embargo gap",
    definition: "A buffer of at least one bar between the end of training data and the start of test data, so overlapping windows can't leak.",
  },
  walkForward: {
    term: "Walk-forward validation",
    definition: "Repeat the train-then-test step on rolling windows to see whether results hold up across time.",
  },
  transactionCost: {
    term: "Transaction cost",
    definition: "Commission and fees charged on every fill, in basis points of the traded value.",
    formula: "notional × cost_bps / 10,000",
  },
  slippage: {
    term: "Slippage",
    definition: "The gap between the expected price and the actual fill — buys fill slightly higher, sells slightly lower.",
  },
  equityCurve: {
    term: "Equity curve",
    definition: "Cash plus the market value of open positions, recorded every bar. Risk metrics are computed from it, after costs.",
  },
  buyAndHold: {
    term: "Buy-and-hold baseline",
    definition: "Buying the same symbol at the start and holding to the end. A strategy that can't beat it after costs isn't adding value.",
  },
  benchmark: {
    term: "Benchmark",
    definition: "A reference index (for example SPY or ^GSPC) measured over the identical window for comparison.",
  },
  signal: {
    term: "Signal",
    definition: "The strategy's current stance: buy, sell, or hold.",
    caveat: "Today's signal uses naive 5-day momentum; model-based signals arrive with the ML engine.",
  },
  confidence: {
    term: "Confidence",
    definition: "How strong the momentum behind the current signal is, scaled 0–100%. It is not a probability of profit.",
  },
  sourceLive: {
    term: "Live data",
    definition: "Fetched from the market data provider for this request.",
  },
  sourceOffline: {
    term: "Offline fallback",
    definition: "The provider didn't respond, so a stored reference price is shown instead. Never trade or evaluate on it.",
  },
  sourceSynthetic: {
    term: "Synthetic series",
    definition: "A generated placeholder price path used only to keep the interface working while the provider is unreachable.",
  },
  rsi: {
    term: "RSI (14)",
    definition: "Relative Strength Index: compares recent gains to recent losses on a 0–100 scale. Extremes suggest stretched moves.",
  },
  macd: {
    term: "MACD (12/26/9)",
    definition: "Difference between a fast and slow exponential average, with a signal line. Tracks momentum shifts.",
  },
  bollinger: {
    term: "Bollinger position",
    definition: "Where the price sits inside bands two standard deviations around a moving average.",
  },
  labelDirection: {
    term: "Direction label",
    definition: "1 if the close h bars ahead is higher than today's close, else 0. Uses only future closes.",
  },
  labelBucket: {
    term: "Return-bucket label",
    definition: "Down / flat / up depending on whether the forward return is below −0.5%, between, or above +0.5%.",
  },
  labelVolRegime: {
    term: "Volatility-regime label",
    definition: "1 if realized volatility over the next h bars exceeds the median of trailing volatility known today.",
  },
  horizon: {
    term: "Label horizon",
    definition: "How many bars ahead the label looks. Longer horizons need a longer embargo so train and test windows don't overlap.",
  },
  warmup: {
    term: "Warm-up rows",
    definition: "Early rows dropped because long rolling windows aren't filled yet, plus the last rows whose future isn't known. They're dropped once — never filled in.",
  },
  rocAuc: {
    term: "ROC-AUC",
    definition: "How well a model ranks up-days above down-days across all thresholds. 0.5 is coin-flip.",
  },
  baselineAccuracy: {
    term: "Majority-class baseline",
    definition: "Accuracy from always predicting the most common label. A model must beat it to be worth anything.",
  },
  precision: {
    term: "Precision",
    definition: "Of the times the model predicted this class, how often it was right.",
  },
  recall: {
    term: "Recall",
    definition: "Of the times this class actually happened, how often the model caught it.",
  },
  f1: {
    term: "F1 score",
    definition: "Harmonic mean of precision and recall — high only when both are.",
  },
  confusionMatrix: {
    term: "Confusion matrix",
    definition: "Rows are what actually happened, columns are what the model predicted. The diagonal counts correct calls.",
  },
  testAccuracy: {
    term: "Test accuracy",
    definition: "Share of correct predictions on the later, unseen test window — never on the rows the model trained on.",
    caveat: "Compare it with the majority-class baseline; daily direction is close to a coin flip for liquid stocks.",
  },
  sentiment: {
    term: "Sentiment score",
    definition: "A financial language model's read of text as bullish, bearish, or neutral, with a confidence.",
  },
  rag: {
    term: "Retrieval (RAG)",
    definition: "Before answering, the copilot looks up your most relevant saved notes and reports and cites them.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export function glossary(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key];
}
