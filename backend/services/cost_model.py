"""Dated transaction-cost schedules for research runs (Phase 13).

Each fill's costs come from the schedule version in force on the fill date and are returned as a
breakdown. Statutory rates change by circular, so every line records where the figure came from
and when it was checked. They are research assumptions, not authoritative fee quotes; brokerage
is the user's choice of broker. Slippage is separate (applied to the fill price by the engine).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Literal, Optional, Tuple

Side = Literal["buy", "sell"]
COMPONENTS: Tuple[str, ...] = ("brokerage", "stt", "exchange", "sebi", "stamp", "gst", "dp")
CRORE = 10_000_000.0

ZERODHA_CHARGES = "https://zerodha.com/charges (equity delivery, checked 2026-10-05)"
NSE_CIRCULAR_2026 = "NSE circular 27 Feb 2026, revision in transaction charges effective 1 Mar 2026 (IPFT cut to Rs 0.01/crore, overall outflow unchanged)"
CHECKED_ON = "2026-10-05"


@dataclass(frozen=True)
class FeeLine:
    key: str  # one of COMPONENTS
    label: str
    kind: Literal["pct", "per_crore", "per_scrip_sell_day"]
    rate: float  # fraction of notional for pct, INR per crore, INR per scrip per sell day
    sides: Tuple[Side, ...]
    source: str
    checked_on: str = CHECKED_ON
    note: Optional[str] = None


@dataclass(frozen=True)
class FeeVersion:
    effective_from: date
    lines: Tuple[FeeLine, ...]
    gst_rate: float = 0.0
    gst_base: Tuple[str, ...] = ("brokerage", "exchange", "sebi")
    approximate: bool = False
    note: Optional[str] = None


@dataclass(frozen=True)
class Brokerage:
    kind: Literal["zero", "flat", "bps"] = "zero"
    flat_inr: float = 20.0  # per executed order
    bps: float = 0.0

    def charge(self, notional: float) -> float:
        if self.kind == "flat":
            return self.flat_inr
        if self.kind == "bps":
            return notional * self.bps / 10_000
        return 0.0

    def describe(self) -> str:
        if self.kind == "flat":
            return f"Rs {self.flat_inr:g} per executed order"
        if self.kind == "bps":
            return f"{self.bps:g} bps of notional"
        return "Zero brokerage (delivery)"


@dataclass(frozen=True)
class FeeSchedule:
    id: str
    name: str
    description: str
    versions: Tuple[FeeVersion, ...]
    brokerage: Brokerage = field(default_factory=Brokerage)

    def version_for(self, day: date) -> FeeVersion:
        chosen = self.versions[0]
        for version in self.versions:
            if version.effective_from <= day:
                chosen = version
        return chosen

    def costs(self, side: Side, notional: float, day: date, *, first_sell_of_scrip_today: bool = True) -> Dict[str, float]:
        version = self.version_for(day)
        out = {component: 0.0 for component in COMPONENTS}
        out["brokerage"] = self.brokerage.charge(notional) if notional > 0 else 0.0
        for line in version.lines:
            if side not in line.sides:
                continue
            if line.kind == "pct":
                out[line.key] += notional * line.rate
            elif line.kind == "per_crore":
                out[line.key] += notional / CRORE * line.rate
            elif line.kind == "per_scrip_sell_day" and side == "sell" and first_sell_of_scrip_today:
                out[line.key] += line.rate
        out["gst"] = version.gst_rate * sum(out[key] for key in version.gst_base)
        out["total"] = sum(out[component] for component in COMPONENTS)
        return out

    def describe(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "brokerage": self.brokerage.describe(),
            "versions": [
                {
                    "effectiveFrom": version.effective_from.isoformat(),
                    "approximate": version.approximate,
                    "note": version.note,
                    "gst": {"rate": version.gst_rate, "on": list(version.gst_base)} if version.gst_rate else None,
                    "lines": [
                        {
                            "component": line.key,
                            "label": line.label,
                            "kind": line.kind,
                            "rate": line.rate,
                            "sides": list(line.sides),
                            "source": line.source,
                            "checkedOn": line.checked_on,
                            "note": line.note,
                        }
                        for line in version.lines
                    ],
                }
                for version in self.versions
            ],
        }


def _nse_delivery_lines(exchange_rate: float, exchange_source: str, exchange_note: Optional[str]) -> Tuple[FeeLine, ...]:
    return (
        FeeLine("stt", "Securities transaction tax", "pct", 0.001, ("buy", "sell"), ZERODHA_CHARGES, note="0.1% on buy and sell for delivery"),
        FeeLine("exchange", "NSE transaction charges (incl. IPFT)", "pct", exchange_rate, ("buy", "sell"), exchange_source, note=exchange_note),
        FeeLine("sebi", "SEBI turnover fee", "per_crore", 10.0, ("buy", "sell"), ZERODHA_CHARGES, note="Rs 10 per crore"),
        FeeLine("stamp", "Stamp duty", "pct", 0.00015, ("buy",), ZERODHA_CHARGES, note="0.015% on the buy side (uniform since 1 Jul 2020)"),
        FeeLine("dp", "Depository (DP) charge", "per_scrip_sell_day", 15.34, ("sell",), ZERODHA_CHARGES, note="Per scrip on each day it is sold, GST included; varies by broker"),
    )


def nse_delivery(brokerage: Brokerage = Brokerage()) -> FeeSchedule:
    return FeeSchedule(
        id="nse-delivery",
        name="NSE equity delivery (statutory charges)",
        description="STT, exchange transaction charges, SEBI fee, stamp duty, GST and a DP charge for cash-market delivery trades on NSE.",
        brokerage=brokerage,
        versions=(
            FeeVersion(
                effective_from=date(2000, 1, 1),
                lines=_nse_delivery_lines(
                    0.0000335,
                    "Approximation of NSE cash-market charges before Oct 2024 (several revisions 2020-2024)",
                    "Approximate: NSE revised cash-market charges several times; stamp duty differed by state before Jul 2020",
                ),
                gst_rate=0.18,
                approximate=True,
                note="Before 1 Oct 2024 the exchange charge and (before Jul 2020) stamp duty are approximations.",
            ),
            FeeVersion(
                effective_from=date(2024, 10, 1),
                lines=_nse_delivery_lines(0.0000307, f"{ZERODHA_CHARGES}; {NSE_CIRCULAR_2026}", "0.00297% transaction charge + 0.0001% IPFT from 1 Oct 2024; split revised 1 Mar 2026 with the same total"),
                gst_rate=0.18,
                note="Flat cash-market charge from 1 Oct 2024.",
            ),
        ),
    )


def flat_bps(cost_bps: float) -> FeeSchedule:
    """The legacy single-rate model: cost_bps of notional on every fill (matches the v1 backtester)."""
    return FeeSchedule(
        id="flat-bps",
        name=f"Flat {cost_bps:g} bps",
        description="One commission rate on every fill, no statutory breakdown (the original backtester's model).",
        brokerage=Brokerage(kind="bps", bps=cost_bps),
        versions=(FeeVersion(effective_from=date(1900, 1, 1), lines=()),),
    )


def scaled(schedule: FeeSchedule, factor: float) -> FeeSchedule:
    """Cost stress: every rate (and brokerage) multiplied by `factor`."""
    versions = tuple(
        FeeVersion(
            effective_from=version.effective_from,
            lines=tuple(FeeLine(**{**line.__dict__, "rate": line.rate * factor}) for line in version.lines),
            gst_rate=version.gst_rate,
            gst_base=version.gst_base,
            approximate=version.approximate,
            note=version.note,
        )
        for version in schedule.versions
    )
    brokerage = Brokerage(kind=schedule.brokerage.kind, flat_inr=schedule.brokerage.flat_inr * factor, bps=schedule.brokerage.bps * factor)
    return FeeSchedule(id=f"{schedule.id}x{factor:g}", name=f"{schedule.name} x{factor:g}", description=f"{schedule.description} (stressed x{factor:g})", versions=versions, brokerage=brokerage)


def get_schedule(schedule_id: str, *, brokerage: Brokerage = Brokerage(), cost_bps: float = 0.0) -> FeeSchedule:
    if schedule_id == "nse-delivery":
        return nse_delivery(brokerage)
    if schedule_id == "flat-bps":
        return flat_bps(cost_bps)
    raise KeyError(f"Unknown fee schedule: {schedule_id}")


def describe_schedules() -> List[Dict[str, Any]]:
    return [nse_delivery().describe(), flat_bps(5.0).describe() | {"note": "Rate is chosen per run (default 5 bps)."}]
