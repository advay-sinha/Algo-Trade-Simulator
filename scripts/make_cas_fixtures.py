"""Generate SYNTHETIC CAS statement PDFs for the in-browser reader's tests.

Every name, PAN, phone, email and account number here is invented (the PANs and IDs are shaped to
trip the personal-data detectors, which proves the reader skips statement headers). Real
statements are never committed: keep any you test with outside the repository.

Writes client/tests/fixtures/cas/{nsdl,cdsl,cams,kfintech,nsdl-locked}.pdf. Standard library only;
the locked file uses the PDF standard security handler (RC4, revision 2) with password TESTPASS01.

  python scripts/make_cas_fixtures.py
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import List, Optional, Tuple

OUT = Path(__file__).resolve().parents[1] / "client" / "tests" / "fixtures" / "cas"
PASSWORD = "TESTPASS01"
PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")

HEADER = [
    "Asha Example",
    "PAN: ABCPE1234F",
    "12 Example Road, Kothrud, Pune 411038",
    "Email: investor.one@example.com   Mobile: 9876543210",
]

STATEMENTS = {
    "nsdl": [
        "NSDL Consolidated Account Statement (CAS)",
        "Statement for the period from 01-Sep-2026 to 30-Sep-2026",
        *HEADER,
        "NSDL Demat Account   DP Name: EXAMPLE SECURITIES LTD   DP ID: IN300999   Client ID: 12345678",
        "Equities (E)",
        "ISIN          ISIN Description                  Face Value   No. of Shares   Market Price   Value (Rs.)",
        "INE002A01018  RELIANCE INDUSTRIES LIMITED        10.00        40              1,186.40       47,456.00",
        "INE467B01029  TATA CONSULTANCY SERVICES LTD.     1.00         20              2,114.40       42,288.00",
        "INE040A01034  HDFC BANK LIMITED                  1.00         50              704.80         35,240.00",
        "Exchange Traded Funds",
        "INF204KB17I5  NIPPON INDIA ETF GOLD BEES         1.00         300             121.58         36,474.00",
        "Total                                                                                         1,61,458.00",
    ],
    "cdsl": [
        "CDSL Consolidated Account Statement",
        "CAS ID: 98765   Statement for the period 01-09-2026 to 30-09-2026",
        *HEADER,
        "BO ID: 1208160012345678   DP: EXAMPLE BROKING LIMITED",
        "ISIN          Security                 Current Bal   Free Bal   Lock-in Bal   Pledged Bal   Market Price   Value",
        "INE009A01021  INFOSYS LIMITED          30.000        30.000     0.000         0.000         1,020.50       30,615.00",
        "INE154A01025  ITC LIMITED              100.000       100.000    0.000         0.000         404.25         40,425.00",
        "Portfolio Value  71,040.00",
    ],
    "cams": [
        "Consolidated Account Statement   CAMS",
        "01-Apr-2026 To 30-Sep-2026",
        *HEADER,
        "Axis Mutual Fund",
        "Folio No: 9123456/78   PAN: ABCPE1234F   KYC: OK",
        "Axis Children's Fund - Direct Plan - Growth Option (ISIN: INF846K01WO1)",
        "Opening Unit Balance: 450.000",
        "01-Jul-2026   SIP Purchase   1,500.00   52.000   28.8462   502.000",
        "Closing Unit Balance: 502.000   NAV on 30-Sep-2026: INR 29.0001   Total Cost Value: 13,120.00   Market Value on 30-Sep-2026: INR 14,558.05",
        "Total Market Value   14,558.05",
    ],
    "kfintech": [
        "Consolidated Account Statement   KFintech",
        "Statement period 01-Apr-2026 to 30-Sep-2026",
        *HEADER,
        "Folio No: 4455667788 / 0   PAN: ABCPE1234F",
        "Example Large Cap Fund - Regular Plan - Growth   ISIN: INF846K01WJ1",
        "Closing Unit Balance: 120.500   Cost Value: INR 2,410.00   NAV: 25.2450   Valuation on 30-Sep-2026: INR 3,042.02",
        "Grand Total   3,042.02",
    ],
}


def rc4(key: bytes, data: bytes) -> bytes:
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    out = bytearray()
    i = j = 0
    for byte in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        out.append(byte ^ s[(s[i] + s[j]) % 256])
    return bytes(out)


def pad(password: str) -> bytes:
    return (password.encode("latin-1") + PAD)[:32]


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(lines: List[str], password: Optional[str] = None) -> bytes:
    content_lines = ["BT", "/F1 9 Tf", "11 TL", "36 800 Td"]
    for line in lines:
        content_lines.append(f"({escape(line)}) Tj T*")
    content_lines.append("ET")
    content = "\n".join(content_lines).encode("latin-1")

    file_id = hashlib.md5(b"".join(line.encode("latin-1") for line in lines)).digest()
    key: Optional[bytes] = None
    encrypt_obj = None
    permissions = -44
    if password is not None:
        owner = rc4(hashlib.md5(pad(password + "-owner")).digest()[:5], pad(password))
        key = hashlib.md5(pad(password) + owner + permissions.to_bytes(4, "little", signed=True) + file_id).digest()[:5]
        user = rc4(key, PAD)
        encrypt_obj = f"<< /Filter /Standard /V 1 /R 2 /O <{owner.hex()}> /U <{user.hex()}> /P {permissions} >>".encode()

    def protect(number: int, data: bytes) -> bytes:
        if key is None:
            return data
        object_key = hashlib.md5(key + number.to_bytes(3, "little") + (0).to_bytes(2, "little")).digest()[:10]
        return rc4(object_key, data)

    stream = protect(4, content)
    objects: List[Tuple[int, bytes]] = [
        (1, b"<< /Type /Catalog /Pages 2 0 R >>"),
        (2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
        (3, b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"),
        (4, b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"),
        (5, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    ]
    if encrypt_obj is not None:
        objects.append((6, encrypt_obj))
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for number, body in objects:
        offsets[number] = len(out)
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    count = len(objects) + 1
    out += f"xref\n0 {count}\n0000000000 65535 f \n".encode()
    for number in range(1, count):
        out += f"{offsets[number]:010d} 00000 n \n".encode()
    trailer = f"<< /Size {count} /Root 1 0 R /ID [<{file_id.hex()}> <{file_id.hex()}>]".encode()
    if encrypt_obj is not None:
        trailer += b" /Encrypt 6 0 R"
    out += b"trailer\n" + trailer + b" >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF\n"
    return bytes(out)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, lines in STATEMENTS.items():
        (OUT / f"{name}.pdf").write_bytes(build_pdf(lines))
    (OUT / "nsdl-locked.pdf").write_bytes(build_pdf(STATEMENTS["nsdl"], PASSWORD))
    print(f"wrote {len(STATEMENTS) + 1} synthetic fixtures to {OUT.relative_to(OUT.parents[3])}")


if __name__ == "__main__":
    main()
