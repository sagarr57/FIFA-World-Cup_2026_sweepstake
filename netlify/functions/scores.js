const WC_LEAGUE = 1;
const WC_SEASON = 2026;
const CACHE_MS = 15 * 60 * 1000;
const API_KEY = 'c23a821c9445ad6d6c99d8cd7a731b85';

let cache = { data: null, ts: 0 };

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=900',
};

exports.handler = async function () {
  if (cache.data && Date.now() - cache.ts < CACHE_MS) {
    return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
  }

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}`,
      { headers: { 'x-apisports-key': API_KEY } }
    );
    const json = await res.json();

    if (json.errors && Object.keys(json.errors).length > 0) {
      const msg = Object.values(json.errors).join(' ');
      const payload = {
        fixtures: [],
        updatedAt: new Date().toISOString(),
        error: msg,
        season: WC_SEASON,
      };
      cache = { data: payload, ts: Date.now() };
      return { statusCode: 200, headers, body: JSON.stringify(payload) };
    }

    const fixtures = (json.response || []).map((m) => ({
      id: m.fixture.id,
      home: m.teams.home.name,
      away: m.teams.away.name,
      h: m.goals.home,
      a: m.goals.away,
      status: m.fixture.status.short,
      round: m.league.round,
      date: m.fixture.date,
      homeWinner: m.teams.home.winner,
      awayWinner: m.teams.away.winner,
    }));

    const payload = {
      fixtures,
      updatedAt: new Date().toISOString(),
      error: null,
      season: WC_SEASON,
      remaining: res.headers.get('x-ratelimit-requests-remaining'),
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
      }),
    };
  }
};
