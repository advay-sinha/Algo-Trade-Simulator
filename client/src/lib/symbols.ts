// Ticker validation shared by every symbol input; mirrors SYMBOL_PATTERN in backend/models/common.py.
// "&" covers NSE listings such as M&M.NS and J&KBANK.NS; symbols are always URL-encoded by api.ts.
export const SYMBOL_RE = /^[A-Za-z0-9.^=&-]{1,20}$/;
