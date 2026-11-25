// Minimal zero-dependency server for the BRD intake page.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'intakes.json');

const load = () => (fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : []);
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
const save = (items) => fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));

// Classify a link so later pipeline steps know how to fetch it.
function classify(url) {
  const u = new URL(url);
  const h = u.hostname;
  if (h === 'docs.google.com') {
    if (u.pathname.startsWith('/document')) return 'google_doc';
    if (u.pathname.startsWith('/presentation')) return 'google_slides';
    if (u.pathname.startsWith('/spreadsheets')) return 'google_sheet';
  }
  if (h === 'drive.google.com') return 'google_drive';
  if (h.endsWith('atlassian.net') || h.includes('confluence')) return 'confluence';
  if (h.endsWith('sharepoint.com') || h.endsWith('office.com')) return 'microsoft';
  if (h.endsWith('notion.so') || h.endsWith('notion.site')) return 'notion';
  return 'other';
}

function validateLinks(list, label, errors) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.map((s) => String(s || '').trim()).filter(Boolean).forEach((url) => {
    try {
      const u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      out.push({ url, source: classify(url) });
    } catch {
      errors.push(`${label}: "${url}" is not a valid http(s) URL`);
    }
  });
  return out;
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/api/intakes' && req.method === 'GET') {
    return send(res, 200, load().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  if (pathname === '/api/intakes' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { errors: ['Invalid JSON'] }); }
    const errors = [];
    const projectName = String(body.projectName || '').trim();
    if (!projectName) errors.push('Project name is required');
    const prdLinks = validateLinks(body.prdLinks, 'PRD', errors);
    const kickoffLinks = validateLinks(body.kickoffLinks, 'Kick-off deck', errors);
    if (!prdLinks.length) errors.push('At least one PRD link is required');
    if (!kickoffLinks.length) errors.push('At least one kick-off deck link is required');
    if (errors.length) return send(res, 400, { errors });

    const intake = {
      id: crypto.randomUUID(),
      projectName,
      owner: String(body.owner || '').trim(),
      financeArea: String(body.financeArea || '').trim(),
      notes: String(body.notes || '').trim(),
      prdLinks,
      kickoffLinks,
      status: 'submitted', // next: fetching -> analysing -> brd_draft_ready
      createdAt: new Date().toISOString(),
    };
    const items = load();
    items.push(intake);
    save(items);
    return send(res, 201, intake);
  }

  const delMatch = pathname.match(/^\/api\/intakes\/([\w-]+)$/);
  if (delMatch && req.method === 'DELETE') {
    const items = load();
    const next = items.filter((i) => i.id !== delMatch[1]);
    if (next.length === items.length) return send(res, 404, { errors: ['Not found'] });
    save(next);
    return send(res, 204, '', 'text/plain');
  }

  // Static files
  const file = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, 'Not found', 'text/plain');
  }
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}).listen(PORT, () => console.log(`BRD intake running at http://localhost:${PORT}`));
