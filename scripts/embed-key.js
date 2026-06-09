const fs = require('fs');
const path = require('path');

const key = process.env.API_FOOTBALL_KEY || '';
const out = path.join(__dirname, '../netlify/functions/.runtime-config.js');

fs.writeFileSync(
  out,
  `// Generated at build — do not commit\nmodule.exports = { apiKey: ${JSON.stringify(key)} };\n`
);

if (key) {
  console.log('✓ API_FOOTBALL_KEY embedded for functions');
} else {
  console.warn('⚠ API_FOOTBALL_KEY not set — add it in Netlify → Environment variables (Builds + Functions scope)');
}
