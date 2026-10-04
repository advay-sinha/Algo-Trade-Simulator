import { formatFraction } from "../../lib/format";
import type { SentimentLabel, SentimentScore } from "../../types";

const LOOK: Record<SentimentLabel, { dot: string; mark: string; text: string }> = {
  bullish: { dot: "dot-good", mark: "▲", text: "Bullish" },
  bearish: { dot: "dot-bad", mark: "▼", text: "Bearish" },
  neutral: { dot: "dot-hollow", mark: "–", text: "Neutral" },
};

/** Sentiment label with a shape mark (not color alone) and the model's confidence. */
export function SentimentBadge({ sentiment, compact }: { sentiment: SentimentScore | null | undefined; compact?: boolean }) {
  if (!sentiment) return null;
  const look = LOOK[sentiment.label];
  const confidence = sentiment.confidence !== null ? formatFraction(sentiment.confidence, 0) : null;
  const label = `${look.text} sentiment${confidence ? `, ${confidence} confidence` : ""}`;
  return (
    <span className="status-pill" aria-label={label} title={label}>
      <span className={`dot ${look.dot}`} aria-hidden="true" />
      <span aria-hidden="true">
        {look.mark} {look.text}
        {!compact && confidence ? <span className="text-meta"> · {confidence}</span> : null}
      </span>
    </span>
  );
}
