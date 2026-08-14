# Propuneri de licitare — 14 august 2026

Contul gratuit are un număr limitat de propuneri pe lună. Nu împrăștiem: trei
licitări bine alese bat zece trimise la nimereală, mai ales fără recenzii.

Regula pe care o urmează toate trei: **arată că ai citit brief-ul**. Peste 90% din
concurență lipește același text peste tot, iar clienții văd asta imediat. O singură
observație tehnică specifică despre problema lui te scoate din grămadă.

---

## ȚINTA 1 — Exact Image Text Extraction · $213

https://www.freelancer.com/projects/optical-character-recognition/exact-image-text-extraction

**De ce asta prima:** e cea mai curată din tot lotul. OCR pe imagini proprii ale
clientului — fără termeni de utilizare încălcați, fără protecție anti-bot, fără
zone gri. Livrabil integral și verificabil.

**Sumă licitată:** `$190` · **Termen:** `3 zile`

```
Two questions decide the price on this job, and most bids will not ask them:

1. Are the images clean scans or photos taken at an angle? Photos need deskewing
   and perspective correction first, or accuracy drops hard.
2. Is the text in columns or tables? If so, reading order matters — plain OCR
   will interleave the columns and produce unusable output.

My approach: preprocess each image (deskew, denoise, threshold), run OCR, then
flag every word below a confidence threshold so you can see exactly which cells
need a human eye instead of finding errors later in your spreadsheet.

You get an Excel file with one row per image, a confidence column, and the
flagged low-confidence words highlighted. I run it on a sample of your images
and show you real output before you pay anything.

Recent work, source and results public:
https://nico43245.github.io/claude-bani/case-study.html

Send me 3-5 sample images and I will run them and send back the actual result,
free, so you can judge accuracy before hiring anyone.
```

---

## ȚINTA 2 — AI Agent for FMX Backup · $250

https://www.freelancer.com/projects/automation/agent-for-fmx-backup

**De ce e în regulă:** clientul cere accesul la **propriul** cont FMX, pentru
**propriile** date. Nu e scraping în spatele autentificării altcuiva — e un backup
al datelor lui dintr-un serviciu pe care îl plătește.

**Sumă licitată:** `$225` · **Termen:** `5 zile`

```
The part that will break this job if nobody plans for it: 51+ properties with
every ticket ever opened means the run will take hours and will fail partway
through at least once. A script that starts from zero after a failure is
useless at this scale.

So I build it to resume. It records what it has already pulled, and if the
connection drops or FMX rate-limits us at property 38, the next run picks up
there instead of starting over.

You get: one CSV or Excel per property plus a combined file, attachments
downloaded and linked to their tickets, a log of anything that failed, and the
ability to re-run it later to capture new tickets.

Two things I need to know: does your FMX plan include API access — that is much
faster and gentler than driving the web interface — and do you need file
attachments as well as ticket text?

Recent work, source and results public:
https://nico43245.github.io/claude-bani/case-study.html
```

---

## ȚINTA 3 — BatchLead-HubSpot Contact Sync · $442

https://www.freelancer.com/projects/api/batchlead-hubspot-contact-sync

**De ce e în regulă:** sincronizare între două sisteme ale clientului, prin API-uri
oficiale. Integrare curată, nu extragere de date de la terți.

**Sumă licitată:** `$390` · **Termen:** `6 zile`

```
The question that decides whether this sync works or corrupts your CRM: what is
the matching key? If you match contacts on email alone, every contact without
an email creates a duplicate, and every email change creates a second record.

I would match on a stable BatchLead ID stored in a custom HubSpot property, with
email as a fallback. That way an updated contact updates the same record instead
of quietly multiplying it.

You get: a sync that runs on a schedule, handles HubSpot rate limits with
backoff, retries failed records instead of dropping them silently, and writes a
short report each run — created, updated, skipped, failed and why.

I would also start it in dry-run mode against your real data so you can see
exactly what it would change before anything is written to HubSpot.

Recent work, source and results public:
https://nico43245.github.io/claude-bani/case-study.html
```

---

## Ce am respins din lotul de azi, și de ce

| Job | Buget | Motiv |
|---|---|---|
| Extract TradingView Script Code | $233 | Extragerea codului sursă ascuns al altcuiva — furt de proprietate intelectuală |
| LinkedIn Connection & Messaging Automation | — | Încalcă termenii LinkedIn |
| Instagram Email & Phone Scraper | — | Date personale, GDPR |
| Daily Nationwide Facebook Auto Leads | — | Extragere din rețele sociale + date personale |
| Solve Text CAPTCHAs | $209 | Rezolvare de CAPTCHA |
| AI Quiz-Taking Automation | $62 | Fraudă academică |

## Ce am evitat pentru risc de livrare, nu pentru etică

- **Daily Amazon Scraping Automation ($210)** — Amazon blochează agresiv scraperele.
  Aș putea promite, dar șansa să eșuez e mare, iar o livrare ratată la primul job
  distruge contul nou. Dacă vrei totuși, licităm oferind varianta prin API-ul
  oficial Amazon Product Advertising și îi spunem clientului diferența deschis.
- **Advanced Python Browser Automation with Proxy Integration ($231)** — „proxy
  integration & session management" e adesea numele elegant pentru evitarea
  detecției anti-bot. Merită întrebat clientul ce sursă țintește înainte de a licita.
- **Odoo Sales Module Customization ($442)** — cere expertiză reală de Odoo, nu
  scraping. Nu ne prefacem că avem ce n-avem.
