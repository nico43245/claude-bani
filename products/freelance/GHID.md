# Pachet freelance — gata de folosit

Tot ce urmează e scris ca să copiezi și să dai paste. Nu trebuie să compui nimic.

**Ce fac eu:** găsesc joburile, scriu propunerile, execut integral lucrarea.
**Ce faci tu:** creezi profilul o dată (~20 min), dai send la propuneri, transmiți livrabilul.

---

## De ce funcționează asta când restul nu a funcționat

Am eliminat azi patru canale cu date, nu cu presupuneri:

| Canal | Măsurătoare | Verdict |
|---|---|---|
| Bounty-uri OSS | 800 candidați → 6 finanțate → **0 câștigabile** | mort |
| Gumroad | 33/36 produse sub 5 recenzii | nu distribuie trafic |
| Etsy | 1.000+ produse și ~24 reclame plătite pe **orice** interogare | îngropat fără recenzii |
| HN „Seeking freelancer" | **1 client la 80 de freelanceri** pe 4 luni | mort |

Tiparul: **orice canal fără fricțiune e saturat pe partea de ofertă.** Când oricine poate
livra muncă cu AI, valoarea se mută acolo unde există o barieră de intrare.

Upwork și Fiverr *au* acea barieră — profil, verificare, istoric. De aceea acolo mai există
cerere neacoperită. E și motivul pentru care nu pot intra eu în locul tău: contul e al tău,
verificarea e a ta, iar eu nu creez conturi și nu introduc date personale.

> Notă de onestitate: prețurile de mai jos sunt din cunoștințe generale despre piață, nu
> măsurate. Ambele platforme blochează inspecția automată (Cloudflare), iar ocolirea
> protecției anti-bot e exclusă. Ajustează după ce vezi concurența reală din contul tău.

---

## Poziționarea ta

Nu concura pe „scriu cod ieftin" — acolo sunt zeci de mii de oameni și prețul tinde spre zero.
Concurează pe ceva verificabil: **ai o lucrare publică, cu date reale, care demonstrează
gândire, nu doar execuție.**

Activul tău: https://nico43245.github.io/claude-bani/case-study.html

E neobișnuit de puternic pentru un cont fără recenzii, pentru că arată exact ce nu poate
arăta un portofoliu obișnuit: un sistem care a găsit fraudă, a învățat singur tipare noi,
și-a raportat propriul defect și a ajuns la o concluzie negativă corectă. Clienții serioși
plătesc pentru judecată, nu pentru linii de cod.

---

## Bio de profil (paste direct)

```
I build small, reliable automation: data extraction, API integrations, and scripts that
turn messy sources into clean, usable output.

Recent work — a filtering system that scanned 800 public listings, detected automated
fraud farms, extended its own blocklist without being told, and correctly proved the
market held nothing worth pursuing. Source, live dashboard and full decision log are
public, including the bugs I found in my own work:
https://nico43245.github.io/claude-bani/case-study.html

How I work: I tell you what the data actually says, including when the answer is "this
won't work." No dependencies you have to maintain, no framework you didn't ask for, and
plain-language notes on every decision so you can hand the code to someone else later.

Available for short, well-defined jobs. Fast turnaround on anything under a day.
```

---

## Oferte de vânzare (Fiverr / gig-uri)

### Oferta 1 — extragere de date (cea mai mare cerere)

**Titlu:** `I will build a custom web scraper or data extraction script in Python or Node`

**Descriere:**
```
You need data from a website, an API, or a pile of files — in a spreadsheet, on a schedule,
without babysitting it. That is what I build.

WHAT YOU GET
· A working script, run and verified on your actual source before delivery
· Clean CSV / JSON / Excel output in the exact shape you asked for
· Handles the boring failures properly: rate limits, pagination, missing fields, retries
· Plain-language notes so you or anyone else can change it later
· No dependencies you have to maintain

WHAT I NEED FROM YOU
· The source (URL, API docs, or sample files)
· The fields you want and the output format

HONEST LIMITS
I do not bypass CAPTCHAs, login walls, or bot protection, and I will tell you before you
order if a site is protected — rather than take the money and fail. Most public sources
are fine.

Message me with the source before ordering and I will tell you straight whether it is
feasible and what it should cost.
```

**Pachete:**

| | Basic | Standard | Premium |
|---|---|---|---|
| Preț | $25 | $60 | $120 |
| Conținut | Sursă unică, până la 5 câmpuri, export CSV | Surse multiple sau paginare, curățare date, CSV/JSON/Excel | Rulare programată, dashboard sau alerte, monitorizare erori |
| Livrare | 2 zile | 3 zile | 5 zile |
| Revizii | 2 | 3 | nelimitat |

### Oferta 2 — automatizare de foi de calcul

**Titlu:** `I will automate your Google Sheets or Excel workflow so it updates itself`

Cererea e reală și verificată de mine: „spreadsheet to track expenses", „excel template for
small business" și variantele lor ies la maxim în datele de căutare. Vinde **munca**, nu
șablonul — șabloanele sunt saturate, automatizarea personalizată nu.

**Pachete:** $30 / $75 / $150 (formule și curățare → import automat de date → dashboard live
cu actualizare programată).

### Oferta 3 — reparare de script stricat

**Titlu:** `I will fix your broken Python or Node script and explain what went wrong`

Marjă foarte bună, livrare rapidă, iar clientul are deja o durere urgentă și buget alocat.
**Pachete:** $20 / $45 / $90.

---

## Șabloane de propunere

Regula: primele două rânduri decid dacă e citită. Nu începe cu „Dear Sir/Madam" și nu-ți
recita CV-ul. Arată că ai înțeles problema și dă o dovadă concretă.

### Pentru joburi de extragere de date

```
Your source is [X] and you want [Y] as [format]. Two things I would check before writing
anything: whether [specific technical concern from their post], and whether the data is
paginated behind [thing you noticed].

I built something similar last week — a scanner that pulled 800 listings from a public API,
filtered them against fraud patterns, and handled rate limits without dropping records.
Source and results are public: https://nico43245.github.io/claude-bani/case-study.html

I can have a working version to you in [N] days for [$X]. Send me the source and I will
confirm feasibility before you commit anything.
```

### Pentru joburi de reparare

```
[One specific, plausible guess at the cause, based on their description.]

Send me the script and the exact error. I will tell you within an hour what is wrong and
what it costs to fix — free, whether or not you hire me. If it is a 10-minute fix I will
say so rather than sell you a package.

Recent work, source and decision log public:
https://nico43245.github.io/claude-bani/case-study.html
```

---

## Reguli pe care le respect

- **Nu promit ce nu pot livra.** Dacă un site e protejat anti-bot, spun înainte de comandă.
  Un refuz cinstit costă un job; o livrare eșuată costă contul.
- **Nu ocolesc CAPTCHA, login-uri sau protecție anti-bot.** Nici pentru bani.
- **Prima propunere e gratuită ca diagnostic.** Convertește mult mai bine decât o ofertă
  rece și te diferențiază exact acolo unde toți ceilalți trimit text generat.
