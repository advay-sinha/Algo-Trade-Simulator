import { ApiError } from "../api";

/**
 * Turn any thrown value into recovery-oriented copy. Never blames the user, never shows raw
 * server internals (the backend already keeps details generic; this adds the "what now").
 */
export function describeError(error: unknown, action = "complete that"): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return "Can't reach the server. Check that the backend is running, then try again.";
      case 401:
        return "Your session ended. Sign in again to continue.";
      case 403:
        return "This action isn't available on this server.";
      case 404:
        return `We couldn't find what you asked for, so we couldn't ${action}. Check the symbol or refresh the page.`;
      case 409:
        return error.message === "Email already registered"
          ? "An account with this email already exists. Sign in instead, or use a different email."
          : `That conflicts with existing data, so we couldn't ${action}.`;
      case 422:
        return `Some values need a second look before we can ${action}. Check the highlighted fields.`;
      case 429: {
        const wait = error.retryAfter ? ` about ${error.retryAfter} seconds` : " a minute";
        return `Too many attempts in a short time. Wait${wait}, then try again.`;
      }
      case 502:
        return "The market data provider didn't respond. Try again in a moment.";
      case 503:
        return "The data store is temporarily unavailable. Try again shortly.";
      default:
        return `Something went wrong on our side, so we couldn't ${action}. Try again in a moment.`;
    }
  }
  return `Something went wrong, so we couldn't ${action}. Try again in a moment.`;
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
