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
    definition: "A financial language model's read of text as bullish, bearish, or neutral. Confidence is the model's probability for the winning label.",
    caveat: "Headline tone is not a trading signal on its own; the model reads wording, not the market's reaction.",
  },
  rag: {
    term: "Retrieval (RAG)",
    definition: "Before answering, the copilot looks up your most relevant saved notes and reports and cites them.",
  },
  similarity: {
    term: "Similarity",
    definition: "How close two texts are in meaning: the cosine of the angle between their embedding vectors.",
    formula: "cos(a, b) = a · b / (‖a‖ ‖b‖), from −1 to 1",
    caveat: "Scores compare notes against one query; there is no universal cut-off for relevant.",
  },
  embedding: {
    term: "Embedding",
    definition: "A list of numbers a language model assigns to a text so that texts with similar meaning end up close together.",
  },
  unrealizedPnl: {
    term: "Unrealized P&L",
    definition: "Gain or loss on the position you still hold: its current market value minus what it cost, including the entry fee. It becomes realized only when the position is sold.",
    formula: "shares × price × FX − cost basis",
  },
  pendingOrder: {
    term: "Pending order",
    definition: "The order the strategy will place at the next session's open because its signal changed at the latest close.",
    caveat: "While the market is open the signal uses today's price so far, so it can still change before the close.",
  },
  markToMarket: {
    term: "Marked to market",
    definition: "Valuing an open position at the latest available price instead of what was paid for it. Live quotes are used while the market is open; otherwise the last close.",
  },
  paperFill: {
    term: "Simulated fill",
    definition: "A paper trade: the price the simulation assumes it got, at the session open after the signal, including slippage. No real order is placed.",
  },
  fxConversion: {
    term: "Exchange-rate conversion",
    definition: "Simulation capital is in rupees. A non-INR instrument is bought and valued with that currency's daily INR rate on each day.",
    caveat: "Currency moves change the INR result even when the share price doesn't.",
  },
  valueAtRisk: {
    term: "Value at risk (VaR)",
    definition: "The one-day loss the portfolio, as held today, exceeded on only the worst days of the window — 5% of days at 95% confidence. Measured from history, not a forecast.",
    formula: "−(5th percentile of daily returns) at 95%",
    caveat: "Calm windows understate it; it says nothing about how bad the worst days were (see CVaR).",
  },
  expectedShortfall: {
    term: "CVaR (expected shortfall)",
    definition: "The average loss on the days that were worse than the VaR threshold.",
    formula: "−mean(daily returns at or below the VaR cut-off)",
  },
  hhi: {
    term: "Concentration (HHI)",
    definition: "Sum of squared weights. 1 means everything is in one holding; lower means value is spread more evenly.",
    formula: "Σ weight²; effective holdings = 1 / HHI",
  },
  trackingError: {
    term: "Tracking error",
    definition: "How far the portfolio's daily returns typically differ from the index's, annualized. Higher means it behaves less like the index.",
    formula: "stdev(portfolio − index daily returns) × √252",
  },
  xirr: {
    term: "XIRR",
    definition: "Money-weighted annual return using the purchase dates and costs you entered and today's value.",
    caveat: "Only holdings with both a purchase date and a cost are included.",
  },
  asHeld: {
    term: "Portfolio as held",
    definition: "Today's weights applied to each holding's past daily prices. It shows how the current mix would have behaved, not what your account actually did.",
  },
  crossSectionalMomentum: {
    term: "Cross-sectional momentum",
    definition: "Ranks stocks against each other by their past return and holds the strongest. The common 12-1 version measures from 12 months ago to 1 month ago, skipping the latest month because very recent winners tend to give some back.",
    formula: "score = adjusted close(t − skip) / adjusted close(t − lookback) − 1",
    caveat: "Prone to sharp reversals (momentum crashes).",
  },
  timeSeriesMomentum: {
    term: "Time-series momentum",
    definition: "Looks at one stock on its own: long while its own trailing return is positive (or above a threshold). It doesn't compare stocks with each other.",
  },
  volTargeting: {
    term: "Volatility targeting",
    definition: "Sizes positions so the portfolio's volatility, estimated from recent daily returns, matches a target; calmer stocks get more weight and the book holds cash when markets are volatile.",
    formula: "scale = target / √(wᵀ Σ w) × √252, capped at 100% gross",
    caveat: "An estimate from past returns, not a guarantee of future volatility.",
  },
  turnover: {
    term: "Turnover",
    definition: "How much of the portfolio is traded. Annual turnover of 1 means trading roughly the whole portfolio's value once a year (buys and sells averaged).",
    formula: "Σ |traded value| / 2 / average equity, scaled to 252 sessions",
  },
  survivorshipBias: {
    term: "Survivorship bias",
    definition: "Testing on today's index members leaves out the companies that failed or dropped out, so past results look better than an investor at the time could have achieved.",
  },
  participationCap: {
    term: "Participation cap",
    definition: "The most of a stock's recent average daily volume the simulation may trade in one session; larger orders are spread over several sessions.",
  },
  equalWeightBaseline: {
    term: "Equal-weight baseline",
    definition: "Every eligible stock in the universe at the same weight, rebalanced monthly under the same costs. A strategy has to beat this to show its selection adds anything.",
  },
  costStress: {
    term: "Cost stress",
    definition: "The same strategy rerun with every charge multiplied (2× by default) to see how much of the result survives higher trading costs.",
  },
  statutoryCharges: {
    term: "Statutory charges",
    definition: "Charges on NSE delivery trades besides brokerage: STT (0.1% each side), exchange transaction charge, SEBI fee, stamp duty on buys (0.015%), GST on brokerage and exchange/SEBI fees, and a DP charge per stock sold per day.",
    caveat: "Rates change by circular; each has a source and check date in the fee schedule.",
  },
  maturity: {
    term: "Maturity label",
    definition: "Baseline: a reference method. Research: new, results unproven. Validated: passed criteria that were fixed before testing on unseen data. It describes the method, not how good the numbers look.",
  },
  researchSnapshot: {
    term: "Research snapshot",
    definition: "A frozen, versioned copy of daily prices, volumes and dividends for a universe. The version is a fingerprint of the data, so a run can be repeated exactly.",
  },
  rankIc: {
    term: "Rank IC",
    definition: "Rank information coefficient: the correlation between the order a model predicted for stocks and the order their returns actually came in, per decision date. 0 means no skill; even 0.03–0.05 sustained can matter, but noise is large.",
    formula: "Spearman correlation(predicted scores, realised forward returns), averaged over dates",
    caveat: "A good IC doesn't guarantee a profitable portfolio after costs.",
  },
  holdout: {
    term: "Holdout",
    definition: "The most recent block of dates, kept out of all model and setting choices and evaluated once at the end. Looking at it repeatedly turns it into another tuning set, so each look is counted.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export function glossary(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key];
}
