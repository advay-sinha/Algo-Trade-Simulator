/**
 * Every section and engine of the console, described once. Pages render their header,
 * "how it works" steps, and feature hints from here. A phase that ships an engine flips its
 * `status` and adds content — copy is not hardcoded in components.
 */
import type { GlossaryKey } from "./glossary";

export type SectionStatus = "live" | "beta" | "planned";

export interface SectionFeature {
  id: string;
  label: string;
  hoverText: string;
}

export interface SectionInfo {
  id: string;
  route: string;
  title: string;
  navLabel: string;
  summary: string;
  howItWorks: string[];
  features: SectionFeature[];
  status: SectionStatus;
  /** Roadmap phase that delivers (or delivered) the section. */
  phase?: number;
}

export interface EngineInfo extends SectionInfo {
  purpose: string;
  output: string;
  /** Glossary keys most relevant to this engine (shown on its Glossary tab). */
  terms: GlossaryKey[];
  /** What the planned version will deliver, listed on its Planned state. */
  planned?: string[];
}

export const SECTIONS = {
  overview: {
    id: "overview",
    route: "/",
    title: "Overview",
    navLabel: "Overview",
    summary:
      "A one-glance view of your research: simulations, trained strategies, and how the watchlist moved this month. Use the directory below to jump to the section that does the work.",
    howItWorks: [
      "Totals come from your saved simulations and training runs.",
      "Watchlist trends use one month of daily closes.",
      "Every section links out — nothing is edited here.",
    ],
    features: [],
    status: "live",
  },
  monitor: {
    id: "monitor",
    route: "/monitor",
    title: "Live monitoring",
    navLabel: "Live monitoring",
    summary:
      "Watch quotes for your watchlist and inspect any symbol's price action. Quotes refresh every 30 seconds while this tab is visible, and every value shows where it came from.",
    howItWorks: [
      "Pick a range, then a symbol from the watchlist or search.",
      "Quotes refresh every 30 s; refreshing pauses when the tab is hidden.",
      "Fallback values are badged so you never mistake them for live data.",
    ],
    features: [
      { id: "range", label: "Range", hoverText: "Window of history for the chart. 5 days uses hourly bars; longer ranges use daily bars." },
      { id: "quotes", label: "Watchlist quotes", hoverText: "Latest price and change versus the previous close. Select a row to chart that symbol." },
      { id: "source", label: "Data source", hoverText: "Live means fetched from the provider now. Offline or synthetic means a fallback — don't evaluate strategies on it." },
    ],
    status: "live",
  },
  engines: {
    id: "engines",
    route: "/engines",
    title: "Engines",
    navLabel: "All engines",
    summary:
      "The platform is a pipeline of engines: market data feeds features and strategies, strategies feed the backtester, the backtester feeds risk analytics, and the copilot can drive all of them. Each engine has its own page explaining what it does and how.",
    howItWorks: [
      "Market data → features → strategies (rule-based or ML).",
      "Strategies → backtester → risk report vs a benchmark (all live).",
      "The copilot calls engines on your behalf and explains results.",
    ],
    features: [],
    status: "live",
  },
  lab: {
    id: "lab",
    route: "/lab",
    title: "Training · testing · validation",
    navLabel: "Lab",
    summary:
      "Set parameters, run a strategy over history, and read the result. Today this runs a quick zero-cost SMA crossover backtest over six months of daily data; honest out-of-sample validation and ML models arrive with later engines.",
    howItWorks: [
      "Choose a symbol and the short and long moving-average windows.",
      "Run: the trainer replays six months of daily closes.",
      "Read the metrics, the price-with-averages chart, and the validation status.",
      "Optionally generate the current signal.",
    ],
    features: [
      { id: "windows", label: "Windows", hoverText: "Short must be smaller than long. Six months of data supports a long window up to about 110 days." },
      { id: "validation", label: "Validation", hoverText: "Results are in-sample today: the whole window is used to compute them. Out-of-sample testing with an embargo arrives with the feature pipeline." },
    ],
    status: "beta",
  },
  backtests: {
    id: "backtests",
    route: "/backtests",
    title: "Backtests",
    navLabel: "Backtests",
    summary:
      "Replay a strategy over historical daily bars with realistic fills, transaction costs, and slippage, then compare it with simply buying and holding. Every run is saved so you can reopen it later.",
    howItWorks: [
      "Pick a symbol, strategy, parameters, range, capital, and costs.",
      "Signals from each day's close execute at the next day's open.",
      "Read equity vs buy-and-hold, drawdown, and the trade log.",
    ],
    features: [
      { id: "costs", label: "Costs & slippage", hoverText: "Commission is charged on every fill; slippage moves each fill price against you. Both are in basis points (1 bp = 0.01%)." },
      { id: "sizing", label: "Sizing", hoverText: "Each entry buys as many whole shares as the cash covers; each exit sells the whole position." },
    ],
    status: "live",
    phase: 2,
  },
  datasets: {
    id: "datasets",
    route: "/lab/datasets",
    title: "Dataset builder",
    navLabel: "Dataset builder",
    summary:
      "Turn a symbol's daily bars into a model-ready dataset: technical features, a forward-looking label, and a time-ordered train / test split with an embargo gap — all built so no row can see its own future.",
    howItWorks: [
      "Pick a symbol, history range, label, and the feature groups to compute.",
      "Features use data up to each day; labels use only later days.",
      "Rows split by date: train, an embargo gap, then test. Nothing is shuffled.",
    ],
    features: [
      { id: "split", label: "Train / test split", hoverText: "Earlier dates train, later dates test, with an embargo gap of at least the label horizon so overlapping windows can't leak." },
      { id: "balance", label: "Label balance", hoverText: "Shows how often each label occurs in train and test. A model must beat always guessing the most common one." },
    ],
    status: "live",
    phase: 4,
  },
  models: {
    id: "models",
    route: "/lab/models",
    title: "Model lab",
    navLabel: "Model lab",
    summary:
      "Train a directional model on a leakage-free dataset, then judge it honestly: classification metrics next to a majority-class baseline, and a cost-aware backtest of its signals against buy-and-hold — all on a later window the model never saw.",
    howItWorks: [
      "Choose a symbol, model, label, and feature groups.",
      "The model trains on the earlier window only; scaling never sees test data.",
      "Results come from the unseen test window; every run is saved to the registry.",
    ],
    features: [],
    status: "live",
    phase: 5,
  },
  history: {
    id: "history",
    route: "/history",
    title: "Research history",
    navLabel: "Research records",
    summary:
      "Every backtest, model, simulation, training run, and research note you've saved, newest first. Search by symbol, strategy, or title and filter by type.",
    howItWorks: [
      "Backtests, models, simulations, training runs, and research notes are listed together.",
      "Search matches symbol and strategy; filters narrow by type and status.",
      "Trained models are listed too, with their test results.",
    ],
    features: [],
    status: "live",
  },
  prices: {
    id: "prices",
    route: "/history/prices",
    title: "Price history",
    navLabel: "Price history",
    summary:
      "Explore historical daily bars for any symbol: pick a range, read the chart and the bar-by-bar table, and export it as CSV.",
    howItWorks: [
      "Pick a range first, then a symbol.",
      "Summary figures, the chart, and the table all use the same slice.",
      "Export downloads exactly the rows in the table.",
    ],
    features: [
      { id: "adjusted", label: "Adjusted prices", hoverText: "Bars come from the provider's auto-adjusted history, so splits and dividends don't create false jumps." },
    ],
    status: "live",
  },
  safety: {
    id: "safety",
    route: "/safety",
    title: "Safety",
    navLabel: "Safety",
    summary:
      "How the platform keeps research honest and your account secure: paper trading only, data provenance, bias guards, access controls, and the current known limitations.",
    howItWorks: [
      "Nothing here places real orders — every trade is simulated.",
      "Fallback data is always labeled; strategy metrics follow strict definitions.",
      "Sessions are hashed at rest, revocable, and rate limited.",
    ],
    features: [],
    status: "live",
  },
  simulations: {
    id: "simulations",
    route: "/simulations",
    title: "Simulations",
    navLabel: "Simulations",
    summary:
      "Paper-trading runs you're tracking: which symbol, which strategy, and how much simulated capital. Create one, move it through its lifecycle, or remove it.",
    howItWorks: [
      "Create a simulation with a symbol, strategy, and starting capital.",
      "Move it between active, paused, completed, and archived.",
      "Delete asks for confirmation and can't be undone.",
    ],
    features: [],
    status: "live",
  },
  research: {
    id: "research",
    route: "/research",
    title: "Research memory",
    navLabel: "Research memory",
    summary:
      "Keep your research findings in one searchable place. Save notes or summaries of backtests and models, find them again by meaning rather than exact words, and score headlines as bullish, bearish, or neutral with a financial language model. The copilot reads the notes most relevant to each question and cites them.",
    howItWorks: [
      "Each note is turned into an embedding when it's saved; notes you write are also scored for sentiment.",
      "Searching compares your question's embedding with your notes only — never anyone else's.",
      "The copilot receives your closest notes as context and cites the ones it used.",
    ],
    features: [
      { id: "private", label: "Private to you", hoverText: "Every search filters by your account first. Your notes never reach another user's results or copilot context." },
      { id: "hosted", label: "Hosted models", hoverText: "Sentiment uses FinBERT and search uses a small sentence-embedding model, both run through the Hugging Face inference service. Nothing large is installed on the server." },
      { id: "unindexed", label: "Saved even when offline", hoverText: "If the language service is unavailable, notes still save and are indexed automatically on your next search." },
    ],
    status: "live",
    phase: 7,
  },
} satisfies Record<string, SectionInfo>;

export const ENGINES: EngineInfo[] = [
  {
    id: "market-data",
    route: "/engines/market-data",
    title: "Market data engine",
    navLabel: "Market data",
    purpose: "Fetches quotes, price history, and symbol search, and labels every value with its source.",
    output: "Quotes, OHLCV bars, search results",
    summary:
      "Every other engine starts here. Requests try the yfinance client first, then Yahoo's public API, and only then a clearly labeled offline fallback so the interface keeps working during provider outages.",
    howItWorks: [
      "Validate the symbol (letters, digits, . ^ = - only) before any outbound call.",
      "Try yfinance, then Yahoo's HTTP API.",
      "If both fail, return a fallback value marked offline or synthetic.",
    ],
    features: [
      { id: "fallback", label: "Fallback chain", hoverText: "yfinance → Yahoo HTTP → offline reference. Each step is logged; fallback results always carry a source flag." },
      { id: "validation", label: "Symbol validation", hoverText: "Malformed symbols are rejected with a 422 before reaching the provider." },
      { id: "rate", label: "Rate limiting", hoverText: "Quote requests are limited per client so the API can't be used as an open proxy." },
    ],
    terms: ["sourceLive", "sourceOffline", "sourceSynthetic"],
    status: "live",
    phase: 0,
  },
  {
    id: "strategy",
    route: "/engines/strategy",
    title: "Strategy engine",
    navLabel: "Strategies",
    purpose: "Turns prices into trading decisions behind one common interface.",
    output: "Signal series (long / flat)",
    summary:
      "Strategies turn price history into positions. Three rule-based strategies — SMA crossover, time-series momentum, and mean reversion — run in the backtester behind one interface; ML strategies plug into the same interface later.",
    howItWorks: [
      "Each strategy declares its parameters.",
      "Given price history it produces a signal per bar.",
      "Signals feed the backtester, which executes them at the next bar's open.",
    ],
    features: [
      { id: "catalog", label: "Strategy catalog", hoverText: "Built-in strategies with their default parameters and the market conditions they suit." },
      { id: "interface", label: "Common interface", hoverText: "Every strategy, rule-based or ML, exposes generate_signals(prices) so the backtester treats them identically." },
    ],
    terms: ["smaCrossover", "sma", "crossovers", "signal"],
    status: "live",
    phase: 2,
  },
  {
    id: "backtesting",
    route: "/engines/backtesting",
    title: "Backtesting engine",
    navLabel: "Backtesting",
    purpose: "Replays a strategy over history with realistic fills and costs.",
    output: "Trade log, equity curve, drawdown curve",
    summary:
      "The backtester converts signals into trades, applies transaction costs and slippage on every fill, and tracks the equity curve bar by bar. It's the foundation every risk and ML result builds on.",
    howItWorks: [
      "A signal on bar t fills at bar t+1's open — never the bar it was computed on.",
      "Each fill pays costs and slippage.",
      "Cash plus marked-to-market positions form the equity curve.",
    ],
    features: [
      { id: "fills", label: "Next-bar fills", hoverText: "Prevents lookahead bias: decisions use only information available before the fill." },
      { id: "costs", label: "Costs on every fill", hoverText: "Commission in basis points plus direction-aware slippage." },
      { id: "deterministic", label: "Deterministic", hoverText: "The same inputs always produce identical results." },
    ],
    terms: ["lookahead", "transactionCost", "slippage", "equityCurve", "buyAndHold"],
    status: "live",
    phase: 2,
  },
  {
    id: "risk",
    route: "/engines/risk",
    title: "Risk analytics engine",
    navLabel: "Risk analytics",
    purpose: "Measures risk-adjusted performance against a benchmark.",
    output: "Risk report (Sharpe, Sortino, drawdown, beta…)",
    summary:
      "Every backtest gets a finance-grade risk report computed from the post-cost equity curve and compared with buy-and-hold and a benchmark index over the identical window. Open any backtest's Risk tab to see it; definitions are on the Glossary tab.",
    howItWorks: [
      "Compute period returns from the equity curve (after costs).",
      "Annualize using the data's real periods per year.",
      "Regress against the benchmark for beta and alpha.",
    ],
    features: [
      { id: "post-cost", label: "Post-cost returns", hoverText: "Metrics use the equity curve, so costs and slippage are already included." },
      { id: "nulls", label: "No fake numbers", hoverText: "Metrics that need more data return — with a reason instead of NaN or infinity." },
    ],
    terms: ["sharpe", "sortino", "maxDrawdown", "drawdownDuration", "cagr", "volatility", "winRate", "profitFactor", "beta", "alpha", "correlation", "riskFreeRate", "benchmark"],
    status: "live",
    phase: 3,
  },
  {
    id: "features",
    route: "/engines/features",
    title: "Feature engineering engine",
    navLabel: "Features",
    purpose: "Builds leakage-free indicator datasets for models.",
    output: "Feature matrix, labels, split boundaries",
    summary:
      "Turns raw bars into model-ready datasets: returns, volatility, RSI, MACD, Bollinger position, moving-average ratios, and more — with labels and a time-ordered train/test split that can't see the future.",
    howItWorks: [
      "Pull history through the market data engine.",
      "Compute indicators using only data up to each bar.",
      "Label with future outcomes and split by date with an embargo gap.",
    ],
    features: [
      { id: "leakage", label: "Leakage tests", hoverText: "Recomputing features on truncated data must reproduce identical rows." },
      { id: "balance", label: "Label balance", hoverText: "Class distribution is reported before training so imbalance is visible." },
    ],
    terms: ["rsi", "macd", "bollinger", "trainTestSplit", "embargo", "lookahead"],
    status: "live",
    phase: 4,
  },
  {
    id: "ml",
    route: "/engines/ml",
    title: "ML engine",
    navLabel: "ML models",
    purpose: "Trains directional models and backtests their signals.",
    output: "Model report, registry entry, live signal",
    summary:
      "Trains directional models on the feature datasets, evaluates them honestly against a majority-class baseline and buy-and-hold, and turns predictions into signals the backtester can replay.",
    howItWorks: [
      "Train logistic regression, random forest, or gradient boosting on the time-ordered split.",
      "Report classification metrics next to strategy-level, risk-adjusted results.",
      "Register the model; generate live signals traceable to it.",
    ],
    features: [
      { id: "honest", label: "Honest evaluation", hoverText: "Accuracy is always shown next to the majority-class baseline and a buy-and-hold backtest." },
      { id: "registry", label: "Model registry", hoverText: "Every training run is stored with its features, window, parameters, and metrics." },
    ],
    terms: ["testAccuracy", "baselineAccuracy", "rocAuc", "precision", "recall", "f1", "confusionMatrix", "walkForward", "buyAndHold"],
    status: "live",
    phase: 5,
  },
  {
    id: "copilot",
    route: "/engines/copilot",
    title: "Research copilot",
    navLabel: "Copilot",
    purpose: "Runs research tools for you and explains the results.",
    output: "Answers, explanations, actions",
    summary:
      "A tool-calling research assistant available from every page. It runs backtests, trains and evaluates models, reads your saved reports, searches your research notes, and creates simulations — through the same validated code paths as the interface — and explains what it found. Notes it relied on are cited, and every saved action is listed under its reply.",
    howItWorks: [
      "Open the copilot from the top bar on any page.",
      "It picks tools (backtest, model training, reports, quotes…) and you watch each one run.",
      "The reply cites the numbers it got back; saved results link straight to their pages.",
    ],
    features: [
      { id: "guardrails", label: "Guardrails", hoverText: "Tools run as you and only see your data, inputs are validated like the forms, at most 5 tool calls per message, and every saved action is echoed back." },
      { id: "injection", label: "Prompt-injection posture", hoverText: "It never fetches URLs or files, and treats tool results and quoted text as data, not instructions." },
      { id: "config", label: "Model provider", hoverText: "Runs on any OpenAI-compatible provider, including free ones: Groq (hosted open-weight models such as gpt-oss and Qwen) or Ollama (fully local, open source). Without one, it says it isn't configured." },
    ],
    terms: ["signal"],
    status: "live",
    phase: 6,
  },
  {
    id: "research",
    route: "/engines/research",
    title: "NLP research engine",
    navLabel: "NLP research",
    purpose: "Scores text sentiment and remembers your research notes.",
    output: "Sentiment scores, retrieved notes",
    summary:
      "Classifies headlines and notes as bullish, bearish, or neutral with a financial language model, and lets the copilot retrieve your own saved notes and reports when it answers.",
    howItWorks: [
      "Save notes; each is embedded for semantic search.",
      "Sentiment requests go to a hosted financial model.",
      "The copilot retrieves only your notes and cites them.",
    ],
    features: [
      { id: "scoped", label: "Private to you", hoverText: "Retrieval is scoped to your account — your notes never reach another user's context." },
      { id: "models", label: "Models", hoverText: "FinBERT (ProsusAI/finbert) for sentiment and all-MiniLM-L6-v2 for embeddings, via the Hugging Face inference service." },
      { id: "cold", label: "Cold starts", hoverText: "Hosted models sleep when idle. The first request may take a few seconds; if the model is still loading you'll be asked to retry shortly." },
    ],
    terms: ["sentiment", "rag", "similarity", "embedding"],
    status: "live",
    phase: 7,
  },
];

export function findEngine(id: string | undefined): EngineInfo | undefined {
  return ENGINES.find((engine) => engine.id === id);
}

export function statusLabel(status: SectionStatus, phase?: number): string {
  if (status === "live") return "Live";
  if (status === "beta") return "Beta";
  return phase !== undefined ? `Planned · Phase ${phase}` : "Planned";
}
