import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode, RefObject } from "react";
import { Icon } from "./Icon";

/**
 * Slide-over panel (right by default, left for mobile navigation). Radix Dialog provides the
 * focus trap, Escape to close, scroll lock, and focus restore to the trigger.
 */
export function SlideOver({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  /** Element to refocus on close (needed when the trigger never received focus, e.g. Safari clicks). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content
          className={`slide-over ${side === "left" ? "left" : ""}`}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <div className="slide-over-header">
            <div className="stack" style={{ gap: 0, minWidth: 0 }}>
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="text-meta">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="visually-hidden">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" aria-label={`Close ${title.toLowerCase()}`}>
                <Icon name="close" />
              </button>
            </Dialog.Close>
          </div>
          <div className="slide-over-body">{children}</div>
          {footer ? <div className="slide-over-footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Named destructive confirmation: the button repeats the exact action and object. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim" />
        <Dialog.Content className="dialog" role="alertdialog">
          <Dialog.Title asChild>
            <h2 style={{ fontSize: "var(--text-h4)" }}>{title}</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="text-secondary">{body}</p>
          </Dialog.Description>
          <div className="form-actions" style={{ justifyContent: "flex-end" }}>
            <Dialog.Close asChild>
              <button type="button" className="btn">
                Keep it
              </button>
            </Dialog.Close>
            <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
              {busy ? "Deleting…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
