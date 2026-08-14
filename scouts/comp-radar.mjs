// Radar de competiții — canale unde plata vine din muncă evaluată, nu din persuasiune.
//
// De ce există fișierul ăsta. Pistele de freelance cer ca un om să convingă alt om,
// de fiecare dată, pentru fiecare job. Competițiile nu: trimiți o lucrare, e evaluată
// după reguli publice, iar dacă e cea mai bună primești banii. Fără licitații, fără
// reputație, fără recenzii, fără client de convins. Pentru un sistem automat, asta e
// singura formă de venit care nu are un om pe post de gât de sticlă.
//
// Ce am aflat măsurând manual 45 de hackathoane pe 14 august 2026, și de ce filtrul
// arată așa: cifrele publicate de Devpost mint pe TOATE cele trei axe care contează.
//
//   1. „Premiul e în bani."  Galuxium Nexus V2 afișează „$1,000 in cash", iar în
//      regulament scrie: „No physical cash, fiat currency, or direct liquid capital
//      will be awarded." Sunt credite de infrastructură. Hacksocial afișează $3,979
//      „cash", din care abonamente Boot.dev și Knowledge Owl.
//   2. „Oricine poate participa."  Majoritatea sunt „Students only — professionals
//      and companies excluded". Nu apare în API, doar în regulament.
//   3. „Toate țările."  Formularea standard e „excluding standard exceptions", iar
//      lista reală diferă radical de la caz la caz. AWS Trainium exclude Franța,
//      Italia, Spania, Polonia, Australia, Brazilia. România nu e exclusă — dar asta
//      se află doar citind regulamentul, nu din listare.
//
// Deci: câmpul `prize_amount` din API e inutil singur. Filtrul de mai jos verifică
// fiecare afirmație în textul regulamentului, iar ce nu se confirmă se respinge cu
// motivul scris. Ca la radarul de bounty-uri: valoarea nu e în ce găsește, e în ce
// respinge argumentat.

import { setTimeout as sleep } from 'node:timers/promises';
import { append, readOpps, writeOpps, rebuildState } from './lib/ledger.mjs';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Țara în care ajung banii. Dacă apare pe lista de excluderi, competiția e moartă
// pentru noi indiferent cât de bună arată.
const HOME_COUNTRY = /\bromania\b/i;

const RULES = {
  MIN_PRIZE_USD: 200, // sub asta, nici primul loc nu merită zilele de muncă
  MIN_DAYS_LEFT: 2, // sub 2 zile nu apuc să construiesc ceva serios
  MAX_DAYS_LEFT: 90, // peste 3 luni nu e o pistă, e o intenție
  MAX_PARTICIPANTS_PER_SLOT: 600, // peste asta e loterie, nu competiție
};

// ── Detectoare aplicate pe textul regulamentului ────────────────────────────

// Premiu care pare bani și nu e. Formulările sunt surprinzător de consistente,
// pentru că toate încearcă să pară cash fără să mintă juridic.
const FAKE_CASH = [
  { re: /no (physical )?cash[^.]{0,60}(will be awarded|awarded|prize)/i, why: 'regulamentul spune explicit că nu se dau bani' },
  { re: /\bno\b[^.]{0,40}\bfiat currency\b/i, why: 'exclude explicit moneda reală' },
  { re: /fair.?market (value|equivalent)[^.]{0,80}(grant|credit|infrastructure)/i, why: '„valoare echivalentă", adică credite' },
  { re: /direct liquid capital will not|no direct liquid capital/i, why: 'exclude explicit capitalul lichid' },
  { re: /prizes? (are|will be) (awarded|issued|paid) (in|as) (credits|cloud credits|tokens|points)/i, why: 'premiul se plătește în credite' },
];

// Contrazicerea etichetei. Devpost pune un tag „Students only" pe care organizatorul
// îl poate infirma explicit în propriul regulament — Galuxium Nexus V2 scrie
// „fully unrestricted" și „welcomes professional engineers, enterprise architects,
// independent founders" pe o pagină etichetată drept „students only". Fără verificarea
// asta, filtrul respinge competiții deschise pe baza unei etichete greșite. E fix
// greșeala care mi-a omorât prima versiune de radar de bounty-uri: am filtrat după un
// semnal ieftin și am aruncat ținta bună.
// Infirmarea trebuie să vorbească despre STATUTUL participantului. Prima versiune
// accepta „open to all", care în regulamente înseamnă aproape întotdeauna „open to all
// countries/territories" — o frază despre geografie, nu despre studenți. Așa au trecut
// Hacksocial și PeddieHacks, care chiar sunt doar pentru studenți. Fiecare tipar de mai
// jos conține obligatoriu „professional", „student", „founder" sau „unrestricted".
// Formularea negativă („professionals are NOT eligible") e exclusă explicit prin
// tiparul temperat, altfel o interdicție ar fi citită drept permisiune.
const STUDENT_TAG_OVERRIDE = new RegExp(
  [
    'fully unrestricted',
    'welcomes?(?:(?!\\bnot\\b)[^.]){0,30}(?:professional|industry|founder)',
    'professionals?(?:(?!\\bnot\\b)[^.]){0,25}(?:are welcome|welcome to|are eligible|encouraged to)',
    'no (?:student|enrollment) (?:requirement|restriction)',
    'not (?:limited|restricted) to students',
    'open to (?:non.?students|everyone regardless)',
  ].join('|'),
  'i',
);

// Restricții de participare care ne scot din start.
const BLOCKERS = [
  { re: /students? only/i, why: 'doar studenți', students: true },
  { re: /(must be|currently) (a )?(enrolled|full.?time) student/i, why: 'doar studenți înscriși', students: true },
  { re: /(professionals?|companies|working professionals)[^.]{0,40}(are )?(excluded|not eligible|may not)/i, why: 'profesioniștii sunt excluși', students: true },
  { re: /high school students only|open only to (high school|undergraduate)/i, why: 'doar elevi/studenți', students: true },
  { re: /must be (a )?(resident|citizen) of the united states|u\.?s\.? residents only/i, why: 'doar rezidenți SUA' },
];

// Semnalul cel mai valoros: evaluare obiectivă. Un scor pe leaderboard nu poate fi
// influențat de reputație sau de cât de bine scrii o propunere — exact tipul de
// competiție unde un sistem automat are șanse reale.
const OBJECTIVE = /leaderboard|benchmark|automatically (scored|evaluated|ranked)|ranked (on|by) (the )?(score|accuracy|performance)|test suite|reproducible (script|results)|evaluation harness/i;

// ── Extragere ───────────────────────────────────────────────────────────────

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://devpost.com/hackathons',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  return res.text();
}

/** Curăță HTML în text simplu, ca să pot căuta formulările din regulament. */
function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

function money(s) {
  if (!s) return 0;
  const m = String(s)
    .replace(/<[^>]*>/g, '')
    .match(/[\d,]+/);
  return m ? Number(m[0].replace(/,/g, '')) : 0;
}

/** „about 1 month left" / „3 days left" / „about 17 hours left" -> zile. */
function daysLeft(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*(hour|day|month|minute)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return { minute: 0, hour: n / 24, day: n, month: n * 30 }[m[2].toLowerCase()] ?? null;
}

async function listHackathons(maxPages = 5) {
  const out = [];
  const seen = new Set();
  for (let p = 1; p <= maxPages; p++) {
    const url =
      'https://devpost.com/api/hackathons?status%5B%5D=open' +
      `&challenge_type%5B%5D=online&order_by=deadline&page=${p}`;
    let json;
    try {
      json = JSON.parse(await get(url));
    } catch (e) {
      console.error(`  pagina ${p} a eșuat: ${e.message}`);
      break;
    }
    const items = json.hackathons ?? [];
    if (!items.length) break;
    for (const h of items) if (!seen.has(h.id)) (seen.add(h.id), out.push(h));
    await sleep(1200); // politicos: nu tragem mai repede decât un om care dă scroll
  }
  return out;
}

// ── Verdicte ────────────────────────────────────────────────────────────────

const no = (reason, detail) => ({ verdict: 'skip', reason, detail: detail ?? null });

/** Filtre ieftine: doar pe datele din listare, fără nicio cerere în plus. */
function cheapCheck(h) {
  const cash = h.prizes_counts?.cash ?? 0;
  if (!cash) return no('fără premiu în bani');

  const prize = money(h.prize_amount);
  if (prize < RULES.MIN_PRIZE_USD) return no('premiu prea mic', `$${prize}`);

  const d = daysLeft(h.time_left_to_submission);
  if (d === null) return no('termen necunoscut');
  if (d < RULES.MIN_DAYS_LEFT) return no('prea puțin timp de construit', `${h.time_left_to_submission}`);
  if (d > RULES.MAX_DAYS_LEFT) return no('termen prea îndepărtat', `${Math.round(d)} zile`);

  const perSlot = Math.round((h.registrations_count ?? 0) / cash);
  if (perSlot > RULES.MAX_PARTICIPANTS_PER_SLOT)
    return no('prea aglomerat', `${perSlot} înscriși pe loc de premiu`);

  return { verdict: 'maybe', prize, cash, days: d, perSlot };
}

/** Filtrul scump: citește regulamentul. Rulează doar pe ce a trecut de cel ieftin. */
async function deepCheck(h) {
  const base = h.url.replace(/\/$/, '');
  let text = '';
  for (const path of ['/rules', '']) {
    try {
      text += ' ' + toText(await get(base + path));
    } catch {
      /* o pagină lipsă nu invalidează cealaltă */
    }
    await sleep(900);
  }
  if (text.trim().length < 400) return no('regulament necitibil');

  // Ordinea contează. Verificăm întâi banii, pentru că e semnalul cel mai greu de
  // falsificat: e citat din regulamentul care obligă juridic organizatorul. Dacă
  // premiul nu e în bani, restul verificărilor sunt irelevante — și, mai important,
  // motivul respinerii rămâne cel adevărat în loc să fie mascat de un blocaj mai slab.
  for (const f of FAKE_CASH) if (f.re.test(text)) return no('premiul nu e în bani', f.why);

  const overridden = STUDENT_TAG_OVERRIDE.test(text);
  for (const b of BLOCKERS) {
    if (!b.re.test(text)) continue;
    // Eticheta „doar studenți" cade dacă organizatorul o infirmă explicit. Celelalte
    // blocaje (rezidență SUA etc.) nu se negociază cu o formulare de marketing.
    if (b.students && overridden) continue;
    return no('participare restricționată', b.why);
  }

  // Lista de excluderi de țări e scrisă în proză, nu structurat. Căutăm țara noastră
  // doar în vecinătatea cuvintelor de excludere, altfel „Romania" dintr-un exemplu
  // oarecare din regulament ar produce un fals pozitiv.
  const zones = text.match(/(excluded|not (available|eligible|open)|prohibited|void in|residents of)[^.]{0,400}/gi) ?? [];
  for (const z of zones) if (HOME_COUNTRY.test(z)) return no('țara noastră e exclusă', z.slice(0, 90));

  return { verdict: 'ok', objective: OBJECTIVE.test(text) };
}

/**
 * Scor = valoare așteptată, nu mărimea premiului.
 *
 * Greșeala pe care am făcut-o deja o dată la radarul de joburi: am pus în frunte
 * bugetul cel mai mare, care era exact cel cu cea mai multă concurență. Aici,
 * un premiu de $40.000 împărțit la 5.841 de înscriși pentru un singur loc valorează
 * mai puțin decât $800 în 7 locuri cu 218 înscriși. Formula spune asta direct.
 */
function score({ prize, cash, perSlot, days, objective }) {
  const ev = (prize * cash) / Math.max(1, perSlot * cash); // ≈ premiu / înscriși-pe-loc
  // Evaluarea obiectivă valorează dublu: e singurul tip de competiție unde nu
  // pierdem pentru că n-avem reputație sau audiență.
  const fairness = objective ? 2 : 1;
  // Termenele foarte scurte reduc calitatea a ce pot livra.
  const room = days >= 7 ? 1 : 0.6;
  return Math.round(ev * fairness * room);
}

// ── Rulare ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Radar competiții — caut plată din muncă evaluată, nu din persuasiune.\n');

  const all = await listHackathons();
  console.log(`${all.length} competiții online deschise.\n`);

  const results = [];
  let deep = 0;

  for (const h of all) {
    const cheap = cheapCheck(h);
    if (cheap.verdict === 'skip') {
      results.push({ ...cheap, title: h.title, url: h.url });
      continue;
    }
    deep++;
    const d = await deepCheck(h);
    if (d.verdict === 'skip') {
      results.push({ ...d, title: h.title, url: h.url });
      continue;
    }
    const s = score({ ...cheap, objective: d.objective });
    results.push({
      verdict: 'accept',
      title: h.title,
      url: h.url,
      score: s,
      prize_usd: cheap.prize,
      slots: cheap.cash,
      participants: h.registrations_count ?? 0,
      per_slot: cheap.perSlot,
      days_left: Math.round(cheap.days),
      objective: d.objective,
      organizer: h.organization_name ?? null,
    });
  }

  const accepted = results.filter((r) => r.verdict === 'accept').sort((a, b) => b.score - a.score);
  const rejected = results.filter((r) => r.verdict !== 'accept');

  console.log(`${all.length} scanate -> ${deep} au trecut filtrele ieftine -> ${accepted.length} au trecut regulamentul.\n`);

  for (const a of accepted) {
    console.log(
      `  ${String(a.score).padStart(5)} | $${a.prize_usd} în ${a.slots} locuri | ` +
        `${a.per_slot} înscriși/loc | ${a.days_left}z | ` +
        `${a.objective ? 'OBIECTIV' : 'jurizat'} | ${a.title}`,
    );
    console.log(`        ${a.url}`);
  }

  const tally = {};
  for (const r of rejected) tally[r.reason] = (tally[r.reason] || 0) + 1;
  console.log('\n  Respinse, pe motiv:');
  for (const [reason, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(3)} × ${reason}`);

  // Păstrăm oportunitățile din alte scouturi; le înlocuim doar pe ale noastre.
  const others = readOpps().filter((o) => o.source !== 'comp-radar');
  writeOpps([
    ...others,
    ...results.map((r) => ({
      source: 'comp-radar',
      verdict: r.verdict,
      reason: r.reason ?? null,
      title: r.title,
      url: r.url,
      score: r.score ?? 0,
      prize_usd: r.prize_usd ?? 0,
      days_left: r.days_left ?? null,
      objective: r.objective ?? false,
    })),
  ]);

  append({
    type: 'action',
    track: 'competitions',
    desc:
      `Radar competiții: ${all.length} scanate, ${accepted.length} eligibile după citirea ` +
      `regulamentelor (${rejected.length} respinse — premii false, restricții de participare, aglomerație).`,
    evidence: 'scouts/comp-radar.mjs',
    agent: 'comp-radar',
  });
  rebuildState();
}

if (process.argv[1] && process.argv[1].endsWith('comp-radar.mjs')) {
  main().catch((e) => {
    console.error('Radarul a eșuat:', e.message);
    process.exit(1);
  });
}
