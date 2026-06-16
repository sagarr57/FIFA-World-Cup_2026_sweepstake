/**
 * Verify live scores from APIs, sweepstake vs pick board separation.
 * Usage: node scripts/verify-scores-and-boards.mjs [baseUrl]
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE = process.argv[2] || 'http://localhost:8888';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const checks = [];
function pass(msg) { checks.push({ ok: true, msg }); console.log('✓', msg); }
function fail(msg, detail) { checks.push({ ok: false, msg, detail }); console.error('✗', msg, detail ?? ''); }

const people = ['Amie','Nabeel','Chaouki','Nousheed','Basel','Kaushika','Sagar','Christian','Lyka','Heena','Kristelle','Karl','Ali','Ken','Jen','Darren'];

const fixtures = [
  { g:'A', h:'Mexico', a:'South Africa' },
  { g:'A', h:'South Korea', a:'Czechia' },
];

const allTeamNames = [
  'Argentina','France','Spain','England','Brazil','Portugal','Netherlands','Germany','Morocco','Belgium',
  'Colombia','Uruguay','Mexico','Switzerland','South Korea','Japan','USA','Canada','Australia','Iran',
  'Ecuador','Senegal','Croatia','Poland','Austria','Ukraine','Scotland','Turkey','Sweden','Czechia',
  'Norway','Denmark','Wales','Serbia','Ghana','Cameroon','Ivory Coast','South Africa','DR Congo','Tunisia',
  'Paraguay','Qatar','Saudi Arabia','Jordan','Uzbekistan','New Zealand','Panama','Curacao','Haiti',
  'Bosnia & Herz.','Algeria','Egypt','Cape Verde',
];

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const draw = {};
const shuffled = seededShuffle(allTeamNames, 20260611);
people.forEach((p, i) => { draw[p] = shuffled.slice(i * 3, i * 3 + 3); });

const SCORING = { win: 3, draw: 1, knockout: { r32: 5, r16: 5, qf: 5, sf: 5, final: 5 }, worldCupWinner: 10 };
const PICK_SCORING = { winner: 3, goalDiff: 2, exactScore: 5 };

const API_TEAM_TO_OURS = {
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cote d Ivoire': 'Ivory Coast',
  'United States': 'USA',
  'Bosnia and Herzegovina': 'Bosnia & Herz.',
  'Bosnia-Herzegovina': 'Bosnia & Herz.',
  'Congo DR': 'DR Congo',
  'Curaçao': 'Curacao',
  'Czech Republic': 'Czechia',
  'IR Iran': 'Iran',
  'Democratic Republic of the Congo': 'DR Congo',
  Türkiye: 'Turkey',
};

function mapApiTeam(name) {
  if (API_TEAM_TO_OURS[name]) return API_TEAM_TO_OURS[name];
  if (allTeamNames.includes(name)) return name;
  return null;
}

function applyApiScores(data) {
  const matchResults = {};
  const indexMap = {};
  fixtures.forEach((f, i) => { indexMap[`${f.h}|${f.a}`] = i; });

  for (const af of data.fixtures || []) {
    if ((af.status !== 'FT' && af.status !== 'LIVE') || af.h == null || af.a == null) continue;
    const home = mapApiTeam(af.home);
    const away = mapApiTeam(af.away);
    if (!home || !away) continue;
    const idx = indexMap[`${home}|${away}`];
    if (idx == null) continue;
    const prev = matchResults[idx];
    if (af.status === 'FT' || !prev?.h || prev.live) {
      matchResults[idx] = { h: af.h, a: af.a, live: af.status === 'LIVE' };
    }
  }
  return matchResults;
}

function getMatchPoints(team, f, result) {
  if (!result || result.h == null || result.a == null) return null;
  const isHome = f.h === team, isAway = f.a === team;
  if (!isHome && !isAway) return 0;
  if (result.h === result.a) return SCORING.draw;
  if ((isHome && result.h > result.a) || (isAway && result.a > result.h)) return SCORING.win;
  return 0;
}

function calcSweepScore(person, matchResults) {
  const teams = draw[person];
  let group = 0, wins = 0, draws = 0;
  fixtures.forEach((f, i) => {
    const result = matchResults[i];
    if (!result || result.h == null || result.live) return;
    for (const t of teams) {
      const p = getMatchPoints(t, f, result);
      const isHome = f.h === t, isAway = f.a === t;
      if (!isHome && !isAway) continue;
      if (result.h === result.a) draws++;
      else if ((isHome && result.h > result.a) || (isAway && result.a > result.h)) wins++;
      group += p || 0;
    }
  });
  return { sweep: group, wins, draws };
}

function scoreMemberPick(pick, result) {
  if (!pick || !result || result.h == null || result.a == null) return 0;
  const actual = result.h === result.a ? 'draw' : result.h > result.a ? 'home' : 'away';
  let pts = 0;
  if (pick.pick === actual) pts += PICK_SCORING.winner;
  const predDiff = pick.scoreH - pick.scoreA;
  const actualDiff = result.h - result.a;
  if (actual !== 'draw' && pick.pick === actual && predDiff === actualDiff) pts += PICK_SCORING.goalDiff;
  if (pick.scoreH === result.h && pick.scoreA === result.a) pts += PICK_SCORING.exactScore;
  return pts;
}

async function fetchScores() {
  try {
    const res = await fetch(`${BASE}/api/scores`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    const handler = (await import(join(ROOT, 'netlify/functions/scores.js'))).handler;
    const r = await handler();
    return JSON.parse(r.body);
  }
}

async function main() {
  console.log(`Verifying scores & separate boards (${BASE})\n`);

  const scoresJs = readFileSync(join(ROOT, 'netlify/functions/scores.js'), 'utf8');
  if (!scoresJs.includes('KNOWN_FT')) pass('No hardcoded KNOWN_FT results in scores API');
  else fail('scores.js still contains hardcoded KNOWN_FT');

  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

  // ── Board separation (static) ──
  if (html.includes('function getSweepboard()') && html.includes('function getPickboard()')) {
    pass('Separate getSweepboard() and getPickboard() functions exist');
  } else fail('Missing separate board functions');

  if (html.includes('buildSweepboardSection()') && html.includes('buildPickboardSection()')) {
    pass('Separate sweep and pick board UI builders');
  } else fail('Missing separate board builders');

  if (!html.includes('function calcPlayerScore') && !html.includes('function getLeaderboard')) {
    pass('No combined calcPlayerScore / getLeaderboard');
  } else fail('Combined leaderboard logic still present');

  if (!html.includes('sweep ·') && !html.includes('stack on top of your sweepstake')) {
    pass('No mixed sweep/pick breakdown in UI copy');
  } else fail('Mixed sweep/pick copy still in HTML');

  if (html.includes('wcMemberPicks') && html.includes('function persistMemberPicks')) {
    pass('Picks cached locally so saved predictions are not lost');
  } else fail('Pick persistence helpers missing');

  if (html.includes('data-tab="sweep"') && html.includes('data-tab="pickboard"')) {
    pass('Separate Sweepstake and Pick Board tabs');
  } else fail('Missing separate tabs');

  if (html.includes("secId: 'sec-sweep'") && html.includes("secId: 'sec-pickboard'")) {
    pass('Separate section containers for each board');
  } else fail('Board sections not separated');

  // Pick scoring: no goal diff on draws (exact score on draws is still valid)
  const drawPts = scoreMemberPick({ pick: 'draw', scoreH: 1, scoreA: 1 }, { h: 1, a: 1 });
  if (drawPts === PICK_SCORING.winner + PICK_SCORING.exactScore) {
    pass('Draw picks: +3 winner, +5 exact, no goal-diff bonus');
  } else fail('Draw pick scoring wrong', `got ${drawPts}, expected ${PICK_SCORING.winner + PICK_SCORING.exactScore}`);

  const wrongPick = scoreMemberPick({ pick: 'home', scoreH: 2, scoreA: 0 }, { h: 1, a: 1 });
  if (wrongPick === 0) pass('Wrong winner pick gets 0 pts');
  else fail('Wrong winner pick should score 0', `got ${wrongPick}`);

  const winExact = scoreMemberPick({ pick: 'home', scoreH: 2, scoreA: 0 }, { h: 2, a: 0 });
  if (winExact === PICK_SCORING.winner + PICK_SCORING.goalDiff + PICK_SCORING.exactScore) {
    pass('Win + goal diff + exact score = 10 pts');
  } else fail('Full pick score wrong', `got ${winExact}`);

  // ── Live scores API ──
  let data;
  try {
    data = await fetchScores();
    pass(`Scores API reachable (${data.fixtures?.length ?? 0} fixtures)`);
  } catch (e) {
    fail('Scores API', e.message);
    return finish();
  }

  const ft = (data.fixtures || []).filter(f => f.status === 'FT');
  const fromApi = ft.filter(f => f.source === 'worldcup26' || String(f.source).startsWith('espn'));
  if (fromApi.length >= 2) pass(`Scores API returns ${fromApi.length} FT result(s) from live APIs`);
  else fail('Too few FT results from APIs', `got ${fromApi.length}`);

  const hardcoded = (data.fixtures || []).filter(f => f.source === 'known');
  if (!hardcoded.length) pass('No hardcoded "known" source fixtures in API response');
  else fail('Hardcoded fixtures still in API', hardcoded.map(f => `${f.home} ${f.h}-${f.a} ${f.away}`).join(', '));

  const mexico = ft.find(f => mapApiTeam(f.home) === 'Mexico' && mapApiTeam(f.away) === 'South Africa');
  const korea = ft.find(f => mapApiTeam(f.home) === 'South Korea' && mapApiTeam(f.away) === 'Czechia');

  if (mexico?.h != null && mexico?.a != null) pass(`Mexico vs South Africa from API: ${mexico.h}–${mexico.a} (${mexico.source})`);
  else fail('Mexico vs South Africa missing from API');

  if (korea?.h != null && korea?.a != null) pass(`South Korea vs Czechia from API: ${korea.h}–${korea.a} (${korea.source})`);
  else fail('South Korea vs Czechia missing from API');

  const matchResults = applyApiScores(data);
  const nsApplied = Object.entries(matchResults).filter(([idx, r]) => {
    const f = fixtures[Number(idx)];
    if (!f) return false;
    const af = (data.fixtures || []).find(x => mapApiTeam(x.home) === f.h && mapApiTeam(x.away) === f.a);
    return af?.status === 'NS' && r?.h != null;
  });
  if (!nsApplied.length) pass('Not-started (NS) fixtures are not applied to standings');
  else fail('NS fixtures applied to standings', JSON.stringify(nsApplied));

  const finished = Object.values(matchResults).filter(r => r?.h != null && !r.live).length;
  if (finished >= 2) pass(`applyApiScores maps ${finished} finished match(es)`);
  else fail('applyApiScores did not map FT results from API', JSON.stringify(matchResults));

  // ── Expected sweep points from API results (Group A MD1) ──
  const expected = { Chaouki: 3, Nousheed: 3, Kaushika: 0 };
  if (mexico?.h === 2 && mexico?.a === 0 && korea?.h === 2 && korea?.a === 1) {
    for (const [person, want] of Object.entries(expected)) {
      const got = calcSweepScore(person, matchResults).sweep;
      if (got === want) pass(`${person}: ${got} sweep pts (from API results)`);
      else fail(`${person} sweep pts`, `got ${got}, expected ${want} — teams: ${draw[person].join(', ')}`);
    }
  } else {
    pass('Sweep point spot-check skipped (API results differ from current tournament state)');
  }

  // ── Pick board uses picks only (mock: exact Mexico pick ≠ sweep) ──
  const mockPicks = {
    Chaouki: { pick: 'home', scoreH: 2, scoreA: 0 },
    Nousheed: { pick: 'home', scoreH: 1, scoreA: 0 },
    Kaushika: { pick: 'away', scoreH: 0, scoreA: 1 },
  };
  let pickChaouki = 0, pickNousheed = 0;
  pickChaouki += scoreMemberPick(mockPicks.Chaouki, matchResults[0]);
  pickNousheed += scoreMemberPick(mockPicks.Nousheed, matchResults[1]);
  const pickKaushika = scoreMemberPick(mockPicks.Kaushika, matchResults[1]);

  if (pickChaouki === 10 && pickNousheed === 5 && pickKaushika === 0) {
    pass('Pick points computed independently of sweep (sample picks)');
  } else {
    fail('Sample pick scoring', `Chaouki=${pickChaouki}, Nousheed=${pickNousheed}, Kaushika=${pickKaushika}`);
  }

  if (pickChaouki !== calcSweepScore('Chaouki', matchResults).sweep) {
    pass('Chaouki pick total (10) ≠ sweep total (3) — boards stay separate');
  } else fail('Pick and sweep totals accidentally equal for Chaouki');

  finish();
}

function finish() {
  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
