"""Portfolio import models: an allowlist of holding fields and nothing else.

There is no free-text field: names, exchanges and currencies are looked up by the server, never
accepted from the client. Unknown fields are rejected (extra="forbid"), so account numbers, PANs,
names or addresses have nowhere to go.
"""

from __future__ import annotations

import re
from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.models.common import SYMBOL_PATTERN
from backend.services.clock import now

MAX_HOLDINGS_PER_IMPORT = 100
ISIN_PATTERN = r"^[A-Za-z]{2}[A-Za-z0-9]{9}[0-9]$"

AssetType = Literal["equity", "etf", "mutual_fund", "gold", "other"]
ImportSource = Literal["manual", "csv", "zerodha", "groww", "upstox", "cas_nsdl", "cas_cdsl", "cams", "kfintech"]


def isin_check_digit_ok(isin: str) -> bool:
    digits = "".join(str(int(char, 36)) for char in isin[:-1])
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char) * (2 if index % 2 == 0 else 1)
        total += value - 9 if value > 9 else value
    return (10 - total % 10) % 10 == int(isin[-1])


class HoldingRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: Optional[str] = Field(default=None, pattern=SYMBOL_PATTERN)
    isin: Optional[str] = Field(default=None, pattern=ISIN_PATTERN)
    quantity: float = Field(gt=0, le=1_000_000_000, allow_inf_nan=False)
    avgCost: Optional[float] = Field(default=None, ge=0, le=1_000_000_000, allow_inf_nan=False, description="Average cost per unit in the instrument's currency.")
    buyDate: Optional[date] = None
    assetType: AssetType = "equity"

    @field_validator("isin")
    @classmethod
    def _isin_checksum(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        upper = value.upper()
        if not isin_check_digit_ok(upper):
            raise ValueError("ISIN check digit doesn't match")
        return upper

    @field_validator("buyDate")
    @classmethod
    def _not_future(cls, value: Optional[date]) -> Optional[date]:
        if value is not None and value > now().date():
            raise ValueError("Purchase date can't be in the future")
        return value

    @model_validator(mode="after")
    def _instrument_given(self) -> "HoldingRow":
        if not self.symbol and not self.isin:
            raise ValueError("Each holding needs a symbol or an ISIN")
        return self


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: ImportSource = "manual"
    rows: List[HoldingRow] = Field(min_length=1, max_length=MAX_HOLDINGS_PER_IMPORT)


ReportRange = Literal["6mo", "1y", "2y", "5y"]
POSITION_KEY_PATTERN = r"^(MF:\d{1,10}|ISIN:[A-Z0-9]{12}|[A-Za-z0-9.^=&\-]{1,20})$"


_POSITION_KEY_RE = re.compile(POSITION_KEY_PATTERN)


class WhatIfCap(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(pattern=POSITION_KEY_PATTERN)
    maxWeight: float = Field(gt=0, lt=1, description="Largest weight allowed for this holding, as a fraction.")


class WhatIfShock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["market", "sector"]
    pct: float = Field(ge=-0.9, le=0.9, description="Shock as a fraction, e.g. -0.1 for a 10% fall.")
    sector: Optional[str] = Field(default=None, max_length=80)


class WhatIfRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    range: ReportRange = "1y"
    benchmark: str = Field(default="^NSEI", pattern=SYMBOL_PATTERN)
    confidence: float = Field(default=0.95, ge=0.8, le=0.99)
    cap: Optional[WhatIfCap] = None
    remove: List[str] = Field(default_factory=list, max_length=MAX_HOLDINGS_PER_IMPORT)
    shock: Optional[WhatIfShock] = None

    @field_validator("remove")
    @classmethod
    def _keys(cls, value: List[str]) -> List[str]:
        if any(not _POSITION_KEY_RE.match(key) for key in value):
            raise ValueError("Unknown holding key")
        return value
