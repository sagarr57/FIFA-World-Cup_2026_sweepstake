/**
 * Smoke tests for recent bug fixes (run against netlify dev on :8888)
 * Usage: node scripts/verify-fixes.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:8888';

const checks = [];

function pass(msg) {
  checks.push({ ok: true, msg });
  console.log('✓', msg);
}
function fail(msg, detail) {
  checks.push({ ok: false, msg, detail });
  console.error('✗', msg, detail || '');
}

async function fetchHtml(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.text();
}

async function main() {
  console.log(`Verifying ${BASE}\n`);

  // APIs
  try {
    const scores = await fetch(`${BASE}/api/scores`).then(r => r.json());
    if (scores.fixtures?.length > 0) pass(`Scores API returns ${scores.fixtures.length} fixture(s)`);
    else fail('Scores API returned no fixtures');
  } catch (e) {
    fail('Scores API', e.message);
  }

  try {
    const preds = await fetch(`${BASE}/api/predictions`).then(r => r.json());
    if (Array.isArray(preds.picks)) pass('Predictions API returns picks array');
    else fail('Predictions API invalid shape');
  } catch (e) {
    fail('Predictions API', e.message);
  }

  const html = await fetchHtml('/index.html');

  // Fixtures fix: check #fixture-view guard (not .ptab)
  if (html.includes("getElementById('fixture-view')")) pass('Fixtures uses #fixture-view guard');
  else fail('Fixtures guard missing');

  if (html.includes('function defaultPlayer()')) pass('defaultPlayer() remembers saved name');
  else fail('defaultPlayer() missing');

  if (html.includes("field === 'scoreH' || field === 'scoreA'") && html.includes('return;')) {
    pass('Score input avoids full rebuild on keystroke');
  } else fail('Score input focus fix missing');

  if (html.includes('live: af.status === \'LIVE\'')) pass('LIVE scores applied from API');
  else fail('LIVE score handling missing');

  if (html.includes('!r.live')) pass('Points/badges skip in-progress matches');
  else fail('Live match scoring guard missing');

  if (html.includes('wcMemberPicks') && html.includes('function applyApiPicks')) {
    pass('Saved picks persist in localStorage and merge with API');
  } else fail('Pick localStorage persistence missing');

  if (html.includes('wcPicksPlayer') && html.includes('remembered')) pass('localStorage player restored on load');
  else fail('localStorage restore missing');

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
