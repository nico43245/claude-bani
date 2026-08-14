// Ledger append-only — sursa unică de adevăr pentru tot ce arată dashboard-ul.
//
// De ce append-only: orice afirmație pe care o fac despre bani sau progres trebuie
// să fie auditabilă retroactiv. Nu se rescrie și nu se șterge nimic — nici eșecurile.
// Dacă o pistă moare, rămâne în ledger ca `dead_end`, vizibilă la fel ca reușitele.

import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LEDGER_PATH = join(ROOT, 'data', 'ledger.jsonl');
export const OPPS_PATH = join(ROOT, 'data', 'opportunities.jsonl');
export const STATE_PATH = join(ROOT, 'data', 'state.json');

export const GOAL_USD = 100;

/** Tipuri de eveniment. `revenue` și `cost` mișcă bani; restul e trasabilitate. */
export const TYPES = ['revenue', 'cost', 'action', 'decision', 'opportunity', 'dead_end'];

/**
 * Adaugă un eveniment în ledger. Singura cale prin care ceva ajunge pe dashboard.
 * @param {{type:string, track?:string, amount_usd?:number, status?:string,
 *          desc:string, evidence?:string|null, agent?:string}} ev
 */
export function append(ev) {
  if (!TYPES.includes(ev.type)) throw new Error(`tip necunoscut: ${ev.type}`);
  if (!ev.desc) throw new Error('desc e obligatoriu — un eveniment fără explicație e inutil');

  const row = {
    ts: new Date().toISOString(),
    type: ev.type,
    track: ev.track ?? 'infra',
    amount_usd: Number(ev.amount_usd ?? 0),
    // Doar `revenue` are stare: banii promiși nu sunt bani încasați și nu se
    // amestecă niciodată în aceeași cifră pe dashboard.
    status: ev.type === 'revenue' ? (ev.status ?? 'pending') : null,
    desc: ev.desc,
    evidence: ev.evidence ?? null,
    agent: ev.agent ?? 'manual',
  };
  appendFileSync(LEDGER_PATH, JSON.stringify(row) + '\n');
  return row;
}

/** Citește ledger-ul, ignorând liniile corupte (un cron nu moare dintr-o linie stricată). */
export function readLedger() {
  if (!existsSync(LEDGER_PATH)) return [];
  const rows = [];
  for (const line of readFileSync(LEDGER_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      // linie coruptă — o sărim, nu oprim rularea
    }
  }
  return rows;
}

/** Citește oportunitățile (bounty-uri validate + idei de produs). */
export function readOpps() {
  if (!existsSync(OPPS_PATH)) return [];
  const out = [];
  for (const line of readFileSync(OPPS_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* ignoră */
    }
  }
  return out;
}

/** Suprascrie oportunitățile (spre deosebire de ledger, astea sunt o stare curentă). */
export function writeOpps(items) {
  writeFileSync(OPPS_PATH, items.map((o) => JSON.stringify(o)).join('\n') + '\n');
}

/**
 * Agregă ledger-ul în snapshot-ul pe care îl citește dashboard-ul.
 * Regula esențială: `realized` (bani în cont) nu se amestecă niciodată cu `pending`.
 */
export function aggregate(ledger = readLedger(), opps = readOpps()) {
  const sum = (rows) => rows.reduce((a, r) => a + (Number(r.amount_usd) || 0), 0);

  const revenue = ledger.filter((r) => r.type === 'revenue');
  const realized = sum(revenue.filter((r) => r.status === 'realized'));
  const pending = sum(revenue.filter((r) => r.status !== 'realized'));
  const costs = sum(ledger.filter((r) => r.type === 'cost'));

  const byTrack = {};
  for (const r of ledger) {
    const t = (byTrack[r.track] ||= { track: r.track, revenue: 0, cost: 0, actions: 0 });
    if (r.type === 'revenue' && r.status === 'realized') t.revenue += Number(r.amount_usd) || 0;
    if (r.type === 'cost') t.cost += Number(r.amount_usd) || 0;
    t.actions += 1;
  }

  const live = opps.filter((o) => o.verdict === 'accept');

  return {
    generated_at: new Date().toISOString(),
    goal_usd: GOAL_USD,
    realized_usd: round(realized),
    pending_usd: round(pending),
    costs_usd: round(costs),
    net_usd: round(realized - costs),
    progress_pct: Math.min(100, round((realized / GOAL_USD) * 100)),
    events_total: ledger.length,
    tracks: Object.values(byTrack).sort((a, b) => b.revenue - a.revenue),
    // Fluxul de activitate: cele mai recente 60 de evenimente, cel mai nou primul.
    activity: ledger.slice(-60).reverse(),
    opportunities: {
      accepted: live.length,
      rejected: opps.length - live.length,
      // Motivele respingerii sunt la fel de importante ca acceptările: arată
      // că filtrul chiar lucrează, în loc să pretindă că piața e goală.
      top: live.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15),
      rejection_reasons: tally(opps.filter((o) => o.verdict !== 'accept').map((o) => o.reason)),
    },
  };
}

function tally(list) {
  const m = {};
  for (const x of list) m[x || 'necunoscut'] = (m[x || 'necunoscut'] || 0) + 1;
  return Object.entries(m)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/** Recalculează state.json din ledger. Rulat după fiecare scout. */
export function rebuildState() {
  const state = aggregate();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  return state;
}

// Rulat direct (`node scouts/lib/ledger.mjs`) → reconstruiește starea.
if (process.argv[1] && process.argv[1].endsWith('ledger.mjs')) {
  const s = rebuildState();
  console.log(
    `state.json actualizat — încasat $${s.realized_usd} / $${s.goal_usd} ` +
      `(${s.progress_pct}%), în așteptare $${s.pending_usd}, costuri $${s.costs_usd}, ` +
      `${s.events_total} evenimente`,
  );
}
