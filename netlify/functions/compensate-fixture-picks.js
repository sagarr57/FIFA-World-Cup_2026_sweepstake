/**
 * One-off: replace zero-point picks on mis-listed finished matches (45, 46)
 * with random winner-correct scores (3 or 5 pts, never 10).
 * POST with x-seed-token matching SEED_ONCE_TOKEN.
 */
const { connectLambda, getStore } = require('@netlify/blobs');

const PICKS = [
  { player: 'Nabeel', matchIdx: 45, pick: 'draw', scoreH: 4, scoreA: 4 },
  { player: 'Chaouki', matchIdx: 45, pick: 'draw', scoreH: 2, scoreA: 2 },
  { player: 'Kaushika', matchIdx: 45, pick: 'draw', scoreH: 2, scoreA: 2 },
  { player: 'Sagar', matchIdx: 45, pick: 'draw', scoreH: 1, scoreA: 1 },
  { player: 'Chaouki', matchIdx: 46, pick: 'away', scoreH: 4, scoreA: 5 },
  { player: 'Kaushika', matchIdx: 46, pick: 'away', scoreH: 1, scoreA: 4 },
  { player: 'Sagar', matchIdx: 46, pick: 'away', scoreH: 1, scoreA: 4 },
];

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async function (event) {
  const token = event.headers['x-seed-token'] || event.headers['X-Seed-Token'];
  if (!process.env.SEED_ONCE_TOKEN || token !== process.env.SEED_ONCE_TOKEN) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  connectLambda(event);
  const store = getStore('wcpicks');
  const saved = [];

  for (const p of PICKS) {
    const record = {
      player: p.player,
      matchIdx: p.matchIdx,
      pick: p.pick,
      scoreH: p.scoreH,
      scoreA: p.scoreA,
      savedAt: new Date().toISOString(),
      compensated: true,
    };
    await store.setJSON(`pick/${p.player}/${p.matchIdx}`, record);
    saved.push(record);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      saved,
      note: 'Matches 45–46 only; Nabeel match 46 unchanged (already had 5 pts)',
    }),
  };
};
