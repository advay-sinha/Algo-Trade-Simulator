"""Personal-data detectors for anything a user stores or sends to a model provider.

Mirrors client/src/lib/pii.ts exactly; both are tested against shared/pii-vectors.json. Detectors
run in a fixed priority order and blank out each match before the next detector runs, so one value
is reported once with its most specific kind (a 16-digit BO ID is not also a bank account).

Never log or return a matched value — only its kind, field and row.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

KIND_LABELS: Dict[str, str] = {
    "pan": "a PAN",
    "aadhaar": "an Aadhaar number",
    "demat_id": "a demat / BO account ID",
    "bank_account": "a bank account number",
    "ifsc": "an IFSC code",
    "email": "an email address",
    "phone": "a phone number",
    "upi": "a UPI ID",
    "date": "a date (such as a date of birth)",
}
PLACEHOLDERS: Dict[str, str] = {
    "pan": "[PAN removed]",
    "aadhaar": "[Aadhaar removed]",
    "demat_id": "[demat ID removed]",
    "bank_account": "[bank account removed]",
    "ifsc": "[IFSC removed]",
    "email": "[email removed]",
    "phone": "[phone removed]",
    "upi": "[UPI ID removed]",
    "date": "[date removed]",
}

_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_valid(digits: str) -> bool:
    check = 0
    for index, char in enumerate(reversed(digits)):
        check = _VERHOEFF_D[check][_VERHOEFF_P[index % 8][int(char)]]
    return check == 0


_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
_B = r"(?<![0-9A-Za-z])"  # left boundary: not inside a longer alphanumeric run
_E = r"(?![0-9A-Za-z])"

# (kind, pattern, flags, extra check). Order matters: earlier detectors win the span.
_DETECTORS: List[Tuple[str, "re.Pattern[str]", Optional[Callable[[str], bool]]]] = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"), None),
    ("upi", re.compile(r"[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]+(?![A-Za-z0-9.@])"), None),
    ("demat_id", re.compile(_B + r"IN\d{14}" + _E, re.IGNORECASE), None),
    ("demat_id", re.compile(_B + r"\d{16}" + _E), None),
    ("aadhaar", re.compile(_B + r"[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}" + _E), lambda match: verhoeff_valid(re.sub(r"\D", "", match))),
    ("phone", re.compile(r"(?<![0-9A-Za-z+])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}" + _E), None),
    ("ifsc", re.compile(_B + r"[A-Za-z]{4}0[A-Za-z0-9]{6}" + _E), None),
    ("pan", re.compile(_B + r"[A-Za-z]{3}[PCHFATBLJGpchfatbljg][A-Za-z]\d{4}[A-Za-z]" + _E), None),
    ("date", re.compile(r"(?<!\d)(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})(?!\d)"), None),
    ("date", re.compile(r"(?<![0-9A-Za-z])\d{1,2}[\s-](?:" + _MONTHS + r")[a-z]*[\s-]\d{2,4}" + _E, re.IGNORECASE), None),
    ("bank_account", re.compile(_B + r"\d{9,18}" + _E), None),
]

DATE_FIELDS = {"buyDate"}
# Free text (chat, note title/body/tags) mentions market dates all the time; a date there can't be
# told apart from a date of birth, so the date detector only runs on structured import fields.
FREE_TEXT_FIELDS = {"text", "title", "body", "message"}


def _skip_dates(field: str) -> bool:
    return field in DATE_FIELDS or field in FREE_TEXT_FIELDS or field.startswith("tag")


@dataclass(frozen=True)
class Finding:
    field: str
    kind: str
    row: Optional[int] = None

    def public(self) -> Dict[str, object]:
        out: Dict[str, object] = {"field": self.field, "kind": self.kind, "label": KIND_LABELS[self.kind]}
        if self.row is not None:
            out["row"] = self.row
        return out


def _scan(value: str, field: str) -> List[Tuple[str, int, int]]:
    text = value
    hits: List[Tuple[str, int, int]] = []
    for kind, pattern, extra in _DETECTORS:
        if kind == "date" and _skip_dates(field):
            continue
        for match in list(pattern.finditer(text)):
            if extra is not None and not extra(match.group(0)):
                continue
            hits.append((kind, match.start(), match.end()))
            text = text[: match.start()] + " " * (match.end() - match.start()) + text[match.end() :]
    return hits


def scan_text(value: str, field: str = "text") -> List[str]:
    """Kinds of personal data found in one text value (deduplicated, detector order)."""
    seen: List[str] = []
    for kind, _, _ in _scan(value or "", field):
        if kind not in seen:
            seen.append(kind)
    return seen


def scan_fields(fields: Dict[str, Optional[str]], row: Optional[int] = None) -> List[Finding]:
    findings: List[Finding] = []
    for name, value in fields.items():
        if isinstance(value, str) and value:
            findings.extend(Finding(field=name, kind=kind, row=row) for kind in scan_text(value, name))
    return findings


def scan_rows(rows: Iterable[Dict[str, Optional[str]]]) -> List[Finding]:
    findings: List[Finding] = []
    for index, row in enumerate(rows, start=1):
        findings.extend(scan_fields(row, row=index))
    return findings


def mask(text: str) -> Tuple[str, List[str]]:
    """Replace every detected value with a placeholder; returns the masked text and the kinds found."""
    hits = sorted(_scan(text or "", "text"), key=lambda hit: hit[1], reverse=True)
    masked = text or ""
    for kind, start, end in hits:
        masked = masked[:start] + PLACEHOLDERS[kind] + masked[end:]
    kinds: List[str] = []
    for kind, _, _ in sorted(hits, key=lambda hit: hit[1]):
        if kind not in kinds:
            kinds.append(kind)
    return masked, kinds


def count_by_kind(findings: Sequence[Finding]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for finding in findings:
        counts[finding.kind] = counts.get(finding.kind, 0) + 1
    return counts
