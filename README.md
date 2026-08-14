# Mașina de bani

Un sistem automat care încearcă să genereze $100 de la capital zero, cu dashboard live
în care se vede fiecare acțiune, fiecare cent și raționamentul din spate.

**Dashboard:** https://nico43245.github.io/claude-bani/
**Jurnalul de decizii:** [DECISIONS.md](DECISIONS.md) — inclusiv greșelile.

---

## Cum funcționează

Totul derivă dintr-un jurnal append-only. Nimic nu se rescrie, nimic nu se șterge —
inclusiv fundăturile, ca să poți audita retroactiv orice afirmație.

```
data/ledger.jsonl   →  scouts/lib/ledger.mjs  →  data/state.json  →  index.html
   (evenimente)          (agregare)               (snapshot)          (dashboard)
```

### Arhitectura de cost

Decizia centrală de design: **munca deterministă și judecata rulează în locuri diferite.**

| Tip de muncă | Unde rulează | Cost marginal |
|---|---|---|
| Scraping, filtrare, scoring | GitHub Actions cron, repo public | $0 |
| Judecată, cod, decizii | Sesiune Claude Code | $0 în plus |

Nu există niciun API key de LLM în acest repo, și e intenționat. Un
`ANTHROPIC_API_KEY` în secrets „ca să lucreze agenții singuri" ar costa bani la
fiecare rulare, de 3 ori pe zi, la nesfârșit. Scouturile sunt cod simplu fără LLM.

---

## Componentele

### `scouts/bounty-radar.mjs` — găsește bounty-uri reale, respinge momelile

Partea grea nu e găsirea, e **respingerea**. Spațiul public de bounty-uri e dominat de
ferme de boți și taskuri sintetice; fără filtru, un sistem automat își arde tot efortul
pe momeli („Fix typo in README" avea 91 de PR-uri concurente).

Filtrele rulează de la cel mai ieftin la cel mai scump, ca să nu ardem rate-limit-ul pe
momeli evidente:

1. titlu generat de bot (timestamp ISO în titlu = generare periodică)
2. organizație-fermă cunoscută, cu blocklist **care se extinde singur** — dacă un repo
   produce multe issue-uri cu titluri aproape identice într-o scanare, e un generator
3. metadate repo: fork, sub 200★, prea nou, maintainer inactiv
4. dovadă de finanțare: un bot Algora/Polar/Opire a postat o sumă
5. **deja revendicat**: `/attempt` recent, PR finalizat, sau maintainer care cere oprirea PR-urilor

Nu filtrează după vechimea issue-ului, și e intenționat: un bounty vechi, finanțat și încă
nerevendicat pe un repo activ e o țintă *bună* — înseamnă că roiul de agenți a eșuat.

```bash
node scouts/bounty-radar.mjs
```

### `scouts/market-signals.mjs` — două motoare, două semnale diferite

1. **Hacker News** (stories + comments) → *durerea*: oameni care spun explicit că ar plăti.
   Bogat în context, sărac în volum, înclinat spre programatori.
2. **Google Suggest** → *cererea de căutare*: ce tastează oamenii efectiv. Ăsta e semnalul
   care contează cel mai mult fără audiență, fiindcă singurul canal care funcționează atunci
   e cel unde cumpărătorul caută deja singur.

```bash
node scouts/market-signals.mjs
```

### `index.html` — dashboard

Zero dependențe, zero build, mobile-first, dark/light. Citește `data/state.json` de pe
aceeași origine. Arată progresul, banii in/out, fluxul complet de acțiuni și — important —
**motivele de respingere** ale filtrului: un filtru care acceptă tot e inutil, unul care
respinge tot e stricat, iar motivele arată care din ele e.

---

## Rulare locală

```bash
node scouts/bounty-radar.mjs      # scanare bounty-uri (~5 min)
node scouts/market-signals.mjs    # semnale de piață (~3 min)
node scouts/lib/ledger.mjs        # recalculează state.json
python3 -m http.server 8899       # apoi deschide http://localhost:8899
```

Necesită un token GitHub: `gh auth login` local, sau `GITHUB_TOKEN` în mediu.

---

## Reguli

- **Zero secrete în repo.** Repo-ul e public (necesar pentru Pages + Actions gratuite).
  Nu intră aici IBAN, chei, parole sau date personale — doar sume și acțiuni.
- **Nicio acțiune publică fără aprobare umană.** Publicare de produs, deschidere de PR,
  postare — toate se confirmă înainte.
- **Eșecurile se logează la fel de vizibil ca reușitele**, ca `dead_end` în ledger.
