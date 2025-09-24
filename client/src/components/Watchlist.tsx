import type { MarketQuote } from "../types";

interface WatchlistProps {
  quotes: MarketQuote[];
  onRefresh: () => void;
  loading: boolean;
}

export function Watchlist({ quotes, onRefresh, loading }: WatchlistProps) {
  return (
    <div className="card">
      <div className="header" style={{ marginBottom: "1rem" }}>
        <div>
          <h2>Live market watchlist</h2>
          <p style={{ color: "rgba(226,232,240,0.7)", margin: 0 }}>
            Quotes powered by Yahoo Finance via yfinance. Values refresh on demand.
          </p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {quotes.length === 0 ? (
        <div className="empty-state">Add tickers or refresh to load market data.</div>
      ) : (
        <table className="watchlist-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Change</th>
              <th>Prev. close</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const changeClass = quote.change >= 0 ? "trend-positive" : "trend-negative";
              return (
                <tr key={quote.symbol}>
                  <td>
                    <span className="badge">{quote.symbol}</span>
                  </td>
                  <td>
                    {quote.price.toLocaleString(undefined, {
                      style: "currency",
                      currency: quote.currency ?? "USD",
                    })}
                  </td>
                  <td className={changeClass}>
                    {quote.change >= 0 ? "+" : ""}
                    {quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                  </td>
                  <td>
                    {quote.previousClose
                      ? quote.previousClose.toLocaleString(undefined, {
                          style: "currency",
                          currency: quote.currency ?? "USD",
                        })
                      : "—"}
                  </td>
                  <td>{new Date(quote.updated).toLocaleTimeString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
