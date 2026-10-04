import * as Tooltip from "@radix-ui/react-tooltip";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { statusLabel, type SectionInfo, type SectionStatus } from "../../content/sections";
import type { DataSource } from "../../types";
import { formatRelative } from "../../lib/format";
import { Icon, type IconName } from "./Icon";
import { InfoHint } from "./InfoHint";
import type { GlossaryKey } from "../../content/glossary";

/* Status pill ------------------------------------------------------------------------------ */
export function StatusPill({ status, phase }: { status: SectionStatus; phase?: number }) {
  const dot = status === "live" ? "dot-good" : status === "beta" ? "dot-info" : "dot-hollow";
  return (
    <span className="status-pill">
      <span className={`dot ${dot}`} aria-hidden="true" />
      {statusLabel(status, phase)}
    </span>
  );
}

/* Section header --------------------------------------------------------------------------- */
interface SectionHeaderProps {
  section: Pick<SectionInfo, "title" | "summary" | "howItWorks" | "status" | "phase">;
  /** Override the h1 (e.g. a personalised greeting). */
  title?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  showSteps?: boolean;
  showStatus?: boolean;
}

export function SectionHeader({ section, title, actions, breadcrumb, showSteps = true, showStatus = true }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <div className="section-header-top">
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          {breadcrumb}
          <div className="section-title-row">
            <h1>{title ?? section.title}</h1>
            {showStatus ? <StatusPill status={section.status} phase={section.phase} /> : null}
          </div>
          <p className="prose">{section.summary}</p>
        </div>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      {showSteps && section.howItWorks.length ? (
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <h2 className="text-secondary" style={{ fontSize: "var(--text-secondary)", fontWeight: 500 }}>
            How it works
          </h2>
          <ol className="how-it-works">
            {section.howItWorks.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </header>
  );
}

/* Metric card ------------------------------------------------------------------------------ */
interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  term?: GlossaryKey;
  hint?: ReactNode;
  muted?: boolean;
  className?: string;
}

export function MetricCard({ label, value, sub, term, hint, muted, className }: MetricCardProps) {
  return (
    <div className={`metric-card ${className ?? ""}`}>
      <span className="metric-label label-with-hint">
        {label}
        {term || hint ? <InfoHint label={label} term={term} text={hint} /> : null}
      </span>
      <span className={`metric-value num ${muted ? "muted" : ""}`}>{value}</span>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </div>
  );
}

/* Data source badge — rendered only when data is NOT live --------------------------------- */
export function DataSourceBadge({ source, updated }: { source?: DataSource | null; updated?: string | null }) {
  if (!source || source === "live") return null;
  const label =
    source === "cached" ? `Cached · ${formatRelative(updated)}` : source === "synthetic" ? "Synthetic data" : "Offline fallback";
  const term: GlossaryKey = source === "synthetic" ? "sourceSynthetic" : "sourceOffline";
  return (
    <span className="source-badge">
      <Icon name="alert" />
      {label}
      <InfoHint label={label} term={term} />
    </span>
  );
}

/* States ----------------------------------------------------------------------------------- */
export function EmptyState({
  title,
  body,
  action,
  icon = "layers",
  centered,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: IconName;
  centered?: boolean;
}) {
  return (
    <div className={`state-block ${centered ? "centered" : ""}`}>
      <Icon name={icon} />
      <h3 style={{ fontSize: "var(--text-body)" }}>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="notice bad" role="alert">
      <Icon name="alert" />
      <div className="notice-body">
        <span>{message}</span>
        {onRetry ? (
          <div>
            <button type="button" className="btn" onClick={onRetry}>
              <Icon name="refresh" />
              {retryLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Notice({ children, tone = "info", icon = "info" }: { children: ReactNode; tone?: "info" | "warn" | "bad"; icon?: IconName }) {
  return (
    <div className={`notice ${tone === "info" ? "" : tone}`}>
      <Icon name={icon} />
      {/* Extra wrapper keeps inline content (strong, links) flowing as one paragraph. */}
      <div className="notice-body">
        <div>{children}</div>
      </div>
    </div>
  );
}

export function PlannedState({ phase, items, what }: { phase?: number; items?: string[]; what: string }) {
  return (
    <div className="panel">
      <div className="state-block">
        <span className="status-pill">
          <span className="dot dot-hollow" aria-hidden="true" />
          {phase !== undefined ? `Planned · Phase ${phase}` : "Planned"}
        </span>
        <h3 style={{ fontSize: "var(--text-body)" }}>{what} isn't built yet</h3>
        <p>
          This section describes what's coming so you know where it fits. No sample numbers are shown — results appear here once the
          engine ships.
        </p>
        {items?.length ? (
          <ul className="planned-list">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ display: "block", height, width }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={20} />
      ))}
    </div>
  );
}

/* Icon button with required tooltip --------------------------------------------------------- */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  shortcut?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, shortcut, className, ...rest },
  ref,
) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <button ref={ref} type="button" className={`icon-btn ${className ?? ""}`} aria-label={label} {...rest}>
          <Icon name={icon} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
          {shortcut ? <kbd>{shortcut}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

/* Feature list ---------------------------------------------------------------------------- */
export function FeatureGrid({ features }: { features: SectionInfo["features"] }) {
  if (!features.length) return null;
  return (
    <div className="feature-grid">
      {features.map((feature) => (
        <div className="feature-card" key={feature.id}>
          <h4>{feature.label}</h4>
          <p className="text-secondary">{feature.hoverText}</p>
        </div>
      ))}
    </div>
  );
}

/* Pagination (always rendered on lists) ------------------------------------------------------ */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  noun,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="text-secondary num">
        {total === 0 ? `0 ${noun}` : `${start}–${end} of ${total} ${noun}`}
      </span>
      <div className="cluster">
        <button type="button" className="btn" onClick={() => onPage(page - 1)} disabled={page <= 0}>
          Previous
        </button>
        <button type="button" className="btn" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1}>
          Next
        </button>
      </div>
    </nav>
  );
}
