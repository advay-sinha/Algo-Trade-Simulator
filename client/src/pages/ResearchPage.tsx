// Pattern 9 — Analytics (workbench): three tools on one page — notes, semantic search, sentiment.
import * as Tabs from "@radix-ui/react-tabs";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { analyzeSentiment, createNote, deleteNote, fetchNotes, queryNotes } from "../api";
import { useShell } from "../components/layout/shellContext";
import { SentimentBadge } from "../components/research/SentimentBadge";
import { Icon } from "../components/ui/Icon";
import { LabelWithHint } from "../components/ui/InfoHint";
import { ConfirmDialog } from "../components/ui/overlays";
import { EmptyState, ErrorState, IconButton, Notice, SectionHeader, SkeletonRows } from "../components/ui/primitives";
import { SECTIONS } from "../content/sections";
import { describeError } from "../lib/errors";
import { useAuthedQuery } from "../lib/hooks";
import { formatDateTime, formatFraction, formatInteger } from "../lib/format";
import { useAuthed } from "../lib/session";
import type { NoteKind, RagResult, ResearchNote, SentimentResponse } from "../types";

const section = SECTIONS.research;
const featureText = (id: string) => section.features.find((feature) => feature.id === id)?.hoverText ?? "";
const KIND_LABEL: Record<NoteKind, string> = { note: "Note", backtest: "Backtest", model: "Model" };

function sourcePath(note: { kind: NoteKind; refId: string | null }): string | null {
  if (note.kind === "backtest" && note.refId) return `/backtests/${note.refId}`;
  if (note.kind === "model" && note.refId) return `/lab/models/${note.refId}`;
  return null;
}

/* Notes -------------------------------------------------------------------------------------- */

function NotesTab() {
  const { token, handleAuthError } = useAuthed();
  const notes = useAuthedQuery((t) => fetchNotes(t), [], { action: "load your notes" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ResearchNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Give the note a title.";
    if (!body.trim()) next.body = "Write the note.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    setSavedNotice(null);
    try {
      const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
      const note = await createNote(token, { title: title.trim(), body: body.trim(), tags: tagList });
      notes.setData((previous) => [note, ...(previous ?? [])]);
      setTitle("");
      setBody("");
      setTags("");
      setSavedNotice(note.indexed ? `Saved "${note.title}".` : `Saved "${note.title}". It will be indexed for search when the language service is available.`);
      titleRef.current?.focus();
    } catch (caught) {
      if (!handleAuthError(caught)) setSaveError(describeError(caught, "save the note"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteNote(token, pendingDelete.id);
      notes.setData((previous) => (previous ?? []).filter((note) => note.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (caught) {
      if (!handleAuthError(caught)) setSaveError(describeError(caught, "delete the note"));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const invalid = (key: keyof typeof errors) => (errors[key] ? { "aria-invalid": true as const, "aria-describedby": `note-${key}-error` } : {});

  return (
    <div className="grid-2 research-grid">
      <form className="panel panel-body stack" onSubmit={save} noValidate aria-labelledby="note-form-heading">
        <h2 id="note-form-heading" style={{ fontSize: "var(--text-h4)" }}>
          <LabelWithHint label="Saved even when offline" text={`${featureText("unindexed")} ${featureText("hosted")}`}>
            New note
          </LabelWithHint>
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="note-title">
            Title
          </label>
          <input id="note-title" ref={titleRef} className="input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} {...invalid("title")} />
          {errors.title ? (
            <span className="field-error" id="note-title-error">
              {errors.title}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="note-body">
            Note
          </label>
          <textarea id="note-body" className="textarea" rows={6} value={body} maxLength={5000} onChange={(event) => setBody(event.target.value)} {...invalid("body")} />
          {errors.body ? (
            <span className="field-error" id="note-body-error">
              {errors.body}
            </span>
          ) : (
            <span className="field-hint">Findings, hypotheses, or observations. Backtests and models can be saved from their own pages.</span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="note-tags">
            Tags <span className="field-optional">optional, comma-separated</span>
          </label>
          <input id="note-tags" className="input" value={tags} onChange={(event) => setTags(event.target.value)} />
        </div>
        {saveError ? <ErrorState message={saveError} /> : null}
        {savedNotice ? (
          <p className="text-secondary" role="status">
            {savedNotice}
          </p>
        ) : null}
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Icon name="plus" />
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </form>

      <section className={`panel ${notes.refreshing ? "is-refreshing" : ""}`} aria-labelledby="notes-heading">
        <div className="panel-header">
          <h2 id="notes-heading" style={{ fontSize: "var(--text-h4)" }}>
            <LabelWithHint label="Private to you" text={featureText("private")}>
              Your notes
            </LabelWithHint>{" "}
            {notes.data ? <span className="text-meta">({formatInteger(notes.data.length)})</span> : null}
          </h2>
        </div>
        {notes.loading ? (
          <div className="panel-body">
            <SkeletonRows rows={4} />
          </div>
        ) : notes.error ? (
          <div className="panel-body">
            <ErrorState message={notes.error} onRetry={notes.reload} />
          </div>
        ) : !notes.data?.length ? (
          <EmptyState title="No notes yet" body="Save your first note, or save a backtest or model from its page. Everything here becomes searchable by meaning." icon="history" />
        ) : (
          <ul className="list-plain">
            {notes.data.map((note) => {
              const path = sourcePath(note);
              return (
                <li className="list-row note-row" key={note.id}>
                  <div className="list-row-main">
                    <span className="list-row-title">{note.title}</span>
                    <span className="cluster" style={{ gap: "var(--space-2)" }}>
                      <span className="status-pill">{KIND_LABEL[note.kind]}</span>
                      <SentimentBadge sentiment={note.sentiment} compact />
                      {!note.indexed ? (
                        <span className="source-badge">
                          <Icon name="clock" />
                          Not indexed yet
                        </span>
                      ) : null}
                      <span className="text-meta">{formatDateTime(note.createdAt)}</span>
                    </span>
                    <p className="text-secondary note-body">{note.body}</p>
                    {note.tags.length ? <span className="text-meta">{note.tags.map((tag) => `#${tag}`).join(" ")}</span> : null}
                    {path ? (
                      <Link to={path} className="text-meta">
                        Open the {KIND_LABEL[note.kind].toLowerCase()}
                      </Link>
                    ) : null}
                  </div>
                  <IconButton icon="trash" label={`Delete note "${note.title}"`} onClick={() => setPendingDelete(note)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this note?"
        body={`"${pendingDelete?.title ?? ""}" will be removed from your research memory and the copilot won't see it again. The backtest or model it summarizes is not affected.`}
        confirmLabel="Delete note"
        onConfirm={confirmDelete}
        busy={deleting}
      />
    </div>
  );
}

/* Semantic search ------------------------------------------------------------------------------ */

function SearchTab() {
  const { token, handleAuthError } = useAuthed();
  const [query, setQuery] = useState("");
  const [k, setK] = useState(5);
  const [result, setResult] = useState<RagResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setFieldError("Type what you're looking for.");
      return;
    }
    setFieldError(null);
    setSearching(true);
    setError(null);
    try {
      setResult(await queryNotes(token, query.trim(), k));
    } catch (caught) {
      if (!handleAuthError(caught)) setError(describeError(caught, "search your notes"));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="stack">
      <form className="panel panel-body stack" onSubmit={search} noValidate aria-labelledby="search-heading">
        <h2 id="search-heading" style={{ fontSize: "var(--text-h4)" }}>
          Search by meaning
        </h2>
        <div className="form-row">
          <div className="field" style={{ flex: "3 1 260px" }}>
            <label className="field-label" htmlFor="rag-query">
              Question or phrase
            </label>
            <input
              id="rag-query"
              className="input"
              value={query}
              maxLength={500}
              placeholder="e.g. what went wrong when volatility spiked?"
              onChange={(event) => setQuery(event.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "rag-query-error" : "rag-query-hint"}
            />
            {fieldError ? (
              <span className="field-error" id="rag-query-error">
                {fieldError}
              </span>
            ) : (
              <span className="field-hint" id="rag-query-hint">
                Matches ideas, not just words: "losses during turbulence" finds a note about drawdowns.
              </span>
            )}
          </div>
          <div className="field" style={{ flex: "1 1 120px" }}>
            <label className="field-label" htmlFor="rag-k">
              Results
            </label>
            <select id="rag-k" className="select" value={k} onChange={(event) => setK(Number(event.target.value))}>
              {[3, 5, 10].map((value) => (
                <option key={value} value={value}>
                  Top {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={searching}>
            <Icon name="search" />
            {searching ? "Searching…" : "Search notes"}
          </button>
        </div>
      </form>

      {error ? <ErrorState message={error} /> : null}

      {result ? (
        <section className="panel" aria-labelledby="hits-heading" aria-live="polite">
          <div className="panel-header">
            <h2 id="hits-heading" style={{ fontSize: "var(--text-h4)" }}>
              <LabelWithHint label="Similarity" term="similarity">
                Closest notes
              </LabelWithHint>
            </h2>
          </div>
          {result.hits.length === 0 ? (
            <EmptyState
              title={result.searched === 0 && result.pendingIndex === 0 ? "No notes to search yet" : "No close matches"}
              body={result.searched === 0 && result.pendingIndex === 0 ? "Save a note first — search only looks at your own notes." : "Try different wording, or save more notes on this topic."}
              icon="search"
            />
          ) : (
            <ol className="list-plain">
              {result.hits.map((hit) => (
                <li className="list-row" key={hit.id}>
                  <div className="list-row-main">
                    <span className="list-row-title">
                      {hit.path === "/research" ? hit.title : <Link to={hit.path}>{hit.title}</Link>}
                    </span>
                    <span className="text-meta">
                      {KIND_LABEL[hit.kind]} · {formatDateTime(hit.createdAt)}
                    </span>
                    <p className="text-secondary note-body">{hit.snippet}</p>
                  </div>
                  <div className="similarity" aria-label={`Similarity ${hit.score.toFixed(2)}`}>
                    <span className="num">{hit.score.toFixed(2)}</span>
                    <span className="similarity-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(0, Math.min(1, hit.score)) * 100}%` }} />
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="panel-footer text-meta">
            Searched {formatInteger(result.searched)} of your notes · {result.method === "atlas" ? "Atlas vector index" : "exact scan"} · {result.embeddingModel}
            {result.reindexed ? ` · indexed ${formatInteger(result.reindexed)} new` : ""}
            {result.pendingIndex ? ` · ${formatInteger(result.pendingIndex)} still waiting to be indexed` : ""}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* Sentiment ----------------------------------------------------------------------------------- */

function SentimentTab() {
  const { token, handleAuthError } = useAuthed();
  const [text, setText] = useState("");
  const [result, setResult] = useState<SentimentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run(event: FormEvent) {
    event.preventDefault();
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return setFieldError("Add at least one headline.");
    if (lines.length > 20) return setFieldError(`Up to 20 lines at a time (you have ${lines.length}).`);
    if (lines.some((line) => line.length > 2000)) return setFieldError("Each line can be up to 2,000 characters.");
    setFieldError(null);
    setRunning(true);
    setError(null);
    try {
      setResult(await analyzeSentiment(token, lines));
    } catch (caught) {
      if (!handleAuthError(caught)) setError(describeError(caught, "score these headlines"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="stack">
      <form className="panel panel-body stack" onSubmit={run} noValidate aria-labelledby="sentiment-heading">
        <h2 id="sentiment-heading" style={{ fontSize: "var(--text-h4)" }}>
          <LabelWithHint label="Sentiment score" term="sentiment">
            Score headlines
          </LabelWithHint>
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="sentiment-text">
            Headlines or short passages — one per line, up to 20
          </label>
          <textarea
            id="sentiment-text"
            className="textarea"
            rows={5}
            value={text}
            placeholder={"Company beats earnings, raises guidance\nRetailer misses estimates and cuts outlook"}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "sentiment-text-error" : undefined}
          />
          {fieldError ? (
            <span className="field-error" id="sentiment-text-error">
              {fieldError}
            </span>
          ) : null}
        </div>
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={running}>
            <Icon name="activity" />
            {running ? "Scoring…" : "Score sentiment"}
          </button>
        </div>
      </form>

      {error ? <ErrorState message={error} /> : null}

      {result ? (
        <section className="panel" aria-labelledby="sentiment-results-heading" aria-live="polite">
          <div className="panel-header">
            <h2 id="sentiment-results-heading" style={{ fontSize: "var(--text-h4)" }}>
              Results
            </h2>
          </div>
          <div className="table-scroll">
            <table className="table">
              <caption className="visually-hidden">Sentiment for each line</caption>
              <thead>
                <tr>
                  <th scope="col">Text</th>
                  <th scope="col">Sentiment</th>
                  <th scope="col" className="right">
                    Bullish
                  </th>
                  <th scope="col" className="right">
                    Bearish
                  </th>
                  <th scope="col" className="right">
                    Neutral
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row, index) => (
                  <tr key={index}>
                    <td className="sentiment-text">{row.text}</td>
                    <td>
                      <SentimentBadge sentiment={row} />
                    </td>
                    <td className="right num">{formatFraction(row.scores.bullish, 0)}</td>
                    <td className="right num">{formatFraction(row.scores.bearish, 0)}</td>
                    <td className="right num">{formatFraction(row.scores.neutral, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-footer text-meta">
            Model {result.model} · scores are the model's probabilities for each label; they describe wording, not expected returns.
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function ResearchPage() {
  const { status } = useShell();
  const nlpOff = status?.nlp?.configured === false;

  return (
    <div className="page">
      <SectionHeader section={section} />
      {nlpOff ? (
        <Notice tone="warn" icon="alert">
          Search and sentiment need the Hugging Face inference service, which isn't configured on this server yet. You can still save notes — they're
          indexed automatically once the service is available.
        </Notice>
      ) : null}
      <Tabs.Root defaultValue="notes">
        <Tabs.List className="tabs-list" aria-label="Research memory tools">
          <Tabs.Trigger className="tabs-trigger" value="notes">
            Notes
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="search">
            Search
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="sentiment">
            Sentiment
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="tabs-content" value="notes">
          <NotesTab />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="search">
          <SearchTab />
        </Tabs.Content>
        <Tabs.Content className="tabs-content" value="sentiment">
          <SentimentTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
