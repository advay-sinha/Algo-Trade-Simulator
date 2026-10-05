// Pattern 3 — Form (auth): centered card, one task, one primary action, escape link.
import { useState, type FormEvent } from "react";
import { login, signup } from "../api";
import { Icon } from "../components/ui/Icon";
import { ErrorState, Notice } from "../components/ui/primitives";
import { describeError } from "../lib/errors";
import { useSession } from "../lib/session";

type Mode = "signin" | "signup";
type Field = "name" | "email" | "password";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(mode: Mode, field: Field, value: string): string | null {
  if (field === "name") return mode === "signup" && !value.trim() ? "Enter your name." : null;
  if (field === "email") return EMAIL_RE.test(value.trim()) ? null : "Enter an email like name@example.com.";
  if (mode === "signin") return value ? null : "Enter your password.";
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

export function AuthPage() {
  const { signIn, notice, clearNotice } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [values, setValues] = useState<Record<Field, string>>({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fields: Field[] = mode === "signup" ? ["name", "email", "password"] : ["email", "password"];

  const update = (field: Field, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    // Errors clear as soon as the value becomes valid; they don't appear while typing.
    if (errors[field] && !validate(mode, field, value)) setErrors((previous) => ({ ...previous, [field]: null }));
  };

  const blur = (field: Field) => {
    setTouched((previous) => ({ ...previous, [field]: true }));
    setErrors((previous) => ({ ...previous, [field]: validate(mode, field, values[field]) }));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setTouched({});
    setSubmitError(null);
    clearNotice();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<Field, string | null>> = {};
    for (const field of fields) nextErrors[field] = validate(mode, field, values[field]);
    setErrors(nextErrors);
    setTouched(Object.fromEntries(fields.map((field) => [field, true])));
    const firstInvalid = fields.find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(`auth-${firstInvalid}`)?.focus();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response =
        mode === "signup"
          ? await signup({ name: values.name.trim(), email: values.email.trim(), password: values.password })
          : await login({ email: values.email.trim(), password: values.password });
      signIn(response);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (mode === "signin" && status === 401) {
        setSubmitError("That email and password don't match an account. Check both, or create an account.");
      } else if (mode === "signup" && status === 422) {
        setSubmitError("That password is too common. Choose one that's harder to guess.");
      } else {
        setSubmitError(describeError(error, mode === "signup" ? "create your account" : "sign you in"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const labels: Record<Field, string> = { name: "Name", email: "Email", password: "Password" };

  return (
    <div className="auth-wrap">
      <section className="auth-intro" aria-label="About Algo Trade Lab">
        <span className="eyebrow">ALGO TRADE LAB / RESEARCH WORKSPACE</span>
        <h2>Turn market ideas<br />into measured<br /><span>decisions.</span></h2>
        <p>A focused workspace for strategy research, backtesting, and paper trading.</p>
        <div className="auth-capabilities"><span><img src="/favicon.svg" alt="" width="34" height="34" /> Backtest strategies</span><span><Icon name="layers" /> Evaluate models</span><span><Icon name="chat" /> Research with copilot</span></div>
        <div className="auth-footnote"><Icon name="shield" /> Simulated capital. Real learning.</div>
      </section>
      <main className="auth-card" id="main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src="/favicon.svg" alt="" width="34" height="34" />
          </span>
          Algo Trade Lab
        </div>
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <h1>{mode === "signup" ? "Create your account" : "Sign in"}</h1>
          <p className="text-secondary">
            {mode === "signup"
              ? "Research strategies and run paper-trading simulations — no real money involved."
              : "Pick up your research where you left off."}
          </p>
        </div>

        {notice ? <Notice tone="warn" icon="clock">{notice}</Notice> : null}
        {submitError ? <ErrorState message={submitError} /> : null}

        <form className="form-grid" onSubmit={onSubmit} noValidate>
          {fields.map((field) => {
            const error = touched[field] ? errors[field] : null;
            const hintId = `auth-${field}-hint`;
            const errorId = `auth-${field}-error`;
            return (
              <div className="field" key={field}>
                <label className="field-label" htmlFor={`auth-${field}`}>
                  {labels[field]}
                </label>
                <input
                  id={`auth-${field}`}
                  className="input"
                  type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                  autoComplete={field === "password" ? (mode === "signup" ? "new-password" : "current-password") : field}
                  value={values[field]}
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={[field === "password" && mode === "signup" ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
                  onChange={(event) => update(field, event.target.value)}
                  onBlur={() => blur(field)}
                />
                {field === "password" && mode === "signup" ? (
                  <span className="field-hint" id={hintId}>
                    At least {PASSWORD_MIN} characters. Very common passwords are rejected.
                  </span>
                ) : null}
                {error ? (
                  <span className="field-error" id={errorId}>
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (mode === "signup" ? "Creating account…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="text-secondary">
          {mode === "signup" ? "Already have an account? " : "New here? "}
          <button
            type="button"
            className="row-select"
            style={{ display: "inline", minHeight: 0 }}
            onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Sign in instead" : "Create an account"}
          </button>
        </p>
      </main>
    </div>
  );
}
