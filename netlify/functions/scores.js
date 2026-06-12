const CACHE_MS = 2 * 60 * 1000; // refresh every 2 min

let cache = { data: null, ts: 0 };

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=120',
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

async function fetchEspn() {
  const res = await fetch(
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
  );
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  const fixtures = [];

  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const homeC = comp.competitors?.find((c) => c.homeAway === 'home');
    const awayC = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!homeC || !awayC) continue;

    const status = parseEspnStatus(event.status?.type?.name);
    const h = parseInt(homeC.score, 10);
    const a = parseInt(awayC.score, 10);

    fixtures.push({
      home: homeC.team?.displayName,
      away: awayC.team?.displayName,
      h: Number.isNaN(h) ? null : h,
      a: Number.isNaN(a) ? null : a,
      status,
      round: event.name || 'Group Stage',
      source: 'espn',
      homeWinner: homeC.winner === true,
      awayWinner: awayC.winner === true,
    });
  }
  return fixtures;
}

async function fetchWorldCup26() {
  const [gamesRes, teamsRes] = await Promise.all([
    fetch('https://worldcup26.ir/get/games'),
    fetch('https://worldcup26.ir/get/teams'),
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
    const live = String(g.finished || '').toUpperCase() === 'FALSE' &&
      g.home_score != null && g.away_score != null &&
      (parseInt(g.home_score, 10) > 0 || parseInt(g.away_score, 10) > 0);
    const status = finished ? 'FT' : live ? 'LIVE' : 'NS';
    if (status === 'NS') continue;

    const h = parseInt(g.home_score, 10);
    const a = parseInt(g.away_score, 10);
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

// Kept when live APIs drop past results from the scoreboard window
const KNOWN_FT = [
  { home: 'Mexico', away: 'South Africa', h: 2, a: 0, status: 'FT', source: 'known' },
  { home: 'South Korea', away: 'Czechia', h: 2, a: 1, status: 'FT', source: 'known' },
  { home: 'Korea Republic', away: 'Czech Republic', h: 2, a: 1, status: 'FT', source: 'known' },
];

function mergeFixtures(espn, wc26) {
  const map = new Map();
  // worldcup26 first, ESPN overrides (better live state)
  for (const f of wc26) {
    const key = fixtureKey(f.home, f.away);
    if (key !== 'null|null') map.set(key, f);
  }
  for (const f of espn) {
    const key = fixtureKey(f.home, f.away);
    if (key === 'null|null') continue;
    const prev = map.get(key);
    if (!prev || f.status === 'FT' || f.status === 'LIVE') map.set(key, f);
  }
  for (const f of KNOWN_FT) {
    const key = fixtureKey(f.home, f.away);
    if (key === 'null|null') continue;
    const prev = map.get(key);
    if (!prev || prev.status !== 'FT') map.set(key, f);
  }
  return [...map.values()];
}

exports.handler = async function () {
  if (cache.data && Date.now() - cache.ts < CACHE_MS) {
    return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
  }

  try {
    const [espn, wc26] = await Promise.all([
      fetchEspn().catch((e) => { console.error('ESPN:', e.message); return []; }),
      fetchWorldCup26().catch((e) => { console.error('WC26:', e.message); return []; }),
    ]);

    const fixtures = mergeFixtures(espn, wc26);
    const finished = fixtures.filter((f) => f.status === 'FT').length;
    const live = fixtures.filter((f) => f.status === 'LIVE').length;

    const payload = {
      fixtures,
      updatedAt: new Date().toISOString(),
      error: fixtures.length ? null : 'No match data available right now',
      season: 2026,
      sources: ['espn', 'worldcup26'],
      stats: { total: fixtures.length, finished, live },
    };

    cache = { data: payload, ts: Date.now() };
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
