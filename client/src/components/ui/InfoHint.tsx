import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { glossary, type GlossaryKey } from "../../content/glossary";
import { Icon } from "./Icon";

interface InfoHintProps {
  /** Short name used in the trigger's accessible label: "About {label}". */
  label: string;
  /** Either a glossary key (definition + formula + caveat) or explicit text. */
  term?: GlossaryKey;
  text?: ReactNode;
}

const OPEN_DELAY = 120;
const CLOSE_DELAY = 160;

/**
 * Explanation that opens on mouse hover, keyboard focus, and tap. The text is also linked via
 * aria-describedby so screen readers announce it on focus without opening anything.
 */
export function InfoHint({ label, term, text }: InfoHintProps) {
  const entry = term ? glossary(term) : undefined;
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const lastPointer = useRef<string>("mouse");
  const descriptionId = useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  const body = (
    <>
      {entry ? <span className="info-hint-title">{entry.term}</span> : null}
      <span>{entry ? entry.definition : text}</span>
      {entry?.formula ? <code className="info-hint-formula">{entry.formula}</code> : null}
      {entry?.caveat ? <span className="text-meta">{entry.caveat}</span> : null}
    </>
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="info-hint-trigger"
          aria-label={`About ${label}`}
          aria-describedby={descriptionId}
          onPointerDown={(event) => {
            lastPointer.current = event.pointerType;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") schedule(true, OPEN_DELAY);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") schedule(false, CLOSE_DELAY);
          }}
          onFocus={() => schedule(true, 0)}
          onBlur={() => schedule(false, CLOSE_DELAY)}
          onClick={(event) => {
            // Mouse users already opened it by hovering; keep it open instead of toggling shut.
            if (lastPointer.current === "mouse" && open) event.preventDefault();
          }}
        >
          <Icon name="info" />
        </button>
      </Popover.Trigger>
      <span id={descriptionId} className="visually-hidden">
        {entry ? `${entry.definition}${entry.formula ? ` Formula: ${entry.formula}.` : ""}${entry.caveat ? ` ${entry.caveat}` : ""}` : text}
      </span>
      <Popover.Portal>
        <Popover.Content
          className="info-hint"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={() => window.clearTimeout(timer.current)}
          onPointerLeave={() => schedule(false, CLOSE_DELAY)}
          aria-hidden="true"
        >
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A label followed by its info hint, aligned on one line. */
export function LabelWithHint({ children, ...hint }: InfoHintProps & { children: ReactNode }) {
  return (
    <span className="label-with-hint">
      {children}
      <InfoHint {...hint} />
    </span>
  );
}
