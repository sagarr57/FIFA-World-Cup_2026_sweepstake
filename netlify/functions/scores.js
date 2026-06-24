const CACHE_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25000;
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const TOURNAMENT_START = '2026-06-11';
const TOURNAMENT_END = '2026-07-19';

let cache = { data: null, ts: 0 };

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=120',
};

const FETCH_OPTS = {
  headers: { Accept: 'application/json', 'User-Agent': 'FIFA-Sweepstake/1.0' },
  signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
};

const TEAM_MAP = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  'Czech Republic': 'Czechia',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cote d Ivoire': 'Ivory Coast',
  'Bosnia and Herzegovina': 'Bosnia & Herz.',
  'Bosnia-Herzegovina': 'Bosnia & Herz.',
  'Democratic Republic of the Congo': 'DR Congo',
  'Congo DR': 'DR Congo',
  'Curaçao': 'Curacao',
  'Cabo Verde': 'Cape Verde',
  'IR Iran': 'Iran',
  Türkiye: 'Turkey',
};

const KO_ROUND_LABEL = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  final: 'Final',
  third: 'Third-place',
};

function normTeam(name) {
  if (!name) return null;
  return TEAM_MAP[name] || name;
}

function fixtureKey(home, away) {
  return `${normTeam(home)}|${normTeam(away)}`;
}

function parseEspnStatus(name) {
  if (name === 'STATUS_FULL_TIME' || name === 'STATUS_FINAL') return 'FT';
  if (name === 'STATUS_IN_PROGRESS' || name === 'STATUS_HALFTIME') return 'LIVE';
  return 'NS';
}

function parseEspnEvents(data, sourceLabel, includeScheduled = false) {
  const fixtures = [];
  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const homeC = comp.competitors?.find((c) => c.homeAway === 'home');
    const awayC = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!homeC || !awayC) continue;

    const status = parseEspnStatus(event.status?.type?.name);
    if (!includeScheduled && status === 'NS') continue;

    const h = parseInt(homeC.score, 10);
    const a = parseInt(awayC.score, 10);
    const hasScore = !Number.isNaN(h) && !Number.isNaN(a);
    const homeWinner = homeC.winner === true;
    const awayWinner = awayC.winner === true;
    const pens = status === 'FT' && hasScore && h === a && (homeWinner || awayWinner);

    fixtures.push({
      home: homeC.team?.displayName,
      away: awayC.team?.displayName,
      h: hasScore ? h : null,
      a: hasScore ? a : null,
      status,
      round: event.name || comp.notes?.[0]?.headline || 'Group Stage',
      source: sourceLabel,
      homeWinner,
      awayWinner,
      pens,
      kickoffUtc: event.date || null,
      matchId: event.id || null,
    });
  }
  return fixtures;
}

async function fetchEspnScoreboard(dateYmd, includeScheduled = false) {
  const url = dateYmd ? `${ESPN_BASE}?dates=${dateYmd}` : ESPN_BASE;
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  return parseEspnEvents(data, dateYmd ? `espn:${dateYmd}` : 'espn', includeScheduled);
}

function tournamentDatesYmd() {
  const start = new Date(`${TOURNAMENT_START}T12:00:00Z`);
  const end = new Date(`${TOURNAMENT_END}T12:00:00Z`);
  const today = new Date();
  const cap = today < end ? today : end;
  const dates = [];
  for (let d = new Date(start); d <= cap; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}${m}${day}`);
  }
  return dates;
}

async function mapPool(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx]);
      } catch (e) {
        console.error('pool:', e.message);
        results[idx] = [];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results.flat();
}

async function fetchEspnHistory(includeScheduled = false) {
  const dates = tournamentDatesYmd();
  const batches = await mapPool(dates, 6, (d) => fetchEspnScoreboard(d, includeScheduled));
  return batches;
}

function wc26RoundLabel(g) {
  if (g.type && g.type !== 'group') {
    return KO_ROUND_LABEL[g.type] || g.group || 'Knockout';
  }
  return g.group ? `Group ${g.group}` : 'Group Stage';
}

function wc26TeamName(g, side) {
  const idKey = side === 'home' ? 'home_team_id' : 'away_team_id';
  const nameKey = side === 'home' ? 'home_team_name_en' : 'away_team_name_en';
  const labelKey = side === 'home' ? 'home_team_label' : 'away_team_label';
  const id = String(g[idKey] || '');
  if (id && id !== '0' && g[nameKey]) return normTeam(g[nameKey]);
  return g[labelKey] || 'TBD';
}

function parseWc26LocalDate(localDate) {
  const m = String(localDate || '').match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, mi] = m;
  // Venue-local stored as naive US time; convert via approximate offset per month is fragile.
  // Prefer ISO from ESPN when merged; store raw for client u field from static fixtures.
  return { yyyy, mm, dd, hh, mi };
}

async function fetchWorldCup26({ includeScheduled = false } = {}) {
  const [gamesRes, teamsRes] = await Promise.all([
    fetch('https://worldcup26.ir/get/games', FETCH_OPTS),
    fetch('https://worldcup26.ir/get/teams', FETCH_OPTS),
  ]);
  if (!gamesRes.ok) throw new Error(`worldcup26 games ${gamesRes.status}`);

  const gamesData = await gamesRes.json();
  const teamsData = teamsRes.ok ? await teamsRes.json() : {};
  const games = gamesData.games || gamesData;

  const results = [];
  const schedule = [];

  for (const g of games) {
    const isGroup = g.type === 'group' || (!g.type && /^[A-L]$/i.test(String(g.group || '')));
    const round = wc26RoundLabel(g);
    const home = wc26TeamName(g, 'home');
    const away = wc26TeamName(g, 'away');

    const finished = String(g.finished || '').toUpperCase() === 'TRUE';
    const h = parseInt(g.home_score, 10);
    const a = parseInt(g.away_score, 10);
    const hasNumericScore = !Number.isNaN(h) && !Number.isNaN(a);
    const elapsed = parseInt(g.time_elapsed, 10);
    const inProgress = !finished && hasNumericScore && elapsed > 0 && elapsed < 120;
    let status = finished ? 'FT' : inProgress ? 'LIVE' : 'NS';

    const entry = {
      home,
      away,
      h: hasNumericScore ? h : null,
      a: hasNumericScore ? a : null,
      status,
      round,
      source: 'worldcup26',
      matchId: g.id || null,
      wc26Type: g.type || (isGroup ? 'group' : 'ko'),
      localDate: g.local_date || null,
      homeWinner: false,
      awayWinner: false,
      pens: false,
    };

    if (status === 'FT' && hasNumericScore) {
      if (h > a) entry.homeWinner = true;
      else if (a > h) entry.awayWinner = true;
    }

    if (!isGroup) schedule.push({ ...entry });

    if (status === 'NS' && !includeScheduled) continue;
    if (isGroup && status === 'NS') continue;

    results.push(entry);
  }

  return { results, schedule };
}

const STATUS_RANK = { FT: 3, LIVE: 2, NS: 1 };

function applyEspnWinners(target, espnFixture) {
  if (!espnFixture || espnFixture.status !== 'FT') return;
  if (espnFixture.homeWinner) {
    target.homeWinner = true;
    target.awayWinner = false;
    if (target.h != null && target.a != null && target.h === target.a) target.pens = true;
  } else if (espnFixture.awayWinner) {
    target.awayWinner = true;
    target.homeWinner = false;
    if (target.h != null && target.a != null && target.h === target.a) target.pens = true;
  }
  if (espnFixture.kickoffUtc) target.kickoffUtc = espnFixture.kickoffUtc;
}

function pickBetterFixture(prev, next) {
  if (!prev) return next;
  const prevRank = STATUS_RANK[prev.status] || 0;
  const nextRank = STATUS_RANK[next.status] || 0;
  if (nextRank > prevRank) return next;
  if (nextRank < prevRank) return prev;
  if (next.status === 'LIVE' && String(next.source).startsWith('espn')) return next;
  if (prev.status === 'LIVE' && String(prev.source).startsWith('espn')) return prev;
  if (next.status === 'FT' && next.source === 'worldcup26') return next;
  if (prev.status === 'FT' && prev.source === 'worldcup26') return prev;
  if (next.homeWinner || next.awayWinner) return { ...next, h: next.h ?? prev.h, a: next.a ?? prev.a };
  return next;
}

function mergeFixtures(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const f of list) {
      const key = fixtureKey(f.home, f.away);
      if (key === 'null|null' || key.includes('TBD') || key.includes('Winner') || key.includes('Runner-up') || key.includes('Loser') || key.includes('3rd Group')) continue;
      const merged = pickBetterFixture(map.get(key), f);
      map.set(key, merged);
    }
  }
  return [...map.values()];
}

function mergeEspnIntoList(baseList, espnList) {
  const espnMap = new Map();
  for (const f of espnList) {
    const key = fixtureKey(f.home, f.away);
    if (key === 'null|null') continue;
    espnMap.set(key, f);
    espnMap.set(`${normTeam(f.away)}|${normTeam(f.home)}`, f);
  }
  return baseList.map((f) => {
    const key = fixtureKey(f.home, f.away);
    const espn = espnMap.get(key);
    if (!espn) return f;
    const out = { ...f };
    if (espn.h != null) out.h = espn.h;
    if (espn.a != null) out.a = espn.a;
    if (espn.status === 'FT' || espn.status === 'LIVE') out.status = espn.status;
    applyEspnWinners(out, espn);
    return out;
  });
}

function enrichKnockoutSchedule(schedule, espnAll, results) {
  const resultMap = new Map();
  [...results, ...espnAll].forEach((f) => {
    const key = fixtureKey(f.home, f.away);
    if (key !== 'null|null') resultMap.set(key, f);
  });

  return schedule.map((slot) => {
    const key = fixtureKey(slot.home, slot.away);
    const live = resultMap.get(key);
    if (!live) return slot;
    const out = { ...slot, ...live, round: slot.round || live.round };
    applyEspnWinners(out, live);
    return out;
  });
}

exports.handler = async function () {
  if (cache.data && Date.now() - cache.ts < CACHE_MS) {
    return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
  }

  try {
    const [wc26Data, espnLive, espnHistory] = await Promise.all([
      fetchWorldCup26({ includeScheduled: true }).catch((e) => { console.error('WC26:', e.message); return { results: [], schedule: [] }; }),
      fetchEspnScoreboard(null, true).catch((e) => { console.error('ESPN live:', e.message); return []; }),
      fetchEspnHistory(true).catch((e) => { console.error('ESPN history:', e.message); return []; }),
    ]);

    const espnAll = [...espnHistory, ...espnLive];
    const wc26Results = mergeEspnIntoList(wc26Data.results, espnAll);
    const fixtures = mergeFixtures(wc26Results, espnAll.filter((f) => f.status !== 'NS'));
    const knockoutSchedule = enrichKnockoutSchedule(wc26Data.schedule, espnAll, fixtures);

    const finished = fixtures.filter((f) => f.status === 'FT').length;
    const live = fixtures.filter((f) => f.status === 'LIVE').length;
    const sourceSet = new Set(fixtures.map((f) => f.source?.split(':')[0] || f.source));

    const payload = {
      fixtures,
      knockoutSchedule,
      updatedAt: new Date().toISOString(),
      error: fixtures.length ? null : 'No match data available right now',
      season: 2026,
      sources: [...sourceSet],
      stats: { total: fixtures.length, finished, live, knockoutSlots: knockoutSchedule.length },
    };

    if (fixtures.length > 0 || knockoutSchedule.length > 0) cache = { data: payload, ts: Date.now() };
    else if (cache.data?.fixtures?.length) {
      return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(payload) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: err.message,
        fixtures: [],
        knockoutSchedule: [],
        updatedAt: new Date().toISOString(),
        sources: ['espn', 'worldcup26'],
      }),
    };
  }
};
