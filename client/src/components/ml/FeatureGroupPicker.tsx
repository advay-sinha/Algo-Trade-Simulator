import { useEffect, useMemo } from "react";
import { fetchFeatureCatalog } from "../../api";
import { useAuthedQuery } from "../../lib/hooks";
import type { FeatureCatalogEntry } from "../../types";
import { InfoHint } from "../ui/InfoHint";
import { ErrorState, Skeleton } from "../ui/primitives";

/** Checkbox grid of feature groups from the server catalog; selects everything on first load. */
export function FeatureGroupPicker({
  selected,
  onChange,
  id,
  error,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  id: string;
  error?: string;
}) {
  const catalog = useAuthedQuery(() => fetchFeatureCatalog(), [], { action: "load the feature catalog" });

  useEffect(() => {
    if (catalog.data && selected.size === 0) onChange(new Set(catalog.data.map((entry) => entry.name)));
    // Seed once when the catalog arrives.
  }, [catalog.data]);

  const groups = useMemo(() => {
    const map = new Map<string, FeatureCatalogEntry[]>();
    for (const entry of catalog.data ?? []) map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
    return [...map.entries()];
  }, [catalog.data]);

  const toggle = (name: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(name);
    else next.delete(name);
    onChange(next);
  };

  return (
    <fieldset className="stack" style={{ border: 0, margin: 0, padding: 0 }} id={id} tabIndex={-1} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="field-label" style={{ marginBottom: "var(--space-2)" }}>
        Feature groups
      </legend>
      {catalog.loading ? (
        <Skeleton height={80} />
      ) : catalog.error ? (
        <ErrorState message={catalog.error} onRetry={() => void catalog.reload()} />
      ) : (
        <div className="feature-grid">
          {groups.map(([group, entries]) => (
            <div key={group} className="feature-card" style={{ gap: "var(--space-2)" }}>
              <span className="text-meta" style={{ fontWeight: 500 }}>
                {group}
              </span>
              {entries.map((entry) => (
                <label key={entry.name} className="cluster" style={{ minHeight: 32, flexWrap: "nowrap" }}>
                  <input type="checkbox" checked={selected.has(entry.name)} onChange={(event) => toggle(entry.name, event.target.checked)} />
                  <span className="mono">{entry.name}</span>
                  <InfoHint label={entry.name} text={`${entry.description} Defaults: ${JSON.stringify(entry.defaults)}`} />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}
