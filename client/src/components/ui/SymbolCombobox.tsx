// Type-ahead symbol picker (WAI-ARIA 1.2 combobox with a listbox popup). Matches company names,
// tickers, aliases and acronyms against the offline catalog in the browser — no request per
// keystroke. Yahoo search is only an explicit last option, for listings the catalog doesn't have.
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { describeError } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { searchSymbols, type SymbolEntry } from "../../lib/symbolSearch";
import { SYMBOL_RE } from "../../lib/symbols";
import { useSymbolCatalog } from "../../lib/useSymbolCatalog";
import type { DataSource, SearchResult } from "../../types";
import { Icon } from "./Icon";
import { DataSourceBadge } from "./primitives";

interface Option {
  key: string;
  symbol: string;
  name: string;
  exchange?: string | null;
  type?: string | null;
  source?: DataSource;
  remote?: boolean;
}

interface SymbolComboboxProps {
  id: string;
  label: ReactNode;
  /** Text in the input (controlled). */
  value: string;
  onChange: (text: string) => void;
  /** Called with the chosen ticker. */
  onSelect: (symbol: string, entry?: SymbolEntry) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  onBlur?: () => void;
  /** Explicit fallback for listings missing from the offline catalog (e.g. Yahoo search). */
  remoteSearch?: (query: string) => Promise<SearchResult[]>;
  /** Enter with nothing highlighted picks the best match (standalone search) instead of submitting the form. */
  pickOnEnter?: boolean;
  /** Clear the text after a pick (standalone search) instead of showing the ticker (form field). */
  clearOnSelect?: boolean;
  maxLength?: number;
}

const LIMIT = 8;
const TYPE_LABEL: Record<string, string> = { ETF: "ETF", INDEX: "Index", FX: "FX", FUTURE: "Futures", CRYPTO: "Crypto" };

function highlight(text: string, query: string): ReactNode {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9&]+/)
    .filter((word) => word.length > 0);
  if (!words.length) return text;
  const lower = text.toLowerCase();
  const marks: Array<[number, number]> = [];
  for (const word of words) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(word, from);
      if (at < 0) break;
      if (at === 0 || !/[a-z0-9]/.test(lower[at - 1])) {
        marks.push([at, at + word.length]);
        break;
      }
      from = at + 1;
    }
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let cursor = 0;
  marks.forEach(([start, end], index) => {
    if (start < cursor) return;
    parts.push(text.slice(cursor, start), <mark key={index}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function SymbolCombobox({
  id,
  label,
  value,
  onChange,
  onSelect,
  placeholder = "Company or ticker, e.g. Reliance, Apple, TCS",
  hint,
  error,
  onBlur,
  remoteSearch,
  pickOnEnter = false,
  clearOnSelect = false,
  maxLength = 60,
}: SymbolComboboxProps) {
  const { index, status, ensure } = useSymbolCatalog();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<{ query: string; results: SearchResult[] } | null>(null);
  const [remoteState, setRemoteState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [slowLoad, setSlowLoad] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;
  const query = value.trim();

  useEffect(() => {
    if (status !== "loading") {
      setSlowLoad(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoad(true), 100);
    return () => window.clearTimeout(timer);
  }, [status]);

  const local = useMemo(() => (index && query ? searchSymbols(index, query, LIMIT) : []), [index, query]);
  const options = useMemo<Option[]>(() => {
    const list: Option[] = local.map((match) => ({
      key: `local-${match.entry.symbol}`,
      symbol: match.entry.symbol,
      name: match.entry.name,
      exchange: match.entry.exchange,
      type: match.entry.type,
    }));
    if (remote && remote.query === query) {
      const seen = new Set(list.map((option) => option.symbol));
      for (const result of remote.results.slice(0, LIMIT)) {
        if (seen.has(result.symbol) || !SYMBOL_RE.test(result.symbol)) continue;
        list.push({
          key: `remote-${result.symbol}`,
          symbol: result.symbol,
          name: result.longName ?? result.shortName ?? "Unnamed listing",
          exchange: result.exchange,
          type: result.type,
          source: result.source,
          remote: true,
        });
      }
    }
    return list;
  }, [local, remote, query]);
  const showRemoteTrigger = Boolean(remoteSearch && query && !(remote && remote.query === query));
  const optionCount = options.length + (showRemoteTrigger ? 1 : 0);
  const expanded = open && query.length > 0;

  useEffect(() => setActive(-1), [query]);

  const choose = (option: Option) => {
    const entry = local.find((match) => match.entry.symbol === option.symbol)?.entry;
    onSelect(option.symbol, entry);
    onChange(clearOnSelect ? "" : option.symbol);
    setOpen(false);
    setRemote(null);
  };

  const runRemote = async () => {
    if (!remoteSearch || !query) return;
    setRemoteState({ loading: true, error: null });
    try {
      setRemote({ query, results: await remoteSearch(query) });
      setRemoteState({ loading: false, error: null });
    } catch (caught) {
      setRemoteState({ loading: false, error: describeError(caught, "search Yahoo Finance") });
    }
    inputRef.current?.focus();
  };

  const activate = (position: number) => {
    if (position < options.length) choose(options[position]);
    else if (showRemoteTrigger) void runRemote();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (optionCount) setActive((current) => (current + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (optionCount) setActive((current) => (current <= 0 ? optionCount - 1 : current - 1));
    } else if (event.key === "Enter") {
      if (expanded && active >= 0) {
        event.preventDefault();
        activate(active);
      } else if (pickOnEnter && query) {
        event.preventDefault();
        if (options.length) choose(options[0]);
        else if (SYMBOL_RE.test(query)) {
          onSelect(query.toUpperCase());
          onChange(clearOnSelect ? "" : query.toUpperCase());
          setOpen(false);
        } else if (showRemoteTrigger) void runRemote();
      } else {
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        setOpen(false);
      } else if (value) {
        event.preventDefault();
        onChange("");
      }
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const describedBy = [error ? `${id}-error` : hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  const optionId = (position: number) => `${id}-option-${position}`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="search-field combobox" style={{ maxWidth: "none" }}>
        <Icon name="search" />
        <input
          ref={inputRef}
          id={id}
          className="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          onFocus={() => {
            ensure();
            setOpen(true);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
          onKeyDown={onKeyDown}
        />
        {expanded ? (
          <div className="combobox-popup">
            <ul id={listId} role="listbox" aria-label="Matching symbols" className="combobox-list">
              {options.map((option, position) => (
                <Fragment key={option.key}>
                  {option.remote && (position === 0 || !options[position - 1].remote) ? (
                    <li role="presentation" className="combobox-group">
                      From Yahoo Finance
                    </li>
                  ) : null}
                  <li
                    id={optionId(position)}
                    role="option"
                    aria-selected={active === position}
                    className="combobox-option"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(position)}
                    onClick={() => choose(option)}
                  >
                    <span className="combobox-option-main">
                      <span className="combobox-symbol">{highlight(option.symbol, query)}</span>
                      {option.exchange ? <span className="combobox-chip">{option.exchange}</span> : null}
                      {option.type && TYPE_LABEL[option.type] ? <span className="combobox-chip">{TYPE_LABEL[option.type]}</span> : null}
                      {option.remote ? <DataSourceBadge source={option.source} /> : null}
                    </span>
                    <span className="combobox-name">{highlight(option.name, query)}</span>
                  </li>
                </Fragment>
              ))}
              {showRemoteTrigger ? (
                <li
                  id={optionId(options.length)}
                  role="option"
                  aria-selected={active === options.length}
                  className="combobox-option combobox-remote"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(options.length)}
                  onClick={() => void runRemote()}
                >
                  <span className="combobox-option-main">
                    <Icon name="search" />
                    {remoteState.loading ? "Searching Yahoo Finance…" : `Search Yahoo Finance for “${query}”`}
                  </span>
                  <span className="combobox-name">For listings not in the offline list (new or non-Indian/US exchanges)</span>
                </li>
              ) : null}
            </ul>
            {status === "loading" && slowLoad ? <p className="combobox-note">Loading symbol list…</p> : null}
            {status === "error" ? <p className="combobox-note">The offline symbol list didn't load. Type the exact ticker{remoteSearch ? " or search Yahoo" : ""}.</p> : null}
            {status === "ready" && !options.length && !remote ? <p className="combobox-note">Not in the offline list.{SYMBOL_RE.test(query) ? ` Press Enter to use “${query.toUpperCase()}” as typed.` : ""}</p> : null}
            {remote && remote.query === query && !remote.results.length ? <p className="combobox-note">Yahoo Finance found nothing for “{query}” either.</p> : null}
            {remoteState.error ? <p className="combobox-note">{remoteState.error}</p> : null}
            {index ? <p className="combobox-footer">Offline symbol list · updated {formatDate(index.generatedAt)}</p> : null}
          </div>
        ) : null}
      </span>
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
