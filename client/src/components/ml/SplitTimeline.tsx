import { formatDate } from "../../lib/format";
import { LabelWithHint } from "../ui/InfoHint";

export interface SplitBoundaries {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  trainRows: number;
  testRows: number;
  embargoBars: number;
}

/** Train | embargo | test, widths proportional to row counts, dates underneath. */
export function SplitTimeline({ split }: { split: SplitBoundaries }) {
  const total = split.trainRows + split.embargoBars + split.testRows;
  const description = `Train ${split.trainRows} rows from ${formatDate(split.trainStart)} to ${formatDate(split.trainEnd)}, embargo ${split.embargoBars} rows, test ${split.testRows} rows from ${formatDate(split.testStart)} to ${formatDate(split.testEnd)}.`;
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <div className="timeline" role="img" aria-label={description}>
        <span className="timeline-seg train" style={{ flex: split.trainRows / total }}>
          Train · {split.trainRows}
        </span>
        <span className="timeline-seg embargo" style={{ flex: `0 0 ${Math.max((split.embargoBars / total) * 100, 1.5)}%` }} title="Embargo" />
        <span className="timeline-seg test" style={{ flex: split.testRows / total }}>
          Test · {split.testRows}
        </span>
      </div>
      <div className="cluster text-meta num" style={{ justifyContent: "space-between" }}>
        <span>
          {formatDate(split.trainStart)} → {formatDate(split.trainEnd)}
        </span>
        <span>
          <LabelWithHint label="Embargo gap" term="embargo">
            Embargo {split.embargoBars} bar{split.embargoBars === 1 ? "" : "s"}
          </LabelWithHint>
        </span>
        <span>
          {formatDate(split.testStart)} → {formatDate(split.testEnd)}
        </span>
      </div>
    </div>
  );
}
