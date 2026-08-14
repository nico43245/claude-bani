#!/usr/bin/env node
// Market scout — adună DOVEZI de cerere reală, nu opinii.
//
// Două motoare, pentru că măsoară lucruri diferite:
//
//   1. HN (stories + comments) → DUREREA: oameni care spun explicit că ar plăti
//      pentru ceva sau că un lucru îi enervează. Bogat în context, sărac în
//      volum, și înclinat spre programatori.
//
//   2. Google Suggest → CEREREA DE CĂUTARE: ce tastează oamenii efectiv. Ăsta e
//      semnalul care contează cel mai mult aici, fiindcă fără audiență singurul
//      canal care funcționează e cel unde cumpărătorul caută deja singur.
//      Autocomplete-ul e un proxy direct pentru volum real de căutare.
//
// Fără LLM: scriptul colectează și grupează, judecata o fac eu în sesiune.
// Surse testate ca gratuite și fără cont: HN Algolia, Google Suggest, npm.
// Reddit blochează accesul neautentificat — nu-l folosim.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, append, rebuildState } from './lib/ledger.mjs';

const OUT_PATH = join(ROOT, 'data', 'market-signals.json');
const HN = 'https://hn.algolia.com/api/v1/search';
const SUGGEST = 'https://suggestqueries.google.com/complete/search';

const MONTHS_BACK = 24;
const MIN_ENGAGEMENT = 4;

/** Fraze prin care oamenii își exprimă disponibilitatea de a plăti sau golul. */
const DEMAND_QUERIES = [
  '"would pay for"', '"I would pay"', '"take my money"', '"is there a tool"',
  '"looking for a tool"', '"I wish there was"', '"does anyone know a tool"',
  '"why is there no"', '"tired of doing"', '"hate having to"',
  '"spend hours"', '"there should be"',
];

/**
 * Semințe cu intenție comercială: fraze după care oamenii caută un artefact
 * pe care îl pot cumpăra și descărca imediat. Alese ca să acopere marketplace-uri
 * cu trafic de căutare propriu (Etsy, Gumroad) și căutare generică.
 */
const SEARCH_SEEDS = [
  'notion template for', 'excel template for', 'google sheets template for',
  'spreadsheet to track', 'printable planner for', 'checklist for',
  'tracker template for', 'budget template for', 'how do i keep track of',
  'best spreadsheet for', 'template to manage', 'planner for small business',
];

const STOP = new Set(`the a an and or but for of to in on at is are was were be been being with
from by as it its this that these those i you we they he she my your our their what which who
how why when where do does did doing done have has had can could would should will shall may
might must not no yes if then than so such very more most much many few some any all each
every other another new old good bad best better great about into over under again once here
there just now only own same too also s t don ll ve re m d pay money tool tools thing things
stuff want need make made get got use used using like really actually people someone anyone
something anything ask show hn tell else way ways lot template templates free online
one two three take took think thought because having had been still even though while
know knew see saw come came go went say said look looking find found try tried work works
working keep kept let lets give given put set run running turn done well right sure yes
actually probably maybe basically pretty quite always never often sometimes ever back down
out off up around through after before between own end start first last long time times
day days year years lot lots bit little big small great real true full whole part parts
thanks thank please sorry hey yeah nope lol imo iirc etc via per`.split(/\s+/));

/** HN întoarce entități HTML în comentarii; fără decodare, topul temelor e ocupat
 *  de `x27` (apostrof) și `quot` în loc de cuvinte reale. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x27': "'", '#x2F': '/', '#x2f': '/', '#39': "'", '#47': '/' };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (m, code) => {
    if (ENTITIES[code] !== undefined) return ENTITIES[code];
    if (/^#x/i.test(code)) return String.fromCharCode(parseInt(code.slice(2), 16));
    if (/^#/.test(code)) return String.fromCharCode(parseInt(code.slice(1), 10));
    return ' ';
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Motor 1: durerea exprimată (HN) ─────────────────────────────────────────

async function hnSearch(query, tags, page = 0) {
  const cutoff = Math.floor(Date.now() / 1000) - MONTHS_BACK * 30 * 86400;
  const url = new URL(HN);
  url.searchParams.set('query', query);
  url.searchParams.set('tags', tags);
  url.searchParams.set('hitsPerPage', '100');
  url.searchParams.set('page', String(page));
  url.searchParams.set('numericFilters', `created_at_i>${cutoff}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'claude-bani/1.0' } });
  if (!res.ok) throw new Error(`HN ${res.status}`);
  return res.json();
}

async function collectPain() {
  const seen = new Set();
  const signals = [];
  for (const q of DEMAND_QUERIES) {
    // Comentariile sunt de ~25× mai numeroase decât titlurile și acolo stă
    // descrierea concretă a durerii, nu doar subiectul.
    for (const tags of ['story', 'comment']) {
      let data;
      try {
        data = await hnSearch(q, tags);
      } catch (e) {
        console.error(`  HN «${q}» (${tags}): ${e.message}`);
        continue;
      }
      for (const h of data.hits || []) {
        const engagement = (h.points || 0) + (h.num_comments || 0);
        const text = h.title || h.comment_text || h.story_title || '';
        if (!text) continue;
        if (tags === 'story' && engagement < MIN_ENGAGEMENT) continue;
        const url = `https://news.ycombinator.com/item?id=${h.objectID}`;
        if (seen.has(url)) continue;
        seen.add(url);
        signals.push({
          kind: tags,
          text: decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 400),
          url,
          engagement,
          date: (h.created_at || '').slice(0, 10),
          query: q,
        });
      }
      await sleep(300);
    }
  }
  return signals;
}

// ─── Motor 2: cererea de căutare (Google Suggest) ────────────────────────────

async function suggest(q) {
  const url = new URL(SUGGEST);
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('q', q);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

/**
 * Extinde fiecare sămânță în două straturi. Stratul 2 contează cel mai mult:
 * cu cât o interogare se ramifică mai mult, cu atât e o venă mai bogată — și
 * cozile lungi au concurență SEO mai mică, exact ce trebuie fără audiență.
 */
async function collectSearchDemand() {
  const rows = [];
  const seenQ = new Set();
  for (const seed of SEARCH_SEEDS) {
    const lvl1 = await suggest(seed);
    await sleep(250);
    for (const s of lvl1.slice(0, 8)) {
      if (seenQ.has(s)) continue;
      seenQ.add(s);
      const lvl2 = await suggest(s + ' ');
      await sleep(250);
      rows.push({ seed, query: s, branches: lvl2.length, children: lvl2.slice(0, 10) });
    }
  }
  return rows;
}

// ─── Grupare ─────────────────────────────────────────────────────────────────

function words(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || []).filter(
    (w) => !STOP.has(w) && w.length > 2,
  );
}

/** Ce subiecte apar repetat în cererea de căutare, peste semințe diferite. */
function clusterSearch(rows) {
  const m = new Map();
  for (const r of rows) {
    const all = [r.query, ...r.children];
    for (const w of new Set(all.flatMap(words))) {
      const t = m.get(w) || { subject: w, queries: 0, branches: 0, seeds: new Set(), examples: [] };
      t.queries += 1;
      t.branches += r.branches;
      t.seeds.add(r.seed);
      if (t.examples.length < 5) t.examples.push(r.query);
      m.set(w, t);
    }
  }
  return [...m.values()]
    .filter((t) => t.queries >= 3)
    .map((t) => ({
      subject: t.subject,
      queries: t.queries,
      // Cerere care apare sub semințe DIFERITE = nevoie largă, nu nișă de nișă.
      seed_spread: t.seeds.size,
      avg_branches: Math.round((t.branches / t.queries) * 10) / 10,
      examples: t.examples,
      score: Math.round(t.queries * t.seeds.size * Math.log2(2 + t.branches / t.queries)),
    }))
    .sort((a, b) => b.score - a.score);
}

function clusterPain(signals) {
  const m = new Map();
  for (const s of signals) {
    for (const w of new Set(words(s.text))) {
      const t = m.get(w) || { theme: w, mentions: 0, engagement: 0, evidence: [] };
      t.mentions += 1;
      t.engagement += s.engagement;
      if (t.evidence.length < 4) t.evidence.push({ text: s.text.slice(0, 160), url: s.url, date: s.date });
      m.set(w, t);
    }
  }
  return [...m.values()]
    .filter((t) => t.mentions >= 4)
    .map((t) => ({ ...t, score: Math.round(t.mentions * Math.log2(2 + t.engagement / t.mentions)) }))
    .sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Motor 1/2 — durerea exprimată (Hacker News)…');
  const pain = await collectPain();
  const painThemes = clusterPain(pain);
  console.log(`  ${pain.length} semnale, ${painThemes.length} teme\n`);

  console.log('Motor 2/2 — cererea de căutare (Google Suggest)…');
  const search = await collectSearchDemand();
  const searchThemes = clusterSearch(search);
  console.log(`  ${search.length} interogări reale, ${searchThemes.length} subiecte\n`);

  const out = {
    generated_at: new Date().toISOString(),
    sources: ['Hacker News (Algolia)', 'Google Suggest'],
    window_months: MONTHS_BACK,
    pain: {
      signals_total: pain.length,
      themes: painThemes.slice(0, 30),
      loudest: [...pain].filter((s) => s.kind === 'story').sort((a, b) => b.engagement - a.engagement).slice(0, 20),
    },
    search_demand: {
      queries_total: search.length,
      subjects: searchThemes.slice(0, 40),
      richest_veins: [...search].sort((a, b) => b.branches - a.branches).slice(0, 25),
    },
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

  append({
    type: 'action',
    track: 'product',
    desc:
      `Scout de piață: ${pain.length} semnale de durere (HN) + ${search.length} interogări de căutare ` +
      `(Google Suggest) → ${searchThemes.length} subiecte cu cerere repetată`,
    agent: 'market-signals',
  });
  rebuildState();

  console.log('=== SUBIECTE CU CERERE DE CĂUTARE (ce tastează oamenii) ===');
  for (const t of searchThemes.slice(0, 18))
    console.log(`  ${String(t.score).padStart(4)} | ${t.queries}q × ${t.seed_spread} semințe | ${t.subject}`);

  console.log('\n=== VENE BOGATE (interogări care se ramifică mult) ===');
  for (const v of out.search_demand.richest_veins.slice(0, 12))
    console.log(`  ${String(v.branches).padStart(3)} ramuri | ${v.query}`);

  console.log('\n=== DURERE EXPRIMATĂ (teme HN) ===');
  for (const t of painThemes.slice(0, 12))
    console.log(`  ${String(t.score).padStart(4)} | ${String(t.mentions).padStart(3)} mențiuni | ${t.theme}`);
}

if (process.argv[1] && process.argv[1].endsWith('market-signals.mjs')) {
  main().catch((e) => {
    console.error('Scout eșuat:', e.message);
    process.exit(1);
  });
}

export { clusterPain, clusterSearch, words };
