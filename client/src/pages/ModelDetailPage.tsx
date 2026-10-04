// Pattern 2 — Detail / Record: one registered model with Report / Signal / Configuration tabs.
import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchModel, predictWithModel } from "../api";
import { ModelConfiguration, ModelEvaluation, ModelKpis, ModelVerdict, SignalCard } from "../components/ml/ModelReport";
import { Icon } from "../components/ui/Icon";
import { DataSourceBadge, EmptyState, ErrorState, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import { useAuthedQuery } from "../lib/hooks";
import { useAuthed } from "../lib/session";
import type { ModelSignal } from "../types";

function SignalTab({ modelId }: { modelId: string }) {
  const { token, handleAuthError } = useAuthed();
  const [signal, setSignal] = useState<ModelSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setSignal(await predictWithModel(token, { modelId }));
    } catch (caught) {
      if (handleAuthError(caught)) return;
      setError(describeError(caught, "generate a signal"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel panel-body stack">
      <p className="text-secondary">Rebuilds this model's exact features from the latest daily bars and predicts on the newest complete day.</p>
      {signal ? <SignalCard signal={signal} /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy}>
          {busy ? "Generating…" : signal ? "Refresh signal" : "Generate signal"}
        </button>
      </div>
    </div>
  );
}

export function ModelDetailPage() {
  const { modelId = "" } = useParams();
  const record = useAuthedQuery((token) => fetchModel(token, modelId), [modelId], { action: "load this model" });
  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={SECTIONS.models.route}>Model lab</Link>
        </li>
        <li aria-current="page">{record.data ? `${record.data.symbol} ${record.data.modelType}` : "Model"}</li>
      </ol>
    </nav>
  );
  if (record.error) {
    return (
      <div className="page">
        {breadcrumb}
        {/couldn't find/i.test(record.error) ? (
          <EmptyState
            icon="search"
            title="This model isn't available"
            body="It may belong to another account, or the server's in-memory storage was reset."
            action={
              <Link to={SECTIONS.models.route} className="btn btn-primary">
                Train a model
              </Link>
            }
          />
        ) : (
          <ErrorState message={record.error} onRetry={() => void record.reload()} />
        )}
      </div>
    );
  }
  if (record.loading || !record.data) {
    return (
      <div className="page">
        {breadcrumb}
        <SkeletonRows rows={8} />
      </div>
    );
  }
  const data = record.data;
  return (
    <div className="page">
      <header className="section-header">
        <div className="section-header-top">
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {breadcrumb}
            <div className="section-title-row">
              <h1>
                {data.symbol} · {data.modelName}
              </h1>
              <DataSourceBadge source={data.dataSource} />
            </div>
            <p className="text-secondary">
              {data.label.kind} label, horizon {data.label.horizon} · {data.featureNames.length} features · {data.range} history · trained {formatDateTime(data.trainedAt)}
            </p>
          </div>
          <div className="section-actions">
            <Link to={SECTIONS.models.route} className="btn">
              <Icon name="refresh" />
              Train another
            </Link>
          </div>
        </div>
      </header>
      <Tabs.Root defaultValue="report">
        <Tabs.List className="tabs-list" aria-label="Model sections">
          <Tabs.Trigger className="tabs-trigger" value="report">
            Report
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="signal">
            Signal
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="config">
            Configuration
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="tabs-content stack-lg" value="report">
          <ModelVerdict record={data} />
          <ModelKpis record={data} />
          <ModelEvaluation record={data} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="signal">
          <SignalTab modelId={data.id} />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="config">
          <ModelConfiguration record={data} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
