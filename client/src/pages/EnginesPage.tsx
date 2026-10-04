// Pattern 4 — Dashboard / Overview: glance at every engine's status, then leave to its page.
import { Link } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { SectionHeader, StatusPill } from "../components/ui/primitives";
import { ENGINES, SECTIONS } from "../content/sections";

export function EnginesPage() {
  return (
    <div className="page">
      <SectionHeader section={SECTIONS.engines} />
      <section className="table-frame" aria-labelledby="engine-list-heading">
        <div className="panel-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--border-l1)" }}>
          <h2 id="engine-list-heading" style={{ fontSize: "var(--text-h4)" }}>
            Pipeline, in build order
          </h2>
          <span className="text-meta">
            {ENGINES.filter((engine) => engine.status !== "planned").length} available · {ENGINES.filter((engine) => engine.status === "planned").length} planned
          </span>
        </div>
        <ul className="list-plain">
          {ENGINES.map((engine) => (
            <li key={engine.id}>
              <Link to={engine.route} className="list-row">
                <div className="list-row-main">
                  <span className="list-row-title">{engine.title}</span>
                  <span className="text-secondary">{engine.purpose}</span>
                  <span className="text-meta">Produces: {engine.output}</span>
                </div>
                <StatusPill status={engine.status} phase={engine.phase} />
                <Icon name="chevronRight" className="icon chevron" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
