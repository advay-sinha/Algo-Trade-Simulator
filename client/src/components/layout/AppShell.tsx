import * as Tooltip from "@radix-ui/react-tooltip";
import { useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { fetchStatus } from "../../api";
import { ENGINES, SECTIONS, statusLabel } from "../../content/sections";
import { useAuthedQuery, useVisiblePolling } from "../../lib/hooks";
import { useAuthed } from "../../lib/session";
import { useTheme } from "../../lib/theme";
import { formatRelative } from "../../lib/format";
import type { SystemStatus } from "../../types";
import { CopilotDrawer } from "../copilot/CopilotDrawer";
import { Icon, type IconName } from "../ui/Icon";
import { IconButton } from "../ui/primitives";
import { SlideOver } from "../ui/overlays";
import { ShellContext } from "./shellContext";

interface NavItem {
  to: string;
  label: string;
  icon?: IconName;
  meta?: string;
  end?: boolean;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Monitor",
    items: [
      { to: SECTIONS.overview.route, label: SECTIONS.overview.navLabel, icon: "grid", end: true },
      { to: SECTIONS.monitor.route, label: SECTIONS.monitor.navLabel, icon: "activity" },
      { to: SECTIONS.flows.route, label: SECTIONS.flows.navLabel, icon: "layers" },
    ],
  },
  {
    label: "Engines",
    items: [
      { to: SECTIONS.engines.route, label: SECTIONS.engines.navLabel, icon: "layers", end: true },
      ...ENGINES.map((engine) => ({
        to: engine.route,
        label: engine.navLabel,
        meta: engine.status === "live" ? undefined : engine.status === "beta" ? "Beta" : `P${engine.phase}`,
      })),
    ],
  },
  {
    label: "Research",
    items: [
      { to: SECTIONS.lab.route, label: SECTIONS.lab.navLabel, icon: "flask", end: true },
      { to: SECTIONS.datasets.route, label: SECTIONS.datasets.navLabel, icon: "table" },
      { to: SECTIONS.models.route, label: SECTIONS.models.navLabel, icon: "layers" },
      { to: SECTIONS.backtests.route, label: SECTIONS.backtests.navLabel, icon: "activity" },
      { to: SECTIONS.simulations.route, label: SECTIONS.simulations.navLabel, icon: "wallet" },
      { to: SECTIONS.portfolio.route, label: SECTIONS.portfolio.navLabel, icon: "pie" },
      { to: SECTIONS.research.route, label: SECTIONS.research.navLabel, icon: "database" },
    ],
  },
  {
    label: "History",
    items: [
      { to: SECTIONS.history.route, label: SECTIONS.history.navLabel, icon: "history", end: true },
      { to: SECTIONS.prices.route, label: SECTIONS.prices.navLabel, icon: "table" },
    ],
  },
  {
    label: "Safety",
    items: [{ to: SECTIONS.safety.route, label: SECTIONS.safety.navLabel, icon: "shield" }],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div className="nav-group" key={group.label}>
          <span className="nav-group-label">{group.label}</span>
          {group.items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" onClick={onNavigate}>
              {item.icon ? <Icon name={item.icon} /> : <span style={{ width: 18 }} aria-hidden="true" />}
              {item.label}
              {item.meta ? (
                <span className="nav-meta" aria-label={item.meta.startsWith("P") ? statusLabel("planned", Number(item.meta.slice(1))) : item.meta}>
                  {item.meta}
                </span>
              ) : null}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  );
}

function StatusStrip({ status }: { status: SystemStatus | null }) {
  if (!status) {
    return (
      <span className="status-item">
        <span className="dot" aria-hidden="true" />
        Checking system status…
      </span>
    );
  }
  const market = status.marketData;
  const marketTone = market.lastSource === null ? "dot" : market.lastSource === "live" ? "dot dot-good" : "dot dot-warn";
  const marketLabel =
    market.lastSource === null
      ? "Market data: not used yet"
      : market.lastSource === "live"
        ? `Market data live · ${formatRelative(market.lastLiveAt)}`
        : `Market data on fallback · ${formatRelative(market.lastFallbackAt)}`;
  return (
    <>
      <span className="status-item">
        <span className={marketTone} aria-hidden="true" />
        {marketLabel}
      </span>
      <span className="status-item optional">
        <Icon name="database" />
        {status.store === "mongo" ? "Database: MongoDB" : "Database: in-memory (resets on restart)"}
      </span>
      {status.devEndpoints ? (
        <span className="status-item optional">
          <span className="dot dot-warn" aria-hidden="true" />
          Dev sign-in enabled
        </span>
      ) : null}
    </>
  );
}

export function AppShell() {
  const { user, signOut } = useAuthed();
  const { resolved, toggle } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const copilotButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const status = useAuthedQuery(fetchStatus, [], { action: "check system status" });
  useVisiblePolling(() => void status.reload(), 60_000);

  const sidebarFooter: ReactNode = (
    <div className="sidebar-footer">
      <span className="workspace-label"><Icon name="shield" /> Paper trading workspace</span>
      <span className="text-meta" style={{ overflowWrap: "anywhere" }}>
        Signed in as {user.email}
      </span>
      <button type="button" className="btn btn-ghost" style={{ justifyContent: "flex-start" }} onClick={signOut}>
        <Icon name="logout" />
        Sign out
      </button>
    </div>
  );

  return (
    <Tooltip.Provider>
      <ShellContext.Provider value={{ openCopilot: () => setCopilotOpen(true), status: status.data, reloadStatus: status.reload }}>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div className="shell">
          <aside className="sidebar" aria-label="Primary">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                <img src="/favicon.svg" alt="" width="34" height="34" />
              </span>
              <span>Algo Trade Lab<small className="brand-caption">RESEARCH TERMINAL</small></span>
            </div>
            <nav className="stack-lg" aria-label="Sections">
              <NavContent />
            </nav>
            {sidebarFooter}
          </aside>

          <div className="main-col">
            <header className="topbar">
              <IconButton ref={menuButtonRef} icon="menu" label="Open navigation" className="menu-btn" onClick={() => setNavOpen(true)} />
              <div className="status-strip" aria-label="System status">
                <StatusStrip status={status.data} />
              </div>
              <div className="topbar-actions">
                <button ref={copilotButtonRef} type="button" className="btn copilot-btn" aria-label="Ask copilot" onClick={() => setCopilotOpen(true)}>
                  <Icon name="chat" />
                  <span className="hide-narrow">Ask copilot</span>
                </button>
                <IconButton
                  icon={resolved === "dark" ? "sun" : "moon"}
                  label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                  onClick={toggle}
                />
              </div>
            </header>
            <main id="main" tabIndex={-1} key={location.pathname}>
              <Outlet />
            </main>
          </div>
        </div>

        <SlideOver open={navOpen} onOpenChange={setNavOpen} title="Navigation" side="left" returnFocusRef={menuButtonRef}>
          <nav className="stack-lg" aria-label="Sections">
            <NavContent onNavigate={() => setNavOpen(false)} />
          </nav>
          {sidebarFooter}
        </SlideOver>

        <CopilotDrawer open={copilotOpen} onOpenChange={setCopilotOpen} configured={status.data?.copilotConfigured} returnFocusRef={copilotButtonRef} />
      </ShellContext.Provider>
    </Tooltip.Provider>
  );
}
