/**
 * One-off: remap picks to corrected fixture list (Group L MD2 + MD3 schedule fix).
 * POST with header x-seed-token matching SEED_ONCE_TOKEN.
 */
const { connectLambda, getStore } = require('@netlify/blobs');

const PRE_FIXTURE_BY_IDX = {
  45: { h: 'England', a: 'Panama' }, 46: { h: 'Croatia', a: 'Ghana' },
  48: { h: 'Mexico', a: 'Czechia' }, 49: { h: 'South Africa', a: 'South Korea' },
  50: { h: 'Canada', a: 'Switzerland' }, 51: { h: 'Bosnia & Herz.', a: 'Qatar' },
  52: { h: 'Brazil', a: 'Scotland' },
  54: { h: 'USA', a: 'Turkey' }, 55: { h: 'Paraguay', a: 'Australia' },
  56: { h: 'Germany', a: 'Ecuador' }, 57: { h: 'Ivory Coast', a: 'Curacao' },
  58: { h: 'Netherlands', a: 'Tunisia' }, 59: { h: 'Japan', a: 'Sweden' },
  60: { h: 'Belgium', a: 'New Zealand' }, 61: { h: 'Egypt', a: 'Iran' },
  62: { h: 'Spain', a: 'Uruguay' },
  64: { h: 'France', a: 'Norway' }, 65: { h: 'Senegal', a: 'Iraq' },
  66: { h: 'Argentina', a: 'Jordan' }, 67: { h: 'Algeria', a: 'Austria' },
  70: { h: 'England', a: 'Ghana' }, 71: { h: 'Croatia', a: 'Panama' },
};

const FIXTURES = [
  { h: 'Mexico', a: 'South Africa' }, { h: 'South Korea', a: 'Czechia' }, { h: 'Canada', a: 'Bosnia & Herz.' },
  { h: 'USA', a: 'Paraguay' }, { h: 'Qatar', a: 'Switzerland' }, { h: 'Brazil', a: 'Morocco' },
  { h: 'Haiti', a: 'Scotland' }, { h: 'Australia', a: 'Turkey' }, { h: 'Germany', a: 'Curacao' },
  { h: 'Netherlands', a: 'Japan' }, { h: 'Ivory Coast', a: 'Ecuador' }, { h: 'Sweden', a: 'Tunisia' },
  { h: 'Spain', a: 'Cape Verde' }, { h: 'Belgium', a: 'Egypt' }, { h: 'Saudi Arabia', a: 'Uruguay' },
  { h: 'Iran', a: 'New Zealand' }, { h: 'France', a: 'Senegal' }, { h: 'Iraq', a: 'Norway' },
  { h: 'Argentina', a: 'Algeria' }, { h: 'Austria', a: 'Jordan' }, { h: 'Portugal', a: 'DR Congo' },
  { h: 'England', a: 'Croatia' }, { h: 'Ghana', a: 'Panama' }, { h: 'Uzbekistan', a: 'Colombia' },
  { h: 'Czechia', a: 'South Africa' }, { h: 'Switzerland', a: 'Bosnia & Herz.' }, { h: 'Canada', a: 'Qatar' },
  { h: 'Mexico', a: 'South Korea' }, { h: 'USA', a: 'Australia' }, { h: 'Scotland', a: 'Morocco' },
  { h: 'Brazil', a: 'Haiti' }, { h: 'Turkey', a: 'Paraguay' }, { h: 'Netherlands', a: 'Sweden' },
  { h: 'Germany', a: 'Ivory Coast' }, { h: 'Ecuador', a: 'Curacao' }, { h: 'Tunisia', a: 'Japan' },
  { h: 'Spain', a: 'Saudi Arabia' }, { h: 'Belgium', a: 'Iran' }, { h: 'Uruguay', a: 'Cape Verde' },
  { h: 'New Zealand', a: 'Egypt' }, { h: 'Argentina', a: 'Austria' }, { h: 'France', a: 'Iraq' },
  { h: 'Norway', a: 'Senegal' }, { h: 'Jordan', a: 'Algeria' }, { h: 'Portugal', a: 'Uzbekistan' },
  { h: 'England', a: 'Ghana' }, { h: 'Panama', a: 'Croatia' }, { h: 'Colombia', a: 'DR Congo' },
  { h: 'South Africa', a: 'South Korea' }, { h: 'Czechia', a: 'Mexico' },
  { h: 'Bosnia & Herz.', a: 'Qatar' }, { h: 'Switzerland', a: 'Canada' },
  { h: 'Scotland', a: 'Brazil' }, { h: 'Morocco', a: 'Haiti' },
  { h: 'Paraguay', a: 'Australia' }, { h: 'Turkey', a: 'USA' },
  { h: 'Curacao', a: 'Ivory Coast' }, { h: 'Ecuador', a: 'Germany' },
  { h: 'Japan', a: 'Sweden' }, { h: 'Tunisia', a: 'Netherlands' },
  { h: 'Egypt', a: 'Iran' }, { h: 'New Zealand', a: 'Belgium' },
  { h: 'Uruguay', a: 'Spain' }, { h: 'Cape Verde', a: 'Saudi Arabia' },
  { h: 'Senegal', a: 'Iraq' }, { h: 'Norway', a: 'France' },
  { h: 'Algeria', a: 'Austria' }, { h: 'Jordan', a: 'Argentina' },
  { h: 'Colombia', a: 'Portugal' }, { h: 'DR Congo', a: 'Uzbekistan' },
  { h: 'Panama', a: 'England' }, { h: 'Croatia', a: 'Ghana' },
];

function findFixtureIdx(home, away) {
  return FIXTURES.findIndex(f => (f.h === home && f.a === away) || (f.h === away && f.a === home));
}

function reorientPick(pick, oldH, oldA, newF) {
  const goals = {
    [oldH]: pick.pick === 'away' ? pick.scoreA : pick.scoreH,
    [oldA]: pick.pick === 'away' ? pick.scoreH : pick.scoreA,
  };
  const scoreH = goals[newF.h];
  const scoreA = goals[newF.a];
  let side = pick.pick;
  if (pick.pick !== 'draw') {
    const winner = pick.pick === 'home' ? oldH : oldA;
    side = winner === newF.h ? 'home' : 'away';
  }
  return { ...pick, pick: side, scoreH, scoreA };
}

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
  const { blobs } = await store.list({ prefix: 'pick/' });
  const migrated = [];
  const deleted = [];

  for (const { key } of blobs) {
    const pick = await store.get(key, { type: 'json' });
    if (!pick?.player || pick.matchIdx == null) continue;
    const old = PRE_FIXTURE_BY_IDX[pick.matchIdx];
    if (!old) continue;

    const newIdx = findFixtureIdx(old.h, old.a);
    if (newIdx < 0) continue;
    const newF = FIXTURES[newIdx];
    const record = reorientPick(pick, old.h, old.a, newF);
    record.matchIdx = newIdx;
    record.migratedAt = new Date().toISOString();

    const newKey = `pick/${record.player}/${newIdx}`;
    await store.setJSON(newKey, record);
    if (newKey !== key) {
      await store.delete(key);
      deleted.push(key);
    }
    migrated.push({ from: key, to: newKey, pick: record });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, migrated: migrated.length, deleted, sample: migrated.slice(0, 5) }),
  };
};
