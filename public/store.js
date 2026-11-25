// Storage layer: uses the Node server's API when it is running, otherwise
// falls back to the browser's localStorage (e.g. when this page is opened as a file).
const LINK_SOURCES = (url) => classify(url);
const LS_KEY = 'brd-intakes';

const store = {
  mode: 'server',
  memory: [],

  async init() {
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch('/api/intakes');
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) return;
      } catch { /* fall through */ }
    }
    try {
      localStorage.setItem('__t', '1'); localStorage.removeItem('__t');
      this.mode = 'local';
    } catch {
      this.mode = 'memory';
    }
  },

  _read() {
    if (this.mode === 'memory') return this.memory;
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  },
  _write(items) {
    if (this.mode === 'memory') this.memory = items;
    else localStorage.setItem(LS_KEY, JSON.stringify(items));
  },

  async list() {
    if (this.mode === 'server') return (await fetch('/api/intakes')).json();
    return this._read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(payload) {
    if (this.mode === 'server') {
      const res = await fetch('/api/intakes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      return { ok: res.ok, data: await res.json() };
    }
    // Same validation rules as server.js
    const errors = [];
    const projectName = String(payload.projectName || '').trim();
    if (!projectName) errors.push('Project name is required');
    const check = (list, label) => list.flatMap((url) => {
      const source = LINK_SOURCES(url);
      if (!source || !/^https?:/.test(url)) { errors.push(`${label}: "${url}" is not a valid http(s) URL`); return []; }
      return [{ url, source }];
    });
    const prdLinks = check(payload.prdLinks, 'PRD');
    const kickoffLinks = check(payload.kickoffLinks, 'Kick-off deck');
    if (!prdLinks.length) errors.push('At least one PRD link is required');
    if (!kickoffLinks.length) errors.push('At least one kick-off deck link is required');
    if (errors.length) return { ok: false, data: { errors } };

    const intake = {
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      projectName,
      owner: String(payload.owner || '').trim(),
      financeArea: String(payload.financeArea || '').trim(),
      notes: String(payload.notes || '').trim(),
      prdLinks, kickoffLinks,
      status: 'submitted',
      createdAt: new Date().toISOString(),
    };
    this._write([...this._read(), intake]);
    return { ok: true, data: intake };
  },

  async remove(id) {
    if (this.mode === 'server') return fetch(`/api/intakes/${id}`, { method: 'DELETE' });
    this._write(this._read().filter((i) => i.id !== id));
  },
};
