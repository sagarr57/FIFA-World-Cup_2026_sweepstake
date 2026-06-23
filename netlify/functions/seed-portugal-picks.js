/**
 * One-off: seed Portugal vs Uzbekistan (match 44) picks after fixture-list mistake.
 * Invoke once via POST with header x-seed-token matching SEED_ONCE_TOKEN env, then delete this file.
 */
const { connectLambda, getStore } = require('@netlify/blobs');

const MATCH_IDX = 44;
const PICKS = [
  { player: 'Nabeel', pick: 'home', scoreH: 3, scoreA: 0 },
  { player: 'Kaushika', pick: 'home', scoreH: 4, scoreA: 1 },
  { player: 'Sagar', pick: 'home', scoreH: 5, scoreA: 0 },
  { player: 'Basel', pick: 'home', scoreH: 3, scoreA: 1 },
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
      matchIdx: MATCH_IDX,
      pick: p.pick,
      scoreH: p.scoreH,
      scoreA: p.scoreA,
      savedAt: new Date().toISOString(),
      seeded: true,
    };
    await store.setJSON(`pick/${p.player}/${MATCH_IDX}`, record);
    saved.push(record);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, saved, note: 'Chaouki skipped — already had a pick' }),
  };
};
