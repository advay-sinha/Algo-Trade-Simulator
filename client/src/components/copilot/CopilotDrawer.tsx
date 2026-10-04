import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import { streamCopilot } from "../../api";
import { describeError } from "../../lib/errors";
import { formatFraction, formatSignedFraction } from "../../lib/format";
import { useAuthed } from "../../lib/session";
import type { CopilotAction, CopilotEvent, RagHit } from "../../types";
import { Icon } from "../ui/Icon";
import { SlideOver } from "../ui/overlays";
import { Notice } from "../ui/primitives";

const SUGGESTIONS = [
  "Backtest AAPL with a 20/60 SMA crossover and 100k capital",
  "Train a gradient boosting model on MSFT and tell me if it beats its baseline",
  "Summarize my simulations",
  "Create a simulation for NVDA with 25k",
  "What do my research notes say about drawdowns?",
];
const HISTORY_TURNS = 8;

const TOOL_LABELS: Record<string, string> = {
  get_quote: "Fetching quotes",
  get_price_history: "Reading price history",
  list_strategies: "Listing strategies",
  run_backtest: "Running backtest",
  get_backtest_report: "Reading backtest report",
  list_backtests: "Listing your backtests",
  portfolio_overview: "Summarizing your simulations",
  train_model: "Training model",
  get_model_signal: "Getting model signal",
  create_simulation: "Creating simulation",
};

interface Activity {
  id: string;
  name: string;
  args: string;
  status: "running" | "ok" | "error";
  error?: string | null;
  result?: Record<string, unknown> | null;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  activities: Activity[];
  actions: CopilotAction[];
  /** Research notes retrieved as context for this reply (cited inline as [Note: title]). */
  sources?: RagHit[];
  error?: string;
  pending?: boolean;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Compact, structured view of a tool result — metric chips instead of raw JSON. */
function ResultSummary({ activity }: { activity: Activity }) {
  const r = activity.result ?? {};
  if (activity.name === "run_backtest") {
    const summary = (r.summary ?? {}) as Record<string, unknown>;
    const risk = (r.risk ?? {}) as Record<string, unknown>;
    return (
      <span className="text-meta num">
        Return {formatSignedFraction(num(summary.totalReturn))} · buy-and-hold {formatSignedFraction(num(summary.buyHoldReturn))} · Sharpe{" "}
        {num(risk.sharpe)?.toFixed(2) ?? "—"} · max drawdown {formatFraction(num(risk.maxDrawdown))}
      </span>
    );
  }
  if (activity.name === "train_model") {
    return (
      <span className="text-meta num">
        Test accuracy {formatFraction(num(r.testAccuracy), 1)} vs baseline {formatFraction(num(r.baselineAccuracy), 1)} · strategy{" "}
        {formatSignedFraction(num(r.strategyReturnAfterCosts))} vs buy-and-hold {formatSignedFraction(num(r.buyHoldReturn))}
      </span>
    );
  }
  return null;
}

function ActivityRow({ activity }: { activity: Activity }) {
  const label = TOOL_LABELS[activity.name] ?? activity.name;
  return (
    <li className="cluster" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: "var(--space-2)" }}>
      <span aria-hidden="true" style={{ marginTop: 2, color: activity.status === "error" ? "var(--status-warn-text)" : activity.status === "ok" ? "var(--up)" : "var(--fg-muted)" }}>
        <Icon name={activity.status === "error" ? "alert" : activity.status === "ok" ? "check" : "clock"} />
      </span>
      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="text-secondary">
          {label}
          {activity.status === "running" ? "…" : ""} {activity.args ? <span className="text-meta">({activity.args})</span> : null}
        </span>
        {activity.status === "error" && activity.error ? <span className="text-meta">{activity.error}</span> : null}
        {activity.status === "ok" ? <ResultSummary activity={activity} /> : null}
      </span>
    </li>
  );
}

export function CopilotDrawer({
  open,
  onOpenChange,
  configured,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configured?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { token, handleAuthError } = useAuthed();
  // Lives outside the dialog content, so the conversation survives closing and reopening.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, open]);

  const updateLast = (update: (turn: Turn) => Turn) =>
    setTurns((previous) => {
      const next = [...previous];
      next[next.length - 1] = update(next[next.length - 1]);
      return next;
    });

  const onEvent = (event: CopilotEvent) => {
    if (event.type === "tool_start") {
      updateLast((turn) => ({ ...turn, activities: [...turn.activities, { id: event.id, name: event.name, args: event.args, status: "running" }] }));
    } else if (event.type === "tool_end") {
      updateLast((turn) => ({
        ...turn,
        activities: turn.activities.map((activity) =>
          activity.id === event.id ? { ...activity, status: event.ok ? "ok" : "error", error: event.error, result: event.result } : activity,
        ),
      }));
    } else if (event.type === "message") {
      updateLast((turn) => ({ ...turn, content: [turn.content, event.content].filter(Boolean).join("\n\n") }));
    } else if (event.type === "actions") {
      updateLast((turn) => ({ ...turn, actions: event.actions }));
    } else if (event.type === "sources") {
      updateLast((turn) => ({ ...turn, sources: event.sources }));
    } else if (event.type === "error") {
      updateLast((turn) => ({ ...turn, error: event.message }));
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    const history = turns
      .filter((turn) => turn.content)
      .slice(-HISTORY_TURNS)
      .map(({ role, content }) => ({ role, content }));
    setTurns((previous) => [
      ...previous,
      { role: "user", content: message, activities: [], actions: [] },
      { role: "assistant", content: "", activities: [], actions: [], pending: true },
    ]);
    setDraft("");
    setSending(true);
    try {
      await streamCopilot(token, { message, history }, onEvent);
    } catch (error) {
      if (handleAuthError(error)) return;
      updateLast((turn) => ({ ...turn, error: describeError(error, "reach the copilot") }));
    } finally {
      updateLast((turn) => ({ ...turn, pending: false }));
      setSending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="Research copilot"
      description="Runs research tools for you. Simulated only — not financial advice."
      returnFocusRef={returnFocusRef}
      footer={
        <form onSubmit={onSubmit} className="stack" style={{ width: "100%", gap: "var(--space-2)" }}>
          <label className="field">
            <span className="field-label">Your question</span>
            <textarea
              className="textarea"
              value={draft}
              rows={2}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <span className="field-hint">Enter sends · Shift+Enter adds a line</span>
          </label>
          <div className="form-actions" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              <Icon name="send" />
              {sending ? "Working…" : "Send question"}
            </button>
          </div>
        </form>
      }
    >
      <div className="stack-lg">
        {configured === false ? (
          <Notice tone="warn" icon="alert">
            The copilot isn't configured on this server yet. An administrator needs to set up a language-model provider — a free Groq key or a local Ollama both work.
          </Notice>
        ) : null}
        {turns.length === 0 ? (
          <div className="stack">
            <p className="text-secondary">
              Ask a question or give it a task. It can run backtests, train models, read your saved results, and create simulations — every saved action is
              listed under its reply. <Link to="/engines/copilot" onClick={() => onOpenChange(false)}>How it works</Link>
            </p>
            <div className="suggestions">
              <span className="text-meta">Try one of these</span>
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className="btn" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }} onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-log" aria-live="polite">
            {turns.map((turn, index) => (
              <div key={index} className={`chat-msg ${turn.role}`}>
                <span className="who">{turn.role === "user" ? "You" : "Copilot"}</span>
                {turn.activities.length ? (
                  <ul className="list-plain stack" style={{ gap: "var(--space-2)" }} aria-label="Tool activity">
                    {turn.activities.map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} />
                    ))}
                  </ul>
                ) : null}
                {turn.sources?.length ? (
                  <div className="copilot-sources" aria-label="Research notes consulted">
                    <span className="text-meta">Notes consulted</span>
                    {turn.sources.map((source) => (
                      <Link
                        key={source.id}
                        to={source.path}
                        className="status-pill"
                        title={`Similarity ${source.score.toFixed(2)}`}
                        onClick={() => onOpenChange(false)}
                      >
                        <Icon name="database" />
                        {source.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {turn.content ? <div className="bubble">{turn.content}</div> : null}
                {turn.pending && !turn.content && !turn.error ? <span className="text-meta">Thinking…</span> : null}
                {turn.error ? (
                  <Notice tone="warn" icon="alert">
                    {turn.error}
                  </Notice>
                ) : null}
                {turn.actions.length ? (
                  <div className="stack" style={{ gap: "var(--space-1)" }}>
                    <span className="text-meta">Saved by this reply</span>
                    {turn.actions.map((action) => (
                      <Link key={action.id} to={action.path} className="btn" style={{ justifyContent: "flex-start" }} onClick={() => onOpenChange(false)}>
                        <Icon name="check" />
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div ref={logEnd} />
      </div>
    </SlideOver>
  );
}
