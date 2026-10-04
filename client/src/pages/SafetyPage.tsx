// Pattern 2 — Detail / Record: the platform's safety posture, status + metadata, one tab per area.
import * as Tabs from "@radix-ui/react-tabs";
import { Link } from "react-router-dom";
import { useShell } from "../components/layout/shellContext";
import { Icon } from "../components/ui/Icon";
import { Notice, SectionHeader } from "../components/ui/primitives";
import { glossary, type GlossaryKey } from "../content/glossary";
import { SECTIONS } from "../content/sections";
import { useAuthed } from "../lib/session";

function TermList({ terms }: { terms: GlossaryKey[] }) {
  return (
    <div className="table-frame">
      <dl style={{ margin: 0 }}>
        {terms.map((key) => {
          const entry = glossary(key);
          return (
            <div className="list-row" key={key} style={{ alignItems: "flex-start" }}>
              <div className="list-row-main" style={{ gap: "var(--space-1)" }}>
                <dt className="list-row-title">{entry.term}</dt>
                <dd style={{ margin: 0 }} className="text-secondary">
                  {entry.definition}
                </dd>
                {entry.caveat ? (
                  <dd style={{ margin: 0 }} className="text-meta">
                    {entry.caveat}
                  </dd>
                ) : null}
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Checklist({ items }: { items: Array<{ title: string; body: string; ok?: boolean }> }) {
  return (
    <div className="table-frame">
      <ul className="list-plain">
        {items.map((item) => (
          <li className="list-row" key={item.title} style={{ alignItems: "flex-start" }}>
            <span style={{ color: item.ok === false ? "var(--status-warn-text)" : "var(--up)", marginTop: 2 }}>
              <Icon name={item.ok === false ? "alert" : "check"} label={item.ok === false ? "Attention" : "In place"} />
            </span>
            <div className="list-row-main" style={{ gap: "var(--space-1)" }}>
              <span className="list-row-title">{item.title}</span>
              <span className="text-secondary">{item.body}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SafetyPage() {
  const { user, signOut } = useAuthed();
  const { status } = useShell();

  return (
    <div className="page">
      <SectionHeader section={SECTIONS.safety} />
      <Notice tone="warn" icon="shield">
        <strong style={{ fontWeight: 600 }}>Paper trading only.</strong> Nothing in Algo Trade Lab places real orders or moves real money. Figures are for
        research and education, not investment advice.
      </Notice>

      <Tabs.Root defaultValue="data">
        <Tabs.List className="tabs-list" aria-label="Safety areas">
          <Tabs.Trigger className="tabs-trigger" value="data">
            Data integrity
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="research">
            Research honesty
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="account">
            Account &amp; access
          </Tabs.Trigger>
          <Tabs.Trigger className="tabs-trigger" value="limits">
            Known limitations
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content className="tabs-content stack-lg" value="data">
          <Checklist
            items={[
              {
                title: "Every value shows its source",
                body: "Quotes, charts, and search results carry a source flag. Anything that isn't live data gets a visible badge.",
              },
              {
                title: "Inputs are validated before leaving the server",
                body: "Symbols must match letters, digits and . ^ = - (max 20). Chart ranges and intervals come from a fixed list.",
              },
              {
                title: "Fallback data",
                body:
                  status?.offlineMarketDataAllowed === false
                    ? "This server is configured to return an error instead of fallback data."
                    : "When the provider is unreachable, a stored reference price or synthetic series keeps the interface working — clearly badged.",
                ok: status?.offlineMarketDataAllowed === false ? true : undefined,
              },
              {
                title: "Storage",
                body:
                  status?.store === "memory"
                    ? "This server is running with in-memory storage: data resets when it restarts."
                    : "Research is stored in MongoDB.",
                ok: status?.store === "memory" ? false : true,
              },
            ]}
          />
          <TermList terms={["sourceLive", "sourceOffline", "sourceSynthetic"]} />
        </Tabs.Content>

        <Tabs.Content className="tabs-content stack-lg" value="research">
          <p className="prose">
            Backtests and models can look impressive for the wrong reasons. These guards are part of how every engine is built — see each{" "}
            <Link to={SECTIONS.engines.route}>engine page</Link> for specifics.
          </p>
          <TermList terms={["lookahead", "trainTestSplit", "embargo", "buyAndHold", "baselineAccuracy", "transactionCost"]} />
          <Notice>
            Today's Lab results are indicative and in-sample, and the live signal is naive momentum. Both are labeled wherever they appear.
          </Notice>
        </Tabs.Content>

        <Tabs.Content className="tabs-content stack-lg" value="account">
          <Checklist
            items={[
              { title: "Passwords are hashed", body: "Passwords are stored as bcrypt hashes and never logged." },
              { title: "Sessions are hashed at rest", body: "The server keeps only a SHA-256 digest of your session token, so a database leak can't be replayed." },
              { title: "Signing out revokes the session", body: "Sign out deletes the session on the server, not just in this browser." },
              {
                title: "Rate limits",
                body: status
                  ? `Sign-in and sign-up allow ${status.rateLimits.authPerMinute} attempts per minute; quotes allow ${status.rateLimits.marketPerMinute} requests per minute.${status.rateLimits.shared ? "" : " Limits are counted per server process."}`
                  : "Sign-in, sign-up, and quote requests are limited per client.",
              },
              {
                title: "Development sign-in",
                body: status?.devEndpoints ? "A password-free development sign-in is enabled on this server. It is always disabled in production." : "Password-free development sign-in is disabled.",
                ok: status?.devEndpoints ? false : true,
              },
            ]}
          />
          <div className="panel panel-body cluster" style={{ justifyContent: "space-between" }}>
            <span className="text-secondary">Signed in as {user.email}</span>
            <button type="button" className="btn" onClick={signOut}>
              <Icon name="logout" />
              Sign out
            </button>
          </div>
        </Tabs.Content>

        <Tabs.Content className="tabs-content" value="limits">
          <Checklist
            items={[
              { title: "Yahoo Finance rate limits", body: "The provider throttles aggressively, especially from cloud servers. Expect occasional fallback data.", ok: false },
              { title: "Legacy trainer metrics", body: "Win rate and Sharpe from the legacy trainer are placeholders and are hidden until the risk engine lands.", ok: false },
              { title: "No out-of-sample testing yet", body: "Time-ordered train/test splits arrive with the feature pipeline.", ok: false },
              { title: "Copilot can't act yet", body: "It answers questions; running backtests and creating simulations arrives with tool-calling.", ok: false },
            ]}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
