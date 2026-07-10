const fs = require('fs');
const path = require('path');
const collections = new Set();
function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      const content = fs.readFileSync(p, 'utf-8');
      const matches = content.matchAll(/db\.collection\(['"`](.*?)['"`]\)|const\s+COLLECTION\s*=\s*['"`](.*?)['"`]|collection\([^,]+,\s*['"`](.*?)['"`]\)/g);
      for (const match of matches) {
        collections.add(match[1] || match[2] || match[3]);
      }
    }
  }
}
walk('app/api');
console.log(Array.from(collections).filter(Boolean).sort().join('\n'));
