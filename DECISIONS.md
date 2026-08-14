# Jurnal de decizii

Fiecare decizie, cu motivul și dovada. Inclusiv cele greșite — mai ales cele greșite,
pentru că altfel jurnalul devine reclamă, nu evidență.

---

## 2026-08-14 · Pariuri sportive și crypto: excluse

**Decizie:** nu construim nimic pe pariuri sau trading.

**De ce:** două motive independente, fiecare suficient singur.
1. Nu am voie să execut tranzacții financiare — pariuri, ordine de trading, transferuri.
2. Ambele cer capital, ceea ce contrazice direct constrângerea „costuri zero". Cu 0 lei
   în cont nu există pariu și nu există poziție. Nu e o piedică birocratică, e aritmetică.

**Consecință:** de la capital zero, singura cale reală e vânzarea de muncă sau produse.

---

## 2026-08-14 · Bounty-uri OSS ca pistă principală — recomandare GREȘITĂ, retrasă

**Ce am recomandat inițial:** bounty-uri open-source ca pistă cu cea mai mare
probabilitate de a atinge $100 („munca e definită clar, nu are nevoie de marketing,
plata e garantată la merge").

**Ce am găsit când am verificat în loc să presupun:**

| Verificare | Rezultat |
|---|---|
| Issue-uri cu label `bounty`, deschise | 3.943 |
| Proiecte serioase cu inventar real | documenso 0, trigger.dev 0, twenty 0, novu 0, formbricks 0, mem0 0, refine 0, keep 0, remotion 0, activepieces **1** |
| Candidați scanați de radar | 800 |
| Cu dovadă de finanțare reală | 6 |
| **Efectiv câștigabile** | **0** |

Toate cele 6 finanțate erau deja luate:

- [`activepieces#8072`](https://github.com/activepieces/activepieces/issues/8072) — $200, deja
  adjudecat; maintainerul confirmă „PR #8083 has been finalized for this bounty", blocat doar
  în Google App Review.
- [`gyroflow#45`](https://github.com/gyroflow/gyroflow/issues/45) — $500, PR #1189 deja deschis
  și „mergeable, ready for review".
- [`gyroflow#742`](https://github.com/gyroflow/gyroflow/issues/742) — $500, PR-uri concurente
  și dispută pe prioritatea revendicării.
- [`gyroflow#150`](https://github.com/gyroflow/gyroflow/issues/150) — $200, maintainerul cere
  explicit: *„please don't create any more PRs for this, There's already way too many of them"*.
- [`EdgeChains#279`](https://github.com/arakoodev/EdgeChains/issues/279) — $25, 3 încercări în
  3 săptămâni, și e pentru Palm2, un API Google mort.
- [`highlight#8032`](https://github.com/highlight/highlight/issues/8032) — $20, 3 încercări
  în 2 săptămâni.

**Concluzie:** piața publică de bounty-uri nu e doar subțire, e o **coadă** — munca e făcută
de alții înainte să ajungi tu. Restul „inventarului" sunt ferme de boți: `relayhop` generează
un bounty fals pe oră, `NSPG13` și `bounty-plaza` fac bounty-uri circulare între agenți, iar
fork-uri ca `CurtFigone19/pgx` conțin taskuri sintetice de benchmark care nu plătesc nimic.

**Ce rămâne:** radarul stă pornit ca supraveghere gratuită pentru inventar *nou*. Costă zero
și dacă prinde un bounty real de $150 înainte de roi, ținta e atinsă dintr-o lovitură. Dar nu
e baza planului.

---

## 2026-08-14 · Defect în propriul radar: excludea exact ținta corectă

**Ce s-a întâmplat:** prima versiune a radarului căuta doar issue-uri create în ultimele
120 de zile și respingea orice avea peste 25 de comentarii. Rezultat: 0 găsiri din 101
candidați — părea că piața e goală.

Bounty-ul de $200 de la activepieces, deschis din iunie 2025 cu 28 de comentarii, cădea
prin ambele filtre. Iar în faza de planificare identificasem exact nișa corectă —
*bounty-urile vechi, nerevendicate, pe care roiul de agenți a eșuat* — și apoi construisem
filtrul care le excludea tocmai pe alea.

**Corecție:** vechimea issue-ului nu mai filtrează nimic. Semnalul de moarte e maintainerul
inactiv, nu data issue-ului. După fix: 800 candidați → 6 finanțate găsite.

**Lecția aplicată:** un filtru care respinge tot e indistinct de un filtru stricat. De aceea
dashboard-ul arată motivele respingerii, iar filtrul are un test de control cu un bounty
curat care **trebuie** să treacă.

---

## 2026-08-14 · Arhitectura de cost: unde rulează fiecare tip de muncă

**Decizie:** munca deterministă rulează pe GitHub Actions; judecata rulează în sesiune.

| Tip de muncă | Unde | Cost marginal |
|---|---|---|
| Scraping, filtrare, scoring, agregare | GitHub Actions cron (repo public) | $0 |
| Judecată, cod, decizii, scris | Sesiune Claude Code | $0 în plus (abonament deja plătit) |

**De ce contează:** varianta evidentă — un `ANTHROPIC_API_KEY` în secrets „ca să lucreze
agenții singuri" — ar genera cost real la fiecare rulare, de 3 ori pe zi, la nesfârșit.
Scouturile sunt cod simplu, fără LLM. Automatizare 24/7 la cost efectiv zero.

---

## 2026-08-14 · Sursele de date, testate înainte de a construi pe ele

Am testat disponibilitatea reală în loc să presupun:

| Sursă | Stare | Folosită |
|---|---|---|
| Hacker News (Algolia) | gratis, fără cont, 4.945 comentarii pe o singură interogare | da |
| Google Suggest | gratis, fără cont, dă cererea de căutare reală | da |
| npm registry | gratis, fără cont | rezervă |
| Reddit JSON | **blochează** accesul neautentificat | nu |

**Cea mai importantă:** Google Suggest. HN îmi spune ce îi enervează pe programatori;
Suggest îmi spune **ce tastează oamenii ca să cumpere**. Cu zero audiență, al doilea semnal
e singurul care contează — fără public propriu, funcționează doar canalele unde cumpărătorul
caută deja singur.

---

## 2026-08-14 · Prima citire a cererii de căutare

96 de interogări reale colectate. Cererea se concentrează fără echivoc pe urmărirea
banilor personali — toate la ramificație maximă (10/10 sub-sugestii, semn de venă bogată):

- `spreadsheet to track expenses` · `spreadsheet to track spending`
- `excel template for budget` · `excel template for personal finance`
- `google sheets template for budget` · `google sheets template for budgeting`
- `notion template for college students` · `notion template for work`

Subiecte dominante peste semințe diferite: **excel** (30 interogări × 6 semințe),
**budget**, **spreadsheet**, **expenses**, **tracker**.

**Statut:** semnal puternic, dar cerere mare înseamnă și concurență mare. Alegerea
produsului se face abia după ce evaluez concurența pe cozile lungi — nu construiesc pe
volumul brut de căutări.
