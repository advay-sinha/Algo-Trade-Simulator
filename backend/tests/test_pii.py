"""Personal-data detectors against the shared vector file (the client runs the same vectors)."""

import json
from pathlib import Path

from backend.services import pii

VECTORS = json.loads((Path(__file__).resolve().parents[2] / "shared" / "pii-vectors.json").read_text(encoding="utf-8"))


def test_vectors_match_exactly():
    failures = []
    for case in VECTORS["cases"]:
        got = sorted(pii.scan_text(case["value"], case["field"]))
        if got != sorted(case["kinds"]):
            failures.append((case["id"], got, case["kinds"]))
    assert failures == []


def test_every_kind_has_a_positive_vector():
    covered = {kind for case in VECTORS["cases"] for kind in case["kinds"]}
    assert covered == set(pii.KIND_LABELS)


def test_mask_replaces_values_and_reports_kinds():
    masked, kinds = pii.mask("My PAN is ABCPE1234F, call 9876543210 or mail investor.one@example.com about RELIANCE.NS")
    assert "ABCPE1234F" not in masked and "9876543210" not in masked and "investor.one@example.com" not in masked
    assert "[PAN removed]" in masked and "[phone removed]" in masked and "[email removed]" in masked
    assert "RELIANCE.NS" in masked
    assert kinds == ["pan", "phone", "email"]


def test_findings_never_carry_values():
    findings = pii.scan_rows([{"symbol": "ABCPE1234F", "isin": None}, {"symbol": "TCS.NS", "isin": "INE467B01029"}])
    assert [f.public() for f in findings] == [{"field": "symbol", "kind": "pan", "label": "a PAN", "row": 1}]
    assert "ABCPE1234F" not in json.dumps([f.public() for f in findings])
