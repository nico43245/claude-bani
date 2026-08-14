#!/usr/bin/env node
// Găsitor de goluri — caută nișe cu CERERE mare și OFERTĂ slabă.
//
// De ce există: volumul brut de căutări e cea mai comună capcană. Măsurat pe
// 14 aug 2026, „budget spreadsheet" avea semnal de cerere maxim (10/10 sugestii)
// și fix de aceea era nevandabil: pe Gumroad 33 din 36 de produse aveau sub 5
// recenzii, iar pe Etsy 26 din ~62 de rezultate erau reclame plătite. Cererea
// mare atrage ofertă mare; golul e acolo unde cele două NU se potrivesc.
//
// Scriptul acoperă partea automatizabilă: generează cozi lungi și le măsoară
// cererea. Oferta se verifică în browser (Etsy blochează accesul programatic
// cu 403), pe lista scurtă pe care o produce scriptul — un pas manual pe zece
// candidați, nu pe o mie.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, append, rebuildState } from './lib/ledger.mjs';

const OUT_PATH = join(ROOT, 'data', 'niche-gaps.json');
const SUGGEST = 'https://suggestqueries.google.com/complete/search';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Tipare de artefact + domenii de viață. Combinația lor generează cozi lungi
 * specifice, unde concurența e mult mai mică decât pe termenul-umbrelă.
 */
const ARTIFACTS = [
  'spreadsheet to track',
  'excel template for',
  'google sheets template for',
  'checklist for',
  'planner for',
  'tracker for',
  'calculator for',
];

const DOMAINS = [
  'rental property', 'small business', 'freelance', 'wedding', 'home renovation',
  'inventory', 'nonprofit', 'restaurant', 'trucking', 'construction', 'farm',
  'airbnb', 'church', 'daycare', 'gym', 'salon', 'photography business',
  'etsy shop', 'food truck', 'landscaping', 'cleaning business', 'tutoring',
];

async function suggest(q) {
  const url = new URL(SUGGEST);
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('q', q);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d?.[1]) ? d[1] : [];
  } catch {
    return [];
  }
}

async function main() {
  const rows = [];
  console.log(`Sondez ${ARTIFACTS.length} × ${DOMAINS.length} = ${ARTIFACTS.length * DOMAINS.length} combinații…\n`);

  for (const a of ARTIFACTS) {
    for (const d of DOMAINS) {
      const q = `${a} ${d}`;
      const s = await suggest(q);
      await sleep(220);
      // Zero sugestii = nimeni nu caută asta. Nu e nișă, e vid: verificat pe
      // „spreadsheet to track freelance", care întoarce 0.
      if (s.length === 0) continue;
      rows.push({
        query: q,
        artifact: a,
        domain: d,
        demand: s.length,
        variants: s.slice(0, 10),
      });
    }
    console.log(`  ${a} … ${rows.filter((r) => r.artifact === a).length} cu cerere`);
  }

  // Cererea singură nu e suficientă. Sortăm după cerere, dar marcăm explicit
  // că verdictul are nevoie de verificarea ofertei — altfel repetăm capcana.
  const ranked = rows.sort((a, b) => b.demand - a.demand);
  const shortlist = ranked.slice(0, 20).map((r) => ({
    ...r,
    supply_checked: false,
    verdict: 'necesită verificarea ofertei pe Etsy',
  }));

  const out = {
    generated_at: new Date().toISOString(),
    method: 'Google Suggest — cerere; oferta se verifică manual în browser (Etsy blochează scriptarea)',
    combinations_probed: ARTIFACTS.length * DOMAINS.length,
    with_demand: rows.length,
    shortlist,
    all: ranked,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

  append({
    type: 'action',
    track: 'product',
    desc: `Găsitor de goluri: ${ARTIFACTS.length * DOMAINS.length} combinații sondate, ${rows.length} cu cerere reală, top 20 pe lista scurtă`,
    agent: 'niche-gaps',
  });
  rebuildState();

  console.log(`\n=== LISTA SCURTĂ (cerere confirmată, ofertă neverificată) ===`);
  for (const r of shortlist)
    console.log(`  ${String(r.demand).padStart(2)} sugestii | ${r.query}`);
  console.log(`\nUrmătorul pas: verificat oferta pe Etsy pentru cele de mai sus.`);
}

if (process.argv[1] && process.argv[1].endsWith('niche-gaps.mjs')) {
  main().catch((e) => {
    console.error('Găsitor eșuat:', e.message);
    process.exit(1);
  });
}
