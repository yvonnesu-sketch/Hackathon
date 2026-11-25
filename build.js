// Bundles public/ into one self-contained HTML file (dist/brd-intake.html)
// that works without the server: open it in any browser, entries save locally.
const fs = require('fs');
const path = require('path');
const pub = (f) => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');

let html = pub('index.html')
  .replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${pub('styles.css')}</style>`)
  .replace('<script src="store.js"></script>', () => `<script>\n${pub('store.js')}</script>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${pub('app.js')}</script>`);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'brd-intake.html'), html);
console.log('Wrote dist/brd-intake.html');
