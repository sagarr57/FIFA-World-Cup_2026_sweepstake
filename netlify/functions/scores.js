const CACHE_MS = 2 * 60 * 1000; // refresh every 2 min
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
  'IR Iran': 'Iran',
  Türkiye: 'Turkey',
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

function parseEspnEvents(data, sourceLabel) {
  const fixtures = [];
  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const homeC = comp.competitors?.find((c) => c.homeAway === 'home');
    const awayC = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!homeC || !awayC) continue;

    const status = parseEspnStatus(event.status?.type?.name);
    if (status === 'NS') continue;
    const h = parseInt(homeC.score, 10);
    const a = parseInt(awayC.score, 10);

    fixtures.push({
      home: homeC.team?.displayName,
      away: awayC.team?.displayName,
      h: Number.isNaN(h) ? null : h,
      a: Number.isNaN(a) ? null : a,
      status,
      round: event.name || comp.notes?.[0]?.headline || 'Group Stage',
      source: sourceLabel,
      homeWinner: homeC.winner === true,
      awayWinner: awayC.winner === true,
    });
  }
  return fixtures;
}

async function fetchEspnScoreboard(dateYmd) {
  const url = dateYmd ? `${ESPN_BASE}?dates=${dateYmd}` : ESPN_BASE;
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  return parseEspnEvents(data, dateYmd ? `espn:${dateYmd}` : 'espn');
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

async function fetchEspnHistory() {
  const dates = tournamentDatesYmd();
  const batches = await mapPool(dates, 6, (d) => fetchEspnScoreboard(d));
  return batches;
}

async function fetchWorldCup26() {
  const [gamesRes, teamsRes] = await Promise.all([
    fetch('https://worldcup26.ir/get/games', FETCH_OPTS),
    fetch('https://worldcup26.ir/get/teams', FETCH_OPTS),
  ]);
  if (!gamesRes.ok) throw new Error(`worldcup26 games ${gamesRes.status}`);

  const gamesData = await gamesRes.json();
  const teamsData = teamsRes.ok ? await teamsRes.json() : {};
  const games = gamesData.games || gamesData;
  const teams = teamsData.teams || teamsData;
  const idToName = {};
  for (const t of teams) {
    idToName[t.id] = t.name_en || t.name;
  }

  const fixtures = [];
  for (const g of games) {
    const finished = String(g.finished || '').toUpperCase() === 'TRUE';
    const hRaw = g.home_score;
    const aRaw = g.away_score;
    const h = parseInt(hRaw, 10);
    const a = parseInt(aRaw, 10);
    const hasNumericScore = !Number.isNaN(h) && !Number.isNaN(a);
    const elapsed = parseInt(g.time_elapsed, 10);
    const inProgress = !finished && hasNumericScore && elapsed > 0 && elapsed < 120;
    const status = finished ? 'FT' : inProgress ? 'LIVE' : 'NS';
    if (status === 'NS') continue;

    const home = idToName[g.home_team_id];
    const away = idToName[g.away_team_id];

    fixtures.push({
      home,
      away,
      h: Number.isNaN(h) ? null : h,
      a: Number.isNaN(a) ? null : a,
      status,
      round: g.group ? `Group ${g.group}` : 'Group Stage',
      source: 'worldcup26',
      homeWinner: finished && h > a,
      awayWinner: finished && a > h,
    });
  }
  return fixtures;
}

const STATUS_RANK = { FT: 3, LIVE: 2, NS: 1 };

function pickBetterFixture(prev, next) {
  if (!prev) return next;
  const prevRank = STATUS_RANK[prev.status] || 0;
  const nextRank = STATUS_RANK[next.status] || 0;
  if (nextRank > prevRank) return next;
  if (nextRank < prevRank) return prev;
  // Prefer live ESPN over static wc26 when both LIVE
  if (next.status === 'LIVE' && String(next.source).startsWith('espn')) return next;
  if (prev.status === 'LIVE' && String(prev.source).startsWith('espn')) return prev;
  // Prefer worldcup26 for finished historical completeness
  if (next.status === 'FT' && next.source === 'worldcup26') return next;
  if (prev.status === 'FT' && prev.source === 'worldcup26') return prev;
  return next;
}

function mergeFixtures(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const f of list) {
      const key = fixtureKey(f.home, f.away);
      if (key === 'null|null') continue;
      map.set(key, pickBetterFixture(map.get(key), f));
    }
  }
  return [...map.values()];
}

exports.handler = async function () {
  if (cache.data && Date.now() - cache.ts < CACHE_MS) {
    return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
  }

  try {
    const [wc26, espnLive, espnHistory] = await Promise.all([
      fetchWorldCup26().catch((e) => { console.error('WC26:', e.message); return []; }),
      fetchEspnScoreboard().catch((e) => { console.error('ESPN live:', e.message); return []; }),
      fetchEspnHistory().catch((e) => { console.error('ESPN history:', e.message); return []; }),
    ]);

    const fixtures = mergeFixtures(wc26, espnHistory, espnLive);
    const finished = fixtures.filter((f) => f.status === 'FT').length;
    const live = fixtures.filter((f) => f.status === 'LIVE').length;
    const sourceSet = new Set(fixtures.map((f) => f.source?.split(':')[0] || f.source));

    const payload = {
      fixtures,
      updatedAt: new Date().toISOString(),
      error: fixtures.length ? null : 'No match data available right now',
      season: 2026,
      sources: [...sourceSet],
      stats: { total: fixtures.length, finished, live },
    };

    // Never cache empty responses — avoids blanking pick/sweep boards for 2 min after a blip
    if (fixtures.length > 0) cache = { data: payload, ts: Date.now() };
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
        updatedAt: new Date().toISOString(),
        sources: ['espn', 'worldcup26'],
      }),
    };
  }
};
