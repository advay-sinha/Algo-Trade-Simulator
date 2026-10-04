import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "react-router-dom";
import { askChat } from "../../api";
import { describeError } from "../../lib/errors";
import { useAuthed } from "../../lib/session";
import type { ChatMessage } from "../../types";
import { Icon } from "../ui/Icon";
import { SlideOver } from "../ui/overlays";
import { Notice } from "../ui/primitives";

const SUGGESTIONS = [
  "Explain how an SMA crossover strategy works",
  "What does max drawdown tell me about a strategy?",
  "Which stock should I invest in with 5000 for 5 days?",
];

const HISTORY_TURNS = 8;

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    const userMessage: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };
    const history = [...messages, userMessage].slice(-HISTORY_TURNS).map(({ role, content }) => ({ role, content }));
    setMessages((previous) => [...previous, userMessage]);
    setDraft("");
    setSending(true);
    try {
      const response = await askChat(token, { message, history });
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: response.reply, timestamp: new Date().toISOString(), citations: response.citations },
      ]);
    } catch (error) {
      if (handleAuthError(error)) return;
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: describeError(error, "reach the copilot"), timestamp: new Date().toISOString() },
      ]);
    } finally {
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
      description="Answers research questions. Not financial advice."
      returnFocusRef={returnFocusRef}
      footer={
        <form onSubmit={onSubmit} className="stack" style={{ width: "100%", gap: "var(--space-2)" }}>
          <label className="field">
            <span className="field-label">Your question</span>
            <textarea
              className="textarea"
              value={draft}
              rows={2}
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
              {sending ? "Sending…" : "Send question"}
            </button>
          </div>
        </form>
      }
    >
      <div className="stack-lg">
        {configured === false ? (
          <Notice tone="warn" icon="alert">
            The copilot isn't configured on this server yet, so it can only give built-in replies. An administrator needs to add an OpenAI
            API key.
          </Notice>
        ) : null}
        {messages.length === 0 ? (
          <div className="stack">
            <p className="text-secondary">
              Ask about strategies, metrics, or symbols. It can't run backtests or create simulations yet — that arrives with{" "}
              <Link to="/engines/copilot" onClick={() => onOpenChange(false)}>
                tool-calling in Phase 6
              </Link>
              .
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
            {messages.map((message, index) => (
              <div key={`${message.timestamp}-${index}`} className={`chat-msg ${message.role}`}>
                <span className="who">{message.role === "user" ? "You" : "Copilot"}</span>
                <div className="bubble">{message.content}</div>
                {message.citations?.length ? (
                  <ul className="list-plain text-meta">
                    {message.citations.map((url) => (
                      <li key={url}>
                        {/* Citations come from model output: only plain http(s) URLs become links. */}
                        {/^https?:\/\//i.test(url) ? (
                          <a href={url} target="_blank" rel="noreferrer noopener">
                            {url}
                          </a>
                        ) : (
                          url
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {sending ? <span className="text-meta">Copilot is thinking…</span> : null}
          </div>
        )}
        <div ref={logEnd} />
      </div>
    </SlideOver>
  );
}
