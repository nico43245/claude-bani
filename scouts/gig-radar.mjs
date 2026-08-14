#!/usr/bin/env node
// Radar de joburi — proiecte freelance REALE, cu buget afișat.
//
// De ce există: spre deosebire de Fiverr, unde stai și aștepți să te găsească
// cineva, aici clientul și-a postat deja nevoia ȘI bugetul. Măsurat pe
// 14 aug 2026, o singură pagină de categorie avea 50 de proiecte live, dintre
// care mai multe peste $100 — adică ținta atinsă dintr-un singur job.
//
// Al doilea rol, la fel de important: FILTRUL ETIC. O parte din cererea de pe
// aceste platforme e muncă pe care nu o fac — rezolvare de CAPTCHA, automatizări
// care încalcă termenii rețelelor sociale, fraudă academică, recenzii false.
// Fără filtru, radarul mi-ar servi zilnic joburi pe care trebuie să le refuz.
//
// Fără LLM, fără dependențe, cost zero.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, append, rebuildState } from './lib/ledger.mjs';

const OUT_PATH = join(ROOT, 'data', 'gigs.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOURCES = [
  { site: 'freelancer', url: 'https://www.freelancer.com/jobs/web-scraping/' },
  { site: 'freelancer', url: 'https://www.freelancer.com/jobs/data-mining/' },
  { site: 'freelancer', url: 'https://www.freelancer.com/jobs/python/' },
  { site: 'freelancer', url: 'https://www.freelancer.com/jobs/excel/' },
  { site: 'freelancer', url: 'https://www.freelancer.com/jobs/data-processing/' },
  { site: 'guru', url: 'https://www.guru.com/d/jobs/skill/web-scraping/' },
  { site: 'guru', url: 'https://www.guru.com/d/jobs/skill/data-entry/' },
  { site: 'guru', url: 'https://www.guru.com/d/jobs/skill/python/' },
];

// ─────────────────────────────────────────────────────────────────────────────
// FILTRUL ETIC — muncă pe care nu o fac, indiferent de buget.
// Fiecare tipar are un motiv, nu e o listă de cuvinte interzise la întâmplare.
// ─────────────────────────────────────────────────────────────────────────────

const REFUSE = [
  { re: /captcha/i, why: 'rezolvare/ocolire de CAPTCHA' },
  { re: /bypass.{0,20}(bot|cloudflare|detection|protection)|anti.?bot.{0,15}bypass/i, why: 'ocolirea protecției anti-bot' },
  { re: /linkedin.{0,30}(automation|bot|connection|messaging|scrap)/i, why: 'automatizare LinkedIn — încalcă termenii platformei' },
  { re: /(instagram|facebook|tiktok|twitter|x\.com).{0,30}(bot|automation|mass|auto|scrap|lead|harvest|engagement)/i, why: 'extragere din rețele sociale — încalcă termenii platformei' },
  // Liste masive de contacte personale: GDPR, și aproape întotdeauna alimentează spam.
  { re: /\b\d[\d,.]*\s*(k|m|million|thousand)?\+?\s*(b2b|b2c)?\s*leads?\b|\bleads? (list|database|scrap)/i, why: 'listă masivă de date personale — GDPR și spam' },
  { re: /(fake|buy).{0,15}(review|account|follower|like|upvote|vote)/i, why: 'recenzii sau interacțiuni false' },
  { re: /(quiz|exam|homework|assignment|test).{0,20}(taking|solver|automation|bot)|take my (exam|quiz|class)/i, why: 'fraudă academică' },
  { re: /(bulk|mass).{0,15}(email|dm|message|sms)|email.{0,10}(blast|spam)|cold.?dm.{0,10}bot/i, why: 'spam în masă' },
  { re: /\b(otp|2fa)\b.{0,20}(bypass|bot)|sim.?swap/i, why: 'ocolirea autentificării' },
  { re: /scrap.{0,30}(behind|past).{0,15}(login|paywall)|credential.{0,10}stuff/i, why: 'acces în spatele autentificării' },
  { re: /\b(betting|gambling|casino).{0,20}(bot|automation)|trading bot/i, why: 'automatizare financiară sau de pariuri' },
  // Ratat inițial: cererea sună pur tehnic („extract the source code"), fără
  // niciun cuvânt suspect. Semnalul real e că sursa e DESCRISĂ ca ascunsă,
  // protejată sau invite-only — adică ceva ce autorul a închis intenționat.
  { re: /(hidden|protected|obfuscated|encrypted|invite.?only|closed).{0,40}(source|script|code|indicator)|(decompile|deobfuscate|reverse.?engineer).{0,25}(script|code|app|indicator)/i,
    why: 'extragerea codului sursă protejat al altcuiva — proprietate intelectuală' },
  { re: /\b(crack|keygen|license bypass|nulled|pirated)\b/i, why: 'piraterie software' },
  { re: /\bdark ?web\b|\btor\b.{0,20}(scrap|crawl|audit)/i, why: 'zonă dark web' },
];

// Semnalează, nu respinge automat — cer judecată de la caz la caz.
const FLAG = [
  { re: /(phone|email|contact).{0,20}(extract|scrap|harvest|list)|lead.{0,10}(list|generation)/i, why: 'date personale — verifică GDPR și sursa' },
  { re: /\b(resume|cv|candidate|profile).{0,20}(scrap|extract)/i, why: 'date personale de candidați' },
];

// Cât de bine se potrivește cu ce livrez efectiv.
const FIT = [
  { re: /\b(scrap|crawl|extract|parse)/i, w: 3 },
  { re: /\b(python|node|javascript|script|automat)/i, w: 3 },
  { re: /\b(csv|excel|spreadsheet|google sheets|json|database)/i, w: 2 },
  { re: /\bapi\b|integration/i, w: 2 },
  { re: /\b(dashboard|report|clean|process)/i, w: 1 },
];

// Semne că jobul e prost plătit sau muncă manuală, nu inginerie.
const PENALTY = [
  { re: /\bdata entry\b|\btyping\b|copy.?paste|manual/i, w: -3 },
  { re: /\b(fresher|trainee|intern)\b/i, w: -3 },
  { re: /\bhindi\b|\burgent(ly)? need\b/i, w: -1 },
];

// ─────────────────────────────────────────────────────────────────────────────

const strip = (s) => decodeEnt(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function decodeEnt(s) {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (m, c) => {
    if (map[c] !== undefined) return map[c];
    if (/^#x/i.test(c)) return String.fromCharCode(parseInt(c.slice(2), 16));
    if (/^#/.test(c)) return String.fromCharCode(parseInt(c.slice(1), 10));
    return ' ';
  });
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseFreelancer(html) {
  // Atributele nu vin într-o ordine garantată (href poate precede class), deci
  // prindem tot tagul <a> și extragem href separat. Un parser care presupune
  // ordinea atributelor întoarce tăcut zero rezultate la prima schimbare de markup.
  const titles = [...html.matchAll(/<a([^>]*JobSearchCard-primary-heading-link[^>]*)>(.*?)<\/a>/gs)]
    .map((m) => {
      const href = /href="([^"]*)"/.exec(m[1]);
      return href ? [m[0], href[1], m[2]] : null;
    })
    .filter(Boolean);
  const budgets = [...html.matchAll(/class="[^"]*JobSearchCard-primary-price[^"]*"[^>]*>(.*?)<\/div>/gs)];
  const descs = [...html.matchAll(/class="[^"]*JobSearchCard-primary-description[^"]*"[^>]*>(.*?)<\/p>/gs)];
  // Numărul de oferte e semnalul de concurență cel mai important, și lipsea.
  // Un job de $250 cu 151 de oferte are șanse sub 1% pentru un cont fără
  // recenzii — bugetul mare atrage mulțimea, deci se anulează singur.
  const bids = [...html.matchAll(/class="[^"]*JobSearchCard-secondary-entry[^"]*"[^>]*>\s*([\d,]+)\s*bids?/gsi)];
  return titles.map((t, i) => ({
    title: strip(t[2]),
    url: 'https://www.freelancer.com' + t[1],
    budget_raw: strip(budgets[i]?.[1] || ''),
    desc: strip(descs[i]?.[1] || '').slice(0, 300),
    bids: bids[i] ? parseInt(bids[i][1].replace(/,/g, ''), 10) : null,
  }));
}

function parseGuru(html) {
  const rows = [...html.matchAll(/class="[^"]*jobRecord__title[^"]*"[^>]*>\s*(?:<a[^>]*href="([^"]*)"[^>]*>)?(.*?)<\/(?:a|h2|div)>/gs)];
  const budgets = [...html.matchAll(/class="[^"]*jobRecord__budget[^"]*"[^>]*>(.*?)<\/div>/gs)];
  return rows.map((r, i) => ({
    title: strip(r[2]),
    url: r[1] ? (r[1].startsWith('http') ? r[1] : 'https://www.guru.com' + r[1]) : 'https://www.guru.com/d/jobs/',
    budget_raw: strip(budgets[i]?.[1] || ''),
    desc: '',
  })).filter((x) => x.title.length > 6);
}

/** „$176" -> 176 fix; „$22 / hr" -> tarif orar. */
function parseBudget(raw) {
  if (!raw) return { usd: null, hourly: false };
  const hourly = /\/\s*hr|per hour|hourly/i.test(raw);
  const nums = [...raw.matchAll(/([\d,]+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1].replace(/,/g, '')));
  if (!nums.length) return { usd: null, hourly };
  // Intervalele („$30 - $250") se evaluează la capătul de jos: e ce iei realist.
  return { usd: Math.min(...nums), hourly };
}

function judge(job) {
  const text = `${job.title} ${job.desc}`;

  for (const r of REFUSE) if (r.re.test(text)) return { verdict: 'refuse', reason: r.why };

  const flags = FLAG.filter((f) => f.re.test(text)).map((f) => f.why);

  let fit = 0;
  for (const f of FIT) if (f.re.test(text)) fit += f.w;
  for (const p of PENALTY) if (p.re.test(text)) fit += p.w;
  if (fit <= 0) return { verdict: 'skip', reason: 'nu se potrivește cu ce livrez', fit };

  const { usd, hourly } = parseBudget(job.budget_raw);
  if (usd === null) return { verdict: 'skip', reason: 'fără buget afișat', fit };
  // Sub $40 nu merită: costul unei livrări bune e același, iar o recenzie
  // proastă de la un client de $15 face mai mult rău decât banii câștigați.
  if (!hourly && usd < 40) return { verdict: 'skip', reason: 'buget prea mic', fit, usd };

  // Scorul e condus de POTRIVIRE, nu de buget — și asta e deliberat.
  // Un proiect de $13.000 e fantezie pentru un cont cu zero recenzii: clientul
  // alege pe cineva cu 200 de evaluări. Ținta reală e banda $80-500, unde
  // bugetul e destul de mare cât să conteze și destul de mic cât să nu atragă
  // agenții consacrate. Peste $600, șansele scad brusc, nu cresc.
  // Peste 40 de oferte cursa e pierdută pentru un cont fără recenzii, indiferent
  // cât de bună e propunerea. Cu 6 licitări pe lună, fiecare irosită doare.
  if (job.bids !== null && job.bids > 40)
    return { verdict: 'skip', reason: `prea multe oferte (${job.bids})`, fit, usd };

  const value = hourly ? usd * 8 : usd;
  const reachable = value <= 600 ? 1 : 600 / value;   // penalizare pentru fantezii
  const sweetSpot = value >= 80 && value <= 500 ? 1.3 : 1;
  // Puține oferte contează mai mult decât un buget mare: bugetul mare atrage
  // mulțimea care îl anulează. Un job de $120 cu 4 oferte bate unul de $400 cu 130.
  const crowding = job.bids === null ? 0.6 : Math.max(0.15, 1 - job.bids / 40);
  const score = Math.round(fit * fit * Math.min(value, 600) * reachable * sweetSpot * crowding / 10);
  return { verdict: 'accept', fit, usd, hourly, bids: job.bids, flags, score };
}

async function main() {
  const jobs = [];
  const seen = new Set();

  for (const src of SOURCES) {
    try {
      const html = await get(src.url);
      const parsed = src.site === 'freelancer' ? parseFreelancer(html) : parseGuru(html);
      for (const j of parsed) {
        const key = j.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push({ ...j, site: src.site });
      }
      console.log(`  ${src.site} ${src.url.split('/').filter(Boolean).pop()} → ${parsed.length}`);
    } catch (e) {
      console.error(`  ${src.url}: ${e.message}`);
    }
    await sleep(1500);
  }

  const results = jobs.map((j) => ({ ...j, ...judge(j) }));
  const accepted = results.filter((r) => r.verdict === 'accept').sort((a, b) => b.score - a.score);
  const refused = results.filter((r) => r.verdict === 'refuse');

  writeFileSync(OUT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    scanned: results.length,
    accepted: accepted.length,
    refused_on_ethics: refused.length,
    jobs: accepted.slice(0, 40),
    refused: refused.map((r) => ({ title: r.title, reason: r.reason })),
  }, null, 2) + '\n');

  append({
    type: 'action',
    track: 'freelance',
    desc: `Radar joburi: ${results.length} proiecte scanate → ${accepted.length} potrivite, ` +
          `${refused.length} refuzate pe motive etice`,
    agent: 'gig-radar',
  });
  if (accepted.length) {
    append({
      type: 'opportunity',
      track: 'freelance',
      amount_usd: accepted[0].usd,
      desc: `Cel mai bun job: ${accepted[0].title.slice(0, 80)}`,
      evidence: accepted[0].url,
      agent: 'gig-radar',
    });
  }
  rebuildState();

  console.log(`\n=== POTRIVITE (${accepted.length}) ===`);
  for (const a of accepted.slice(0, 15))
    console.log(`  $${String(a.usd).padStart(5)}${a.hourly ? '/h' : '  '} | fit ${a.fit} | ${a.title.slice(0, 58)}` +
      (a.flags?.length ? `\n        ⚠ ${a.flags.join('; ')}` : ''));

  console.log(`\n=== REFUZATE PE ETICĂ (${refused.length}) ===`);
  for (const r of refused) console.log(`  ${r.reason} — ${r.title.slice(0, 52)}`);
}

if (process.argv[1] && process.argv[1].endsWith('gig-radar.mjs')) {
  main().catch((e) => { console.error('Radar joburi eșuat:', e.message); process.exit(1); });
}

export { judge, parseBudget, REFUSE };
