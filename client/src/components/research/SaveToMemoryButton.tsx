import { useState } from "react";
import { Link } from "react-router-dom";
import { createNote } from "../../api";
import { SECTIONS } from "../../content/sections";
import { describeError } from "../../lib/errors";
import { useAuthed } from "../../lib/session";
import { Icon } from "../ui/Icon";

/** Saves a summary of a backtest or model to research memory (idempotent on the server). */
export function SaveToMemoryButton({ kind, refId }: { kind: "backtest" | "model"; refId: string }) {
  const { token, handleAuthError } = useAuthed();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    try {
      await createNote(token, { kind, refId });
      setState("saved");
    } catch (caught) {
      setState("idle");
      if (!handleAuthError(caught)) setError(describeError(caught, `save this ${kind}`));
    }
  }

  if (state === "saved") {
    return (
      <Link to={SECTIONS.research.route} className="btn" role="status">
        <Icon name="check" />
        Saved to research memory
      </Link>
    );
  }
  return (
    <span className="stack" style={{ gap: "var(--space-1)", alignItems: "flex-end" }}>
      <button type="button" className="btn" onClick={save} disabled={state === "saving"}>
        <Icon name="database" />
        {state === "saving" ? "Saving…" : "Save to research memory"}
      </button>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
