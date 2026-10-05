"""Market intelligence data: institutional flows, derivatives positioning, sector flows, capex.

Sources (public, no account):
- NSE `fiidiiTradeReact` — FII/FPI and DII cash-market buy / sell / net (₹ crore), latest day only,
  so history is built by a daily capture into the `market_flows` collection.
- NSE archives `fao_participant_oi_DDMMYYYY.csv` — Client / DII / FII / Pro open interest by
  instrument (contracts); dated files, so past days can be backfilled.
- NSDL fortnightly sector-wise FPI report — net investment and assets under custody by sector.
- Yahoo annual cash-flow statements (yfinance) — company capex, operating cash flow, revenue.

Fetchers are blocking (call through asyncio.to_thread), use browser-like headers and short
timeouts, and never raise to callers: failures come back as {"source": "unavailable", "reason"}
with a generic reason. NSE is known to refuse some cloud IP ranges — everything is dated (`asOf`).
"""

from __future__ import annotations

import csv
import html as html_lib
import io
import logging
import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from backend.services.clock import now

logger = logging.getLogger("algo_trade_backend.flows")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36",
    "Accept": "application/json,text/csv,text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}
TIMEOUT = 15
NSE_FIIDII_URL = "https://www.nseindia.com/api/fiidiiTradeReact"
NSE_OI_URLS = [
    "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{stamp}.csv",
    "https://archives.nseindia.com/content/nsccl/fao_participant_oi_{stamp}.csv",
]
NSDL_LIST_URL = "https://www.fpi.nsdl.co.in/web/Reports/FPI_Fortnightly_Selection.aspx"
NSDL_REPORT_URL = "https://www.fpi.nsdl.co.in/web/StaticReports/Fortnightly_Sector_wise_FII_Investment_Data/{name}"
OI_PARTICIPANTS = ("Client", "DII", "FII", "Pro")
OI_FIELDS = {
    "Future Index Long": "futIndexLong",
    "Future Index Short": "futIndexShort",
    "Future Stock Long": "futStockLong",
    "Future Stock Short": "futStockShort",
    "Option Index Call Long": "optIndexCallLong",
    "Option Index Put Long": "optIndexPutLong",
    "Option Index Call Short": "optIndexCallShort",
    "Option Index Put Short": "optIndexPutShort",
    "Total Long Contracts": "totalLong",
    "Total Short Contracts": "totalShort",
}
MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}


def unavailable(reason: str) -> Dict[str, Any]:
    return {"source": "unavailable", "reason": reason, "fetchedAt": now().isoformat()}


def _number(raw: Any) -> Optional[float]:
    text = str(raw or "").replace(",", "").replace("(", "-").replace(")", "").strip()
    if text in ("", "-", "--"):
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _get(url: str, session: Optional[requests.Session] = None, attempts: int = 2) -> Optional[requests.Response]:
    response = None
    for attempt in range(attempts):
        try:
            response = (session or requests).get(url, headers=HEADERS, timeout=TIMEOUT)
            break
        except (requests.ConnectionError, requests.Timeout) as exc:
            logger.warning("flows fetch failed (%s, attempt %d): %s", url.split("/")[2], attempt + 1, type(exc).__name__)
        except requests.RequestException as exc:
            logger.warning("flows fetch failed (%s): %s", url.split("/")[2], type(exc).__name__)
            return None
    if response is None:
        return None
    if response.status_code != 200:
        logger.warning("flows fetch %s returned %s", url.split("/")[2], response.status_code)
        return None
    return response


# --- FII / DII cash ---------------------------------------------------------------------------


def parse_fii_dii(payload: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, list):
        return None
    out: Dict[str, Any] = {}
    day: Optional[str] = None
    for row in payload:
        if not isinstance(row, dict):
            continue
        category = str(row.get("category", "")).upper()
        key = "fii" if "FII" in category or "FPI" in category else "dii" if "DII" in category else None
        if not key:
            continue
        out[key] = {"buy": _number(row.get("buyValue")), "sell": _number(row.get("sellValue")), "net": _number(row.get("netValue"))}
        parsed = _parse_day(str(row.get("date", "")))
        day = parsed or day
    if "fii" not in out or "dii" not in out or not day:
        return None
    return {"date": day, **out}


def _parse_day(text: str) -> Optional[str]:
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%b %d, %Y"):
        try:
            return datetime.strptime(text.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def fetch_fii_dii_cash() -> Dict[str, Any]:
    session = requests.Session()
    _get("https://www.nseindia.com/", session)  # cookies (NSE may still refuse scripted access)
    response = _get(NSE_FIIDII_URL, session)
    if response is None:
        return unavailable("NSE didn't return institutional flow data.")
    try:
        parsed = parse_fii_dii(response.json())
    except ValueError:
        parsed = None
    if parsed is None:
        return unavailable("NSE's institutional flow data wasn't in the expected format.")
    return {"source": "live", "asOf": parsed["date"], "data": parsed, "fetchedAt": now().isoformat()}


# --- Participant-wise open interest ----------------------------------------------------------


def parse_participant_oi(text: str) -> Optional[Dict[str, Any]]:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 3:
        return None
    title_date = None
    match = re.search(r"as on ([A-Za-z]{3,9} \d{1,2}, \d{4})", lines[0])
    if match:
        title_date = _parse_day(match.group(1))
    reader = csv.reader(io.StringIO("\n".join(lines[1:])))
    header = [cell.strip() for cell in next(reader)]
    participants: Dict[str, Dict[str, float]] = {}
    for row in reader:
        if not row:
            continue
        name = row[0].strip()
        if name not in OI_PARTICIPANTS:
            continue
        values: Dict[str, float] = {}
        for column, cell in zip(header[1:], row[1:]):
            key = OI_FIELDS.get(column.strip())
            number = _number(cell)
            if key and number is not None:
                values[key] = number
        participants[name.lower()] = values
    if not all(name.lower() in participants for name in OI_PARTICIPANTS):
        return None
    fii = participants["fii"]
    long_, short = fii.get("futIndexLong", 0.0), fii.get("futIndexShort", 0.0)
    derived = {"fiiIndexFuturesLongShare": long_ / (long_ + short) if long_ + short else None, "fiiIndexFuturesNet": long_ - short}
    return {"date": title_date, "participants": participants, **derived}


def fetch_participant_oi(day: date) -> Dict[str, Any]:
    stamp = day.strftime("%d%m%Y")
    for template in NSE_OI_URLS:
        response = _get(template.format(stamp=stamp))
        if response is None:
            continue
        parsed = parse_participant_oi(response.text)
        if parsed:
            parsed["date"] = parsed["date"] or day.isoformat()
            return {"source": "live", "asOf": parsed["date"], "data": parsed, "fetchedAt": now().isoformat()}
    return unavailable(f"No participant-wise open interest file for {day.isoformat()} (holiday, weekend, or NSE unavailable).")


# --- NSDL fortnightly sector flows -------------------------------------------------------------


def _cells(row_html: str) -> List[str]:
    return [html_lib.unescape(re.sub(r"<[^>]+>", "", cell)).strip() for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.S | re.I)]


def report_names(listing_html: str) -> List[str]:
    """Fortnight report files, newest first (as listed by NSDL)."""
    names = re.findall(r"(FIIInvestSector_[A-Za-z]+\d{1,2}\d{4}\.html)", listing_html)
    seen: List[str] = []
    for name in names:
        if name not in seen:
            seen.append(name)
    return seen


def report_date(name: str) -> Optional[str]:
    match = re.match(r"FIIInvestSector_([A-Za-z]+?)(\d{1,2})(\d{4})\.html", name)
    if not match or match.group(1).lower()[:4].rstrip("e") not in {key[:4].rstrip("e") for key in MONTHS}:
        return None
    month = MONTHS.get(match.group(1).lower()) or MONTHS.get(match.group(1).lower()[:3])
    try:
        return date(int(match.group(3)), month, int(match.group(2))).isoformat()
    except (TypeError, ValueError):
        return None


def parse_sector_report(page: str) -> Optional[Dict[str, Any]]:
    """Equity and total net investment for the fortnight, and assets under custody, by sector (₹ crore)."""
    rows = [_cells(row) for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S | re.I)]
    header_index = next((index for index, cells in enumerate(rows) if len(cells) > 10 and cells[1].lower().startswith("sector")), None)
    if header_index is None or header_index < 3:
        return None
    periods = [cell for cell in rows[0] if cell]
    width = len(rows[header_index])
    subheads = rows[header_index][2:]
    block = subheads.index("Total") + 1 if "Total" in subheads else None
    if not block or (width - 2) % block:
        return None
    blocks = (width - 2) // block  # periods × currencies (INR, USD)
    if blocks != len(periods) * 2:
        return None

    def column(period_position: int, currency: int, offset: int) -> int:
        return 2 + (period_position * 2 + currency) * block + offset

    net_position = max(index for index, label in enumerate(periods) if label.lower().startswith("net investment"))
    auc_position = max(index for index, label in enumerate(periods) if label.lower().startswith("auc"))
    sectors = []
    totals = None
    for cells in rows[header_index + 1 :]:
        if len(cells) != width or not cells[1]:
            continue
        entry = {
            "sector": cells[1],
            "netEquity": _number(cells[column(net_position, 0, 0)]),
            "netTotal": _number(cells[column(net_position, 0, block - 1)]),
            "aucEquity": _number(cells[column(auc_position, 0, 0)]),
            "aucTotal": _number(cells[column(auc_position, 0, block - 1)]),
        }
        if cells[1].lower() == "grand total":
            totals = entry
        else:
            sectors.append(entry)
    if not sectors:
        return None
    equity_auc = sum(item["aucEquity"] or 0 for item in sectors)
    for item in sectors:
        item["aucShare"] = (item["aucEquity"] or 0) / equity_auc if equity_auc else None
    return {"period": periods[net_position], "aucLabel": periods[auc_position], "sectors": sectors, "total": totals, "unit": "INR crore"}


def fetch_sector_flows(name: Optional[str] = None) -> Dict[str, Any]:
    if name is None:
        names = list_sector_reports(2)
        for candidate in names:
            result = fetch_sector_flows(candidate)
            if result["source"] == "live":
                return result
        return unavailable("NSDL's sector report didn't load from this server.")
    response = _get(NSDL_REPORT_URL.format(name=name))
    parsed = parse_sector_report(response.text) if response is not None else None
    if parsed is None:
        return unavailable("NSDL's sector report didn't load or wasn't in the expected format.")
    parsed["report"] = name
    return {"source": "live", "asOf": report_date(name), "data": parsed, "fetchedAt": now().isoformat()}


REPORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def guessed_report_names(limit: int, today: Optional[date] = None) -> List[str]:
    """NSDL publishes for the 15th and the month end, named like FIIInvestSector_Sep152026.html."""
    day = today or now().date()
    names: List[str] = []
    year, month = day.year, day.month
    while len(names) < limit:
        last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
        for report_day in (last, 15):
            candidate = date(year, month, report_day)
            if candidate <= day - timedelta(days=3) and len(names) < limit:
                names.append(f"FIIInvestSector_{REPORT_MONTHS[month - 1]}{report_day}{year}.html")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return names


def list_sector_reports(limit: int = 12) -> List[str]:
    listing = _get(NSDL_LIST_URL)
    names = report_names(listing.text)[:limit] if listing is not None else []
    # The listing page is sometimes slow; fall back to the predictable file names.
    return names or guessed_report_names(limit)


# --- Company capex -----------------------------------------------------------------------------


def _row(frame: Any, *names: str) -> Optional[Any]:
    if frame is None or getattr(frame, "empty", True):
        return None
    for name in names:
        if name in frame.index:
            return frame.loc[name]
    return None


def fetch_company_capex(symbol: str) -> Dict[str, Any]:
    """Annual capex (as a positive outflow), operating cash flow, revenue and ratios, newest first."""
    try:
        import yfinance as yf  # imported lazily; already a runtime dependency

        ticker = yf.Ticker(symbol)
        cashflow = ticker.cashflow
        financials = ticker.financials
        currency = None
        try:
            currency = (ticker.fast_info or {}).get("currency")
        except Exception:  # noqa: BLE001 - currency is optional context
            currency = None
    except Exception as exc:  # noqa: BLE001 - provider failures become "unavailable"
        logger.warning("capex fetch failed for %s: %s", symbol, type(exc).__name__)
        return unavailable("Yahoo didn't return financial statements for this company.")
    capex = _row(cashflow, "Capital Expenditure", "Capital Expenditure Reported")
    if capex is None:
        return unavailable("No capital expenditure line in this company's reported cash flows.")
    ocf = _row(cashflow, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
    revenue = _row(financials, "Total Revenue", "Operating Revenue")
    years = []
    for column in capex.index:
        value = _number(capex[column])
        if value is None:
            continue
        spend = abs(value)
        ocf_value = _number(ocf[column]) if ocf is not None and column in ocf.index else None
        revenue_value = _number(revenue[column]) if revenue is not None and column in revenue.index else None
        years.append(
            {
                "fiscalYearEnd": column.date().isoformat() if hasattr(column, "date") else str(column),
                "capex": spend,
                "operatingCashFlow": ocf_value,
                "revenue": revenue_value,
                "capexToRevenue": spend / revenue_value if revenue_value else None,
                "capexToOperatingCashFlow": spend / ocf_value if ocf_value and ocf_value > 0 else None,
            }
        )
    years.sort(key=lambda item: item["fiscalYearEnd"], reverse=True)
    for current, previous in zip(years, years[1:]):
        current["capexGrowth"] = current["capex"] / previous["capex"] - 1 if previous["capex"] else None
    if years:
        years[-1].setdefault("capexGrowth", None)
    if not years:
        return unavailable("Capex values were empty for this company.")
    return {"source": "live", "asOf": years[0]["fiscalYearEnd"], "data": {"symbol": symbol.upper(), "currency": currency, "years": years, "frequency": "annual"}, "fetchedAt": now().isoformat()}


def aggregate_sector_capex(companies: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Sum capex by sector and fiscal year for companies that report the same years."""
    by_sector: Dict[str, Dict[str, Any]] = {}
    for company in companies:
        sector = company.get("sector") or "Unclassified"
        data = company.get("data") or {}
        bucket = by_sector.setdefault(sector, {"sector": sector, "companies": 0, "years": {}})
        bucket["companies"] += 1
        for year in data.get("years", []):
            fiscal = year["fiscalYearEnd"][:4]
            slot = bucket["years"].setdefault(fiscal, {"fiscalYear": fiscal, "capex": 0.0, "revenue": 0.0, "reporting": 0})
            slot["capex"] += year["capex"]
            slot["revenue"] += year["revenue"] or 0.0
            slot["reporting"] += 1
    sectors = []
    for bucket in by_sector.values():
        years = sorted(bucket["years"].values(), key=lambda item: item["fiscalYear"], reverse=True)
        for current, previous in zip(years, years[1:]):
            comparable = current["reporting"] == previous["reporting"]
            current["capexGrowth"] = current["capex"] / previous["capex"] - 1 if comparable and previous["capex"] else None
        for year in years:
            year.setdefault("capexGrowth", None)
            year["capexToRevenue"] = year["capex"] / year["revenue"] if year["revenue"] else None
        sectors.append({"sector": bucket["sector"], "companies": bucket["companies"], "years": years})
    sectors.sort(key=lambda item: (item["years"][0]["capex"] if item["years"] else 0), reverse=True)
    return {"sectors": sectors}


def recent_weekdays(days: int, until: Optional[date] = None) -> List[date]:
    current = until or now().date()
    out: List[date] = []
    while len(out) < days:
        if current.weekday() < 5:
            out.append(current)
        current -= timedelta(days=1)
    return out
