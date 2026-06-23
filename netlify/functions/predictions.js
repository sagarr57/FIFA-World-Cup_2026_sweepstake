const { connectLambda, getStore } = require('@netlify/blobs');

const PEOPLE = new Set([
  'Amie', 'Nabeel', 'Chaouki', 'Nousheed', 'Basel', 'Kaushika', 'Sagar', 'Christian',
  'Lyka', 'Heena', 'Kristelle', 'Karl', 'Ali', 'Ken', 'Jen', 'Darren',
]);

// Kickoff times in FIXTURES are UK summer time (BST = UTC+1) — lock 1h before kickoff UTC
const SCHEDULE_UTC_OFFSET_H = 1;
const FIXTURES = [
  { d: '11 Jun', t: '20:00' }, { d: '12 Jun', t: '03:00' }, { d: '12 Jun', t: '20:00' },
  { d: '13 Jun', t: '02:00' }, { d: '13 Jun', t: '20:00' }, { d: '13 Jun', t: '23:00' },
  { d: '14 Jun', t: '02:00' }, { d: '14 Jun', t: '05:00' }, { d: '14 Jun', t: '18:00' },
  { d: '14 Jun', t: '21:00' }, { d: '15 Jun', t: '00:00' }, { d: '15 Jun', t: '03:00' },
  { d: '15 Jun', t: '17:00' }, { d: '15 Jun', t: '20:00' }, { d: '15 Jun', t: '23:00' },
  { d: '16 Jun', t: '02:00' }, { d: '16 Jun', t: '20:00' }, { d: '16 Jun', t: '23:00' },
  { d: '17 Jun', t: '02:00' }, { d: '17 Jun', t: '05:00' }, { d: '17 Jun', t: '18:00' },
  { d: '17 Jun', t: '21:00' }, { d: '18 Jun', t: '00:00' }, { d: '18 Jun', t: '03:00' },
  { d: '18 Jun', t: '17:00' }, { d: '18 Jun', t: '20:00' }, { d: '18 Jun', t: '23:00' },
  { d: '19 Jun', t: '02:00' }, { d: '19 Jun', t: '20:00' }, { d: '19 Jun', t: '23:00' },
  { d: '20 Jun', t: '01:30' }, { d: '20 Jun', t: '04:00' }, { d: '20 Jun', t: '18:00' },
  { d: '20 Jun', t: '21:00' }, { d: '21 Jun', t: '01:00' }, { d: '21 Jun', t: '05:00' },
  { d: '21 Jun', t: '17:00' }, { d: '21 Jun', t: '20:00' }, { d: '21 Jun', t: '23:00' },
  { d: '22 Jun', t: '02:00' }, { d: '22 Jun', t: '18:00' }, { d: '22 Jun', t: '22:00' },
  { d: '23 Jun', t: '01:00' }, { d: '23 Jun', t: '04:00' }, { d: '23 Jun', t: '18:00' },
  { d: '23 Jun', t: '21:00' }, { d: '24 Jun', t: '00:00' }, { d: '24 Jun', t: '03:00' },
  { d: '25 Jun', t: '20:00' }, { d: '25 Jun', t: '20:00' }, { d: '25 Jun', t: '23:00' },
  { d: '25 Jun', t: '23:00' }, { d: '26 Jun', t: '20:00' }, { d: '26 Jun', t: '20:00' },
  { d: '26 Jun', t: '23:00' }, { d: '26 Jun', t: '23:00' }, { d: '26 Jun', t: '23:00' },
  { d: '26 Jun', t: '23:00' }, { d: '27 Jun', t: '02:00' }, { d: '27 Jun', t: '02:00' },
  { d: '27 Jun', t: '20:00' }, { d: '27 Jun', t: '20:00' }, { d: '27 Jun', t: '20:00' },
  { d: '27 Jun', t: '20:00' }, { d: '27 Jun', t: '23:00' }, { d: '27 Jun', t: '23:00' },
  { d: '27 Jun', t: '23:00' }, { d: '27 Jun', t: '23:00' }, { d: '27 Jun', t: '02:00' },
  { d: '27 Jun', t: '02:00' }, { d: '27 Jun', t: '02:00' }, { d: '27 Jun', t: '02:00' },
];

const MONTHS = { Jun: 5 };
const LOCK_MS = 60 * 60 * 1000;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function kickoffMs(f) {
  const [day, mon] = f.d.split(' ');
  const [h, m] = f.t.split(':').map(Number);
  return Date.UTC(2026, MONTHS[mon], Number(day), h - SCHEDULE_UTC_OFFSET_H, m || 0);
}

function isLocked(matchIdx) {
  if (matchIdx < 0 || matchIdx >= FIXTURES.length) return true;
  return Date.now() >= kickoffMs(FIXTURES[matchIdx]) - LOCK_MS;
}

function pickKey(player, matchIdx) {
  return `pick/${player}/${matchIdx}`;
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (/MissingBlob/i.test(msg)) {
    return 'Predictions need the Netlify server. Run npm run dev locally, or use your deployed Netlify URL — not a plain file open or python server.';
  }
  return msg;
}

function getPickStore(event) {
  if (!event?.blobs) {
    throw new Error('MissingBlobContext');
  }
  connectLambda(event);
  return getStore('wcpicks');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  let store;
  try {
    store = getPickStore(event);
  } catch (err) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: friendlyError(err), picks: [] }),
    };
  }

  if (event.httpMethod === 'GET') {
    try {
      const picks = [];
      for await (const page of store.list({ prefix: 'pick/', paginate: true })) {
        const batch = await Promise.all(
          page.blobs.map((blob) => store.get(blob.key, { type: 'json' }))
        );
        batch.filter(Boolean).forEach((data) => picks.push(data));
      }
      return { statusCode: 200, headers, body: JSON.stringify({ picks, updatedAt: new Date().toISOString() }) };
    } catch (err) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: friendlyError(err), picks: [] }),
      };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const player = String(body.player || '').trim();
      const matchIdx = Number(body.matchIdx);
      const pick = String(body.pick || '');
      const scoreH = Number(body.scoreH);
      const scoreA = Number(body.scoreA);

      if (!PEOPLE.has(player)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown player' }) };
      }
      if (!Number.isInteger(matchIdx) || matchIdx < 0 || matchIdx >= FIXTURES.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid match' }) };
      }
      if (!['home', 'away', 'draw'].includes(pick)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Pick must be home, away, or draw' }) };
      }
      if (!Number.isInteger(scoreH) || !Number.isInteger(scoreA) || scoreH < 0 || scoreA > 9 || scoreH > 9 || scoreA < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid score' }) };
      }
      if (pick === 'home' && scoreH <= scoreA) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Home win needs higher home score' }) };
      }
      if (pick === 'away' && scoreA <= scoreH) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Away win needs higher away score' }) };
      }
      if (pick === 'draw' && scoreH !== scoreA) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Draw needs equal scores' }) };
      }
      const adminKey = process.env.ADMIN_KEY;
      const force = body.force === true && adminKey && body.adminKey === adminKey;
      if (!force && isLocked(matchIdx)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Predictions locked for this match' }) };
      }

      const record = {
        player,
        matchIdx,
        pick,
        scoreH,
        scoreA,
        savedAt: new Date().toISOString(),
      };

      await store.setJSON(pickKey(player, matchIdx), record);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, pick: record }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: friendlyError(err) }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
