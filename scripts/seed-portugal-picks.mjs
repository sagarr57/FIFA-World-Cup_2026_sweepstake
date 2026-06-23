/**
 * Seed Portugal vs Uzbekistan picks (matchIdx 44) for group members.
 * Usage: ADMIN_KEY=your_key node scripts/seed-portugal-picks.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'https://gentle-choux-60fb00.netlify.app';
const ADMIN_KEY = process.env.ADMIN_KEY;
const MATCH_IDX = 44;

const PICKS = [
  { player: 'Nabeel', scoreH: 3, scoreA: 0 },
  { player: 'Kaushika', scoreH: 4, scoreA: 1 },
  { player: 'Sagar', scoreH: 5, scoreA: 0 },
  { player: 'Basel', scoreH: 3, scoreA: 1 },
];

async function main() {
  if (!ADMIN_KEY) {
    console.error('Set ADMIN_KEY env var (must match Netlify site env).');
    process.exit(1);
  }

  const existing = await fetch(`${BASE}/api/predictions`).then((r) => r.json());
  const hasPick = (player) =>
    (existing.picks || []).some((p) => p.player === player && p.matchIdx === MATCH_IDX);

  if (hasPick('Chaouki')) {
    console.log('Skip Chaouki — already has a pick for match', MATCH_IDX);
  }

  for (const { player, scoreH, scoreA } of PICKS) {
    if (hasPick(player)) {
      console.log(`Update ${player}: Portugal ${scoreH}–${scoreA}`);
    } else {
      console.log(`Add ${player}: Portugal ${scoreH}–${scoreA}`);
    }

    const res = await fetch(`${BASE}/api/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player,
        matchIdx: MATCH_IDX,
        pick: 'home',
        scoreH,
        scoreA,
        force: true,
        adminKey: ADMIN_KEY,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`✗ ${player}:`, data.error || res.status);
      process.exit(1);
    }
    console.log(`✓ ${player} saved`);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
