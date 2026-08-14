#!/usr/bin/env python3
"""
Bază de scraper pentru livrări Fiverr.

Rostul acestui fișier: la o comandă nouă nu scriu de la zero: configurez partea
de sus, adaptez extract_row(), rulez, livrez. Toate lucrurile care de obicei se
uită — limitare de ritm, reîncercări, paginare, encoding, câmpuri lipsă — sunt
deja rezolvate aici, pentru că exact alea produc livrări proaste.

Comportament implicit: politicos. Respectă robots.txt, se prezintă cu un
User-Agent real și nu trage mai repede decât un om. Nu ocolește CAPTCHA, login
sau protecție anti-bot — dacă sursa e protejată, se oprește cu un mesaj clar în
loc să încerce trucuri care ar putea suspenda contul clientului.

Rulare:
    pip install -r requirements.txt
    python3 scraper.py
"""

from __future__ import annotations

import csv
import json
import random
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURARE — singura zonă care se schimbă de la o comandă la alta
# ─────────────────────────────────────────────────────────────────────────────

START_URL = "https://books.toscrape.com/catalogue/page-1.html"

# Selector CSS pentru fiecare element din listă (un rând în output).
ROW_SELECTOR = "article.product_pod"

# Câmp de output -> selector CSS relativ la rând.
# Pune ("selector", "attr") ca să iei un atribut în loc de text.
FIELDS: dict[str, object] = {
    "title": ("h3 a", "title"),
    "price": "p.price_color",
    "url": ("h3 a", "href"),
}

# Selectorul butonului „pagina următoare". None = o singură pagină.
NEXT_PAGE_SELECTOR = "a[rel='next']"

MAX_PAGES = 3                  # plasă de siguranță împotriva buclelor infinite
DELAY_SECONDS = (1.0, 2.0)      # pauză aleatoare între cereri
TIMEOUT = 20
MAX_RETRIES = 3
OUTPUT_BASENAME = "output"      # produce output.csv / .json / .xlsx
OUTPUT_FORMATS = ["csv", "json"]  # adaugă "xlsx" dacă clientul cere Excel
RESPECT_ROBOTS = True

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# ─────────────────────────────────────────────────────────────────────────────


class BlockedError(RuntimeError):
    """Sursa e protejată. Ne oprim — nu ocolim protecția anti-bot."""


@dataclass
class Stats:
    pages: int = 0
    rows: int = 0
    retries: int = 0
    missing: dict[str, int] = field(default_factory=dict)


def robots_allows(url: str) -> bool:
    if not RESPECT_ROBOTS:
        return True
    parts = urlparse(url)
    rp = RobotFileParser()
    rp.set_url(f"{parts.scheme}://{parts.netloc}/robots.txt")
    try:
        rp.read()
    except Exception:
        # Fără robots.txt accesibil, presupunem permis — comportamentul standard.
        return True
    return rp.can_fetch(USER_AGENT, url)


def looks_blocked(resp: requests.Response) -> bool:
    """Semnale că am dat de o protecție anti-bot, nu de o eroare obișnuită."""
    if resp.status_code in (401, 403, 407, 511):
        return True
    marks = ("just a moment", "needs a human touch", "cf-challenge",
             "captcha", "are you a robot", "access denied", "enable javascript")
    head = resp.text[:3000].lower()
    return any(m in head for m in marks)


def fetch(session: requests.Session, url: str, stats: Stats) -> str:
    """GET cu reîncercări și backoff exponențial. Ridică BlockedError la protecție."""
    last = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=TIMEOUT)
        except requests.RequestException as exc:
            last = exc
            stats.retries += 1
            time.sleep(2 ** attempt)
            continue

        if looks_blocked(resp):
            raise BlockedError(
                f"Sursa pare protejată anti-bot (HTTP {resp.status_code}) la {url}.\n"
                "Nu ocolim CAPTCHA, login sau protecție anti-bot. Spune clientului "
                "asta înainte de comandă, nu după."
            )

        # 429 și 5xx merită reîncercate; restul erorilor, nu.
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = int(resp.headers.get("Retry-After", 2 ** attempt))
            stats.retries += 1
            print(f"  HTTP {resp.status_code} — reîncerc în {wait}s "
                  f"({attempt}/{MAX_RETRIES})", file=sys.stderr)
            time.sleep(wait)
            continue

        resp.raise_for_status()
        # Lasă requests să deducă encoding-ul din conținut, nu doar din antet:
        # altfel diacriticele ajung stricate în CSV.
        resp.encoding = resp.apparent_encoding or resp.encoding
        return resp.text

    raise RuntimeError(f"Eșuat după {MAX_RETRIES} încercări: {url} ({last})")


def extract_row(el, base_url: str, stats: Stats) -> dict:
    """Un element din listă -> un dicționar. Aici se adaptează per comandă."""
    row = {}
    for name, rule in FIELDS.items():
        selector, attr = rule if isinstance(rule, tuple) else (rule, None)
        node = el.select_one(selector)
        if node is None:
            # Câmpurile lipsă se numără și se raportează, nu se ascund: dacă
            # 40% dintr-o coloană lipsește, clientul trebuie să afle de la mine.
            stats.missing[name] = stats.missing.get(name, 0) + 1
            row[name] = None
            continue
        if attr:
            value = node.get(attr)
            if attr in ("href", "src") and value:
                value = urljoin(base_url, value)
        else:
            value = node.get_text(" ", strip=True)
        row[name] = value
    return row


def write_csv(rows: list[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        # utf-8-sig: fără BOM, Excel strică diacriticele la deschidere.
        writer = csv.DictWriter(fh, fieldnames=list(FIELDS))
        writer.writeheader()
        writer.writerows(rows)


def write_json(rows: list[dict], path: Path) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def write_xlsx(rows: list[dict], path: Path) -> None:
    try:
        from openpyxl import Workbook
    except ImportError:
        print("  openpyxl lipsește — sar peste Excel (pip install openpyxl)", file=sys.stderr)
        return
    wb = Workbook()
    ws = wb.active
    ws.append(list(FIELDS))
    for r in rows:
        ws.append([r.get(k) for k in FIELDS])
    wb.save(path)


def main() -> int:
    if not robots_allows(START_URL):
        print(f"robots.txt interzice accesul la {START_URL}. Mă opresc.", file=sys.stderr)
        print("Spune clientului înainte de comandă — nu după.", file=sys.stderr)
        return 2

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
    })

    stats = Stats()
    rows: list[dict] = []
    url = START_URL
    seen: set[str] = set()

    while url and stats.pages < MAX_PAGES:
        if url in seen:
            print("  Paginarea se învârte în cerc — mă opresc.", file=sys.stderr)
            break
        seen.add(url)

        print(f"[{stats.pages + 1}] {url}", file=sys.stderr)
        try:
            html = fetch(session, url, stats)
        except BlockedError as exc:
            print(f"\nOPRIT: {exc}", file=sys.stderr)
            return 3

        soup = BeautifulSoup(html, "html.parser")
        found = soup.select(ROW_SELECTOR)
        if not found:
            print("  Niciun rând găsit — selectorul nu se potrivește "
                  "sau pagina e randată din JavaScript.", file=sys.stderr)

        for el in found:
            rows.append(extract_row(el, url, stats))
        stats.rows = len(rows)
        stats.pages += 1

        nxt = soup.select_one(NEXT_PAGE_SELECTOR) if NEXT_PAGE_SELECTOR else None
        url = urljoin(url, nxt.get("href")) if nxt and nxt.get("href") else None
        if url:
            time.sleep(random.uniform(*DELAY_SECONDS))

    if not rows:
        print("\nZero rânduri extrase. Nu livrez un fișier gol.", file=sys.stderr)
        return 4

    for fmt in OUTPUT_FORMATS:
        path = Path(f"{OUTPUT_BASENAME}.{fmt}")
        {"csv": write_csv, "json": write_json, "xlsx": write_xlsx}[fmt](rows, path)
        print(f"  scris {path} ({len(rows)} rânduri)", file=sys.stderr)

    print(f"\nGata: {stats.rows} rânduri din {stats.pages} pagini "
          f"({stats.retries} reîncercări)", file=sys.stderr)
    for name, n in stats.missing.items():
        pct = n / stats.rows * 100
        flag = "  <-- verifică selectorul" if pct > 20 else ""
        print(f"  câmp lipsă «{name}»: {n} rânduri ({pct:.0f}%){flag}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
