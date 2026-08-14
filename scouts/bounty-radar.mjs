#!/usr/bin/env node
// Bounty radar — găsește bounty-uri OSS REALE și le respinge pe cele false.
//
// Partea grea nu e găsirea, e respingerea. În august 2026 spațiul public de
// bounty-uri e dominat de ferme de boți și de taskuri sintetice de benchmark
// plantate în fork-uri. Fără filtru, un sistem automat își arde tot efortul pe
// momeli („Fix typo in README" avea 91 de PR-uri concurente).
//
// Zero LLM, zero dependențe, zero cost. Rulează pe GitHub Actions la nesfârșit.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, append, writeOpps, rebuildState } from './lib/ledger.mjs';

const BLOCKLIST_PATH = join(ROOT, 'data', 'farm-blocklist.json');
const API = 'https://api.github.com';

// ─────────────────────────────────────────────────────────────────────────────
// Reguli de respingere, derivate din fermele observate direct pe 14 aug 2026.
// ─────────────────────────────────────────────────────────────────────────────

/** Organizații confirmate ca ferme. Se extinde singură (vezi learnFarms). */
const SEED_FARM_ORGS = [
  'relayhop',            // generează un „[radar] SN open bounty" pe oră
  'NSPG13',              // bounty-uri circulare între agenți
  'zhangjiayang6835-cyber', // bounty-plaza
  'xevrion-v2',          // agent-playground: momeli cu 60-91 comentarii
  'SecureBananaLabs',
  'yavorl',
];

/** Titluri cu semnătură de generator automat. */
const BOT_TITLE_PATTERNS = [
  /^\[radar\]/i,
  /^\[DIRECT\]/i,
  /^\[Bounty\]\s*\[Bounty\]/i,
  /seed a paid .* child bounty/i,
  /^test$/i,
  // Un timestamp ISO în titlu = generare periodică, nu problemă reală.
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
];

/** Boți care atestă că un bounty chiar are bani în spate. */
const FUNDING_BOTS = /algora|polar|opire|bountysource|issuehunt/i;
const AMOUNT_RE = /\$\s?([\d,]+(?:\.\d{2})?)/;

const RULES = {
  MIN_STARS: 200,          // sub asta, proiectul nu susține un bounty serios
  MIN_REPO_AGE_DAYS: 90,   // repo-urile noi-nouțe sunt aproape mereu ferme
  MAX_COMMENTS: 60,        // doar mulțimea reală; vezi nota de mai jos
  MAX_STALE_DAYS: 60,      // maintainer inactiv = PR-ul tău putrezește
};

// Nota care contează: NU filtrăm după vechimea issue-ului, și e intenționat.
// Un bounty vechi, finanțat și încă nerevendicat pe un repo activ e o țintă
// BUNĂ, nu una moartă — înseamnă că roiul de agenți a încercat și a eșuat, deci
// cere pricepere reală, exact unde am avantaj. Semnalul de moarte e maintainerul
// inactiv (MAX_STALE_DAYS), nu data issue-ului. Un plafon strâns de comentarii
// arunca fix aceste ținte: bounty-ul de $200 de la activepieces, deschis din
// iunie 2025, cădea la 28 de comentarii.

// ─────────────────────────────────────────────────────────────────────────────

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const TOKEN = token();

async function gh(path, params) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'claude-bani-radar',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
    const waitMs = Math.max(0, reset - Date.now()) + 1000;
    if (waitMs > 0 && waitMs < 90_000) {
      console.error(`  rate limit — aștept ${Math.round(waitMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      return gh(path, params);
    }
    throw new Error(`rate limit depășit (${res.status})`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} la ${path}`);
  return res.json();
}

function loadBlocklist() {
  if (!existsSync(BLOCKLIST_PATH)) return { orgs: [...SEED_FARM_ORGS], repos: [] };
  try {
    const b = JSON.parse(readFileSync(BLOCKLIST_PATH, 'utf8'));
    return { orgs: [...new Set([...SEED_FARM_ORGS, ...(b.orgs || [])])], repos: b.repos || [] };
  } catch {
    return { orgs: [...SEED_FARM_ORGS], repos: [] };
  }
}

/**
 * Extinde blocklistul singură: dacă un repo produce multe issue-uri cu titluri
 * aproape identice într-o singură scanare, e un generator, nu un proiect.
 */
function learnFarms(candidates, blocklist) {
  const byRepo = {};
  for (const c of candidates) (byRepo[c.repo] ||= []).push(c.title);

  const learned = [];
  for (const [repo, titles] of Object.entries(byRepo)) {
    if (titles.length < 5) continue;
    // Prefixul de 25 de caractere: generatoarele variază doar coada (timestamp, id).
    const prefixes = new Set(titles.map((t) => t.slice(0, 25).toLowerCase()));
    if (prefixes.size <= Math.max(2, titles.length * 0.3)) {
      if (!blocklist.repos.includes(repo)) {
        blocklist.repos.push(repo);
        learned.push(`${repo} (${titles.length} issue-uri, ${prefixes.size} tipare)`);
      }
    }
  }
  if (learned.length) {
    writeFileSync(BLOCKLIST_PATH, JSON.stringify(blocklist, null, 2) + '\n');
    console.log(`  ferme noi învățate: ${learned.join(', ')}`);
  }
  return learned;
}

const days = (iso) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

// ─── Filtrele, de la cel mai ieftin la cel mai scump ─────────────────────────
// Ordinea contează: verificările gratuite (din rezultatul căutării) elimină
// majoritatea, ca să nu cheltuim apeluri API pe momeli evidente.

// Motivul e o CATEGORIE, detaliul e separat. Altfel „proiect prea mic (58★)" și
// „(37★)" ajung rânduri distincte pe dashboard și tiparul devine ilizibil.
const no = (reason, detail) => ({ reason, detail: detail ?? null });

function cheapReject(c, blocklist) {
  const org = c.repo.split('/')[0];
  if (blocklist.orgs.some((o) => o.toLowerCase() === org.toLowerCase()))
    return no('organizație-fermă cunoscută', org);
  if (blocklist.repos.includes(c.repo)) return no('repo-fermă învățat automat', c.repo);
  if (BOT_TITLE_PATTERNS.some((re) => re.test(c.title))) return no('titlu generat de bot');
  if (c.comments > RULES.MAX_COMMENTS) return no('prea competitiv', `${c.comments} comentarii`);
  return null;
}

function repoReject(repo) {
  if (repo.fork) return no('fork (task sintetic de benchmark)');
  if (repo.stargazers_count < RULES.MIN_STARS)
    return no('proiect prea mic', `${repo.stargazers_count}★`);
  if (days(repo.created_at) < RULES.MIN_REPO_AGE_DAYS)
    return no('repo prea nou', `${Math.round(days(repo.created_at))} zile`);
  if (days(repo.pushed_at) > RULES.MAX_STALE_DAYS)
    return no('proiect inactiv', `${Math.round(days(repo.pushed_at))} zile fără commit`);
  return null;
}

/**
 * Bounty-ul e deja luat? Cel mai scump mod de a pierde timp e să lucrezi la
 * ceva ce altcineva a livrat deja. Verificat pe date reale: din 6 bounty-uri
 * finanțate găsite pe 14 aug 2026, TOATE 6 erau deja revendicate — unul
 * adjudecat, iar la altul maintainerul cerea explicit să nu mai vină PR-uri.
 */
const CLAIM_WINDOW_DAYS = 45;

function alreadyTaken(comments) {
  for (const c of comments) {
    const body = c.body || '';
    const age = days(c.created_at);

    // Maintainer confirmă că bounty-ul s-a dus.
    if (/(finalized|awarded|paid out|has been claimed).{0,40}(bounty|issue)/i.test(body))
      return no('deja adjudecat', 'maintainer a confirmat');
    if (/don'?t (create|submit|open) any more PRs|too many (of them|PRs)/i.test(body))
      return no('maintainer cere oprirea PR-urilor');

    // Revendicare activă recentă = cursă deja pornită.
    if (age <= CLAIM_WINDOW_DAYS && /(^|\s)\/(attempt|claim)\b/i.test(body))
      return no('revendicat activ', `acum ${Math.round(age)} zile`);
  }
  return null;
}

/** Dovada că există bani reali: un bot de finanțare a postat o sumă. */
function findFunding(issueBody, comments) {
  for (const c of comments) {
    const isBot = FUNDING_BOTS.test(c.user?.login || '') || c.user?.type === 'Bot';
    if (!isBot) continue;
    const m = AMOUNT_RE.exec(c.body || '');
    if (m) return { amount: Number(m[1].replace(/,/g, '')), source: c.user.login };
  }
  // Maintainerul poate posta comanda direct în corpul issue-ului.
  const m = /\/bounty\s+\$?\s?([\d,]+)/i.exec(issueBody || '');
  if (m) return { amount: Number(m[1].replace(/,/g, '')), source: 'issue body' };
  return null;
}

/**
 * Scorul e condus de sumă, modulat de accesibilitate — nu de prospețime.
 * Vechimea nu penalizează (vezi nota de la RULES); doar mulțimea de concurenți
 * și inactivitatea maintainerului scad șansele reale de încasare.
 */
function score(amount, issue, repo) {
  const activity = Math.max(0.2, 1 - days(repo.pushed_at) / 30);
  const crowding = Math.max(0.25, 1 - issue.comments / RULES.MAX_COMMENTS);
  return Math.round(amount * activity * crowding);
}

// ─────────────────────────────────────────────────────────────────────────────

const QUERIES = [
  'label:"💎 Bounty" state:open type:issue',
  'label:bounty state:open type:issue',
  'label:"💰 Bounty" state:open type:issue',
  'label:bounties state:open type:issue',
];

async function main() {
  if (!TOKEN) {
    console.error('Fără token GitHub (setează GITHUB_TOKEN sau rulează `gh auth login`).');
    process.exit(1);
  }
  const blocklist = loadBlocklist();
  console.log(`Radar bounty — blocklist: ${blocklist.orgs.length} org, ${blocklist.repos.length} repo\n`);

  // 1. Colectează candidați din toate interogările, deduplicat.
  const seen = new Set();
  const candidates = [];
  // Fără fereastră pe dată. Sortăm și după `updated` ca să prindem bounty-urile
  // vechi dar încă vii — exact ținta pe care roiul de agenți a ratat-o.
  for (const q of QUERIES) {
    for (const sort of ['updated', 'created']) {
      for (const page of ['1', '2']) {
        let items = [];
        try {
          const r = await gh('/search/issues', {
            q, sort, order: 'desc', per_page: '100', page,
          });
          items = r.items || [];
        } catch (e) {
          console.error(`  «${q}» sort=${sort} p${page} a eșuat: ${e.message}`);
          continue;
        }
        for (const it of items) {
          if (seen.has(it.html_url)) continue;
          seen.add(it.html_url);
          candidates.push({
            url: it.html_url,
            repo: it.repository_url.split('/').slice(-2).join('/'),
            title: it.title,
            body: it.body || '',
            comments: it.comments,
            created_at: it.created_at,
            number: it.number,
          });
        }
        if (items.length < 100) break; // nu mai sunt pagini
        await new Promise((r) => setTimeout(r, 2200)); // 30 căutări/min
      }
      await new Promise((r) => setTimeout(r, 2200));
    }
  }
  console.log(`Candidați bruți: ${candidates.length}`);

  // 2. Învață ferme noi din tiparele acestei scanări.
  learnFarms(candidates, blocklist);

  // 3. Filtre ieftine.
  const results = [];
  const survivors = [];
  for (const c of candidates) {
    const r = cheapReject(c, blocklist);
    if (r) results.push({ ...c, verdict: 'reject', ...r, body: undefined });
    else survivors.push(c);
  }
  console.log(`După filtrele ieftine: ${survivors.length}`);

  // 4. Metadate repo (cache per repo — mulți candidați împart același repo).
  const repoCache = new Map();
  const stage2 = [];
  for (const c of survivors) {
    if (!repoCache.has(c.repo)) {
      try {
        repoCache.set(c.repo, await gh(`/repos/${c.repo}`));
      } catch {
        repoCache.set(c.repo, null);
      }
    }
    const repo = repoCache.get(c.repo);
    if (!repo) {
      results.push({ ...c, verdict: 'reject', ...no('repo inaccesibil'), body: undefined });
      continue;
    }
    const r = repoReject(repo);
    if (r) results.push({ ...c, verdict: 'reject', ...r, body: undefined });
    else stage2.push({ ...c, repoMeta: repo });
  }
  console.log(`După filtrele de repo: ${stage2.length}`);

  // 5. Dovada de finanțare — cel mai scump pas, rulat doar pe supraviețuitori.
  for (const c of stage2) {
    let comments = [];
    try {
      comments = await gh(`/repos/${c.repo}/issues/${c.number}/comments`, { per_page: '100' });
    } catch {
      /* continuăm cu ce avem */
    }
    const funding = findFunding(c.body, comments);
    if (!funding) {
      results.push({ ...c, verdict: 'reject', ...no('fără dovadă de finanțare'), body: undefined, repoMeta: undefined });
      continue;
    }
    const taken = alreadyTaken(comments);
    if (taken) {
      results.push({ ...c, verdict: 'reject', ...taken, body: undefined, repoMeta: undefined });
      continue;
    }
    results.push({
      url: c.url,
      repo: c.repo,
      title: c.title,
      comments: c.comments,
      created_at: c.created_at,
      verdict: 'accept',
      amount_usd: funding.amount,
      funding_source: funding.source,
      stars: c.repoMeta.stargazers_count,
      language: c.repoMeta.language,
      age_days: Math.round(days(c.created_at)),
      // „hard" = deschis de mult, cu mulți concurenți care n-au reușit. Nu e
      // un minus: e semnul că cere pricepere reală, nu viteză.
      difficulty: c.comments > 20 || days(c.created_at) > 120 ? 'hard' : 'normal',
      score: score(funding.amount, c, c.repoMeta),
    });
  }

  // 6. Persistă + raportează.
  const accepted = results.filter((r) => r.verdict === 'accept').sort((a, b) => b.score - a.score);
  writeOpps(results);

  append({
    type: 'action',
    track: 'bounty',
    desc:
      `Scanare radar: ${candidates.length} candidați → ${accepted.length} bounty-uri reale ` +
      `(${results.length - accepted.length} respinse ca ferme/nefinanțate)`,
    agent: 'bounty-radar',
  });
  if (accepted.length) {
    append({
      type: 'opportunity',
      track: 'bounty',
      amount_usd: accepted[0].amount_usd,
      desc: `Cel mai bun bounty: ${accepted[0].title.slice(0, 80)} (${accepted[0].repo})`,
      evidence: accepted[0].url,
      agent: 'bounty-radar',
    });
  }
  rebuildState();

  console.log(`\n✓ ACCEPTATE: ${accepted.length}`);
  for (const a of accepted.slice(0, 10))
    console.log(`   $${a.amount_usd} · ${a.repo} · ${a.stars}★ · scor ${a.score}\n     ${a.title.slice(0, 70)}`);

  const reasons = {};
  for (const r of results.filter((x) => x.verdict === 'reject'))
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  console.log('\n✗ RESPINSE, pe motive:');
  for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]))
    console.log(`   ${String(n).padStart(4)} × ${reason}`);
}

// Rulează doar când e invocat direct, ca importul pentru teste să nu declanșeze
// o scanare completă (și să nu suprascrie opportunities.jsonl).
if (process.argv[1] && process.argv[1].endsWith('bounty-radar.mjs')) {
  main().catch((e) => {
    console.error('Radar eșuat:', e.message);
    process.exit(1);
  });
}

export { alreadyTaken, cheapReject, repoReject, findFunding, score, learnFarms };
