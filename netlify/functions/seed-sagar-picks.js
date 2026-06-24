/**
 * One-off: seed Sagar's remaining MD3 picks (matches 53–71).
 * Based on group-stage form + seed strength. POST with x-seed-token.
 */
const { connectLambda, getStore } = require('@netlify/blobs');

const PICKS = [
  { player: 'Sagar', matchIdx: 53, pick: 'home', scoreH: 2, scoreA: 1 },
  { player: 'Sagar', matchIdx: 54, pick: 'draw', scoreH: 1, scoreA: 1 },
  { player: 'Sagar', matchIdx: 55, pick: 'away', scoreH: 0, scoreA: 2 },
  { player: 'Sagar', matchIdx: 56, pick: 'away', scoreH: 1, scoreA: 2 },
  { player: 'Sagar', matchIdx: 57, pick: 'away', scoreH: 0, scoreA: 2 },
  { player: 'Sagar', matchIdx: 58, pick: 'home', scoreH: 2, scoreA: 1 },
  { player: 'Sagar', matchIdx: 59, pick: 'away', scoreH: 0, scoreA: 2 },
  { player: 'Sagar', matchIdx: 60, pick: 'home', scoreH: 2, scoreA: 1 },
  { player: 'Sagar', matchIdx: 61, pick: 'away', scoreH: 0, scoreA: 2 },
  { player: 'Sagar', matchIdx: 62, pick: 'away', scoreH: 0, scoreA: 1 },
  { player: 'Sagar', matchIdx: 63, pick: 'draw', scoreH: 1, scoreA: 1 },
  { player: 'Sagar', matchIdx: 64, pick: 'home', scoreH: 2, scoreA: 1 },
  { player: 'Sagar', matchIdx: 65, pick: 'draw', scoreH: 1, scoreA: 1 },
  { player: 'Sagar', matchIdx: 66, pick: 'away', scoreH: 0, scoreA: 1 },
  { player: 'Sagar', matchIdx: 67, pick: 'away', scoreH: 0, scoreA: 2 },
  { player: 'Sagar', matchIdx: 68, pick: 'home', scoreH: 1, scoreA: 0 },
  { player: 'Sagar', matchIdx: 69, pick: 'draw', scoreH: 1, scoreA: 1 },
  { player: 'Sagar', matchIdx: 70, pick: 'away', scoreH: 0, scoreA: 2 },
  { player: 'Sagar', matchIdx: 71, pick: 'draw', scoreH: 1, scoreA: 1 },
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
      seeded: true,
    };
    await store.setJSON(`pick/${p.player}/${p.matchIdx}`, record);
    saved.push(record);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, saved: saved.length, picks: saved }),
  };
};
