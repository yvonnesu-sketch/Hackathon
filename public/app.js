const form = document.getElementById('intake-form');
const tpl = document.getElementById('link-row');
const errorsBox = document.getElementById('errors');
const list = document.getElementById('list');

const SOURCE_LABELS = {
  google_doc: 'Google Doc', google_slides: 'Google Slides', google_sheet: 'Google Sheet',
  google_drive: 'Google Drive', confluence: 'Confluence', microsoft: 'SharePoint / Office',
  notion: 'Notion', other: 'Link',
};

function classify(url) {
  try {
    const u = new URL(url); const h = u.hostname;
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
  } catch { return null; }
}

function addRow(group, value = '') {
  const container = form.querySelector(`[data-group="${group}"]`);
  const row = tpl.content.firstElementChild.cloneNode(true);
  const input = row.querySelector('input');
  const badge = row.querySelector('.badge');
  input.value = value;
  const update = () => {
    const v = input.value.trim();
    const src = v ? classify(v) : '';
    badge.textContent = src ? SOURCE_LABELS[src] : '';
    input.classList.toggle('invalid', !!v && !src);
  };
  input.addEventListener('input', update);
  // Pasting several links at once splits them into separate rows.
  input.addEventListener('paste', (e) => {
    const parts = e.clipboardData.getData('text').split(/[\s,]+/).filter(Boolean);
    if (parts.length > 1) {
      e.preventDefault();
      input.value = parts[0]; update();
      parts.slice(1).forEach((p) => addRow(group, p));
    }
  });
  row.querySelector('.remove').addEventListener('click', () => {
    if (container.children.length > 1) row.remove(); else { input.value = ''; update(); }
  });
  container.appendChild(row);
  update();
  return input;
}

form.querySelectorAll('[data-add]').forEach((btn) =>
  btn.addEventListener('click', () => addRow(btn.dataset.add).focus()));
['prdLinks', 'kickoffLinks'].forEach((g) => addRow(g));

const collect = (group) =>
  [...form.querySelectorAll(`[data-group="${group}"] input`)].map((i) => i.value.trim()).filter(Boolean);

function showErrors(errs) {
  errorsBox.hidden = !errs.length;
  errorsBox.innerHTML = errs.length ? `<ul>${errs.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const payload = {
    projectName: fd.get('projectName'), owner: fd.get('owner'),
    financeArea: fd.get('financeArea'), notes: fd.get('notes'),
    prdLinks: collect('prdLinks'), kickoffLinks: collect('kickoffLinks'),
  };
  const btn = form.querySelector('.primary');
  btn.disabled = true;
  try {
    const { ok, data } = await store.create(payload);
    if (!ok) return showErrors(data.errors || ['Something went wrong']);
    showErrors([]);
    form.reset();
    form.querySelectorAll('.links').forEach((c) => (c.innerHTML = ''));
    ['prdLinks', 'kickoffLinks'].forEach((g) => addRow(g));
    toast(`Intake "${data.projectName}" submitted`);
    function intakeSummary(i) {
  return [
    `Project: ${i.projectName}`,
    i.owner && `Owner: ${i.owner}`,
    i.financeArea && `Finance area: ${i.financeArea}`,
    'PRD links:', ...i.prdLinks.map((l) => `- ${l.url}`),
    'Kick-off deck links:', ...i.kickoffLinks.map((l) => `- ${l.url}`),
    i.notes && `Notes: ${i.notes}`,
  ].filter(Boolean).join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into the Claude chat.');
  } catch {
    // Clipboard can be blocked in embedded previews: show the text to copy by hand.
    const box = document.getElementById('copy-box');
    box.hidden = false;
    box.querySelector('textarea').value = text;
    box.querySelector('textarea').select();
  }
}
document.querySelector('#copy-box button').addEventListener('click', () => {
  document.getElementById('copy-box').hidden = true;
});

store.init().then(() => {
  document.getElementById('mode').textContent = store.mode === 'server'
    ? 'Saved on the server'
    : store.mode === 'local' ? 'Saved in this browser only' : 'Not saved: storage is blocked here, so entries disappear on reload';
  loadList();
});
  } catch {
    showErrors(['Could not reach the server']);
  } finally {
    btn.disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const linkList = (links) => `<ul>${links.map((l) =>
  `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.url)}</a> <span class="badge">${SOURCE_LABELS[l.source]}</span></li>`).join('')}</ul>`;

async function loadList() {
  const items = await store.list();
  if (!items.length) { list.innerHTML = '<p class="muted">No intakes yet.</p>'; return; }
  list.innerHTML = items.map((i) => `
    <div class="intake">
      <div class="intake-head"><h3>${escapeHtml(i.projectName)}</h3><span class="status">${escapeHtml(i.status)}</span></div>
      <div class="meta">${[i.owner, i.financeArea, new Date(i.createdAt).toLocaleString()].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      <strong>PRD</strong>${linkList(i.prdLinks)}
      <strong>Kick-off deck</strong>${linkList(i.kickoffLinks)}
      ${i.notes ? `<p class="meta">${escapeHtml(i.notes)}</p>` : ''}
      <div class="actions">
        <button class="copy" data-id="${i.id}">Copy links for Claude</button>
        <button class="del" data-id="${i.id}">Delete</button>
      </div>
    </div>`).join('');
  // Two-click delete (confirm() is blocked when the page is embedded in a preview panel).
  list.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.armed) { await store.remove(b.dataset.id); return loadList(); }
    b.dataset.armed = '1'; b.textContent = 'Click again to delete';
    setTimeout(() => { delete b.dataset.armed; b.textContent = 'Delete'; }, 3000);
  }));
  list.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => {
    const i = items.find((x) => x.id === b.dataset.id);
    copyText(intakeSummary(i));
  }));
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function intakeSummary(i) {
  return [
    `Project: ${i.projectName}`,
    i.owner && `Owner: ${i.owner}`,
    i.financeArea && `Finance area: ${i.financeArea}`,
    'PRD links:', ...i.prdLinks.map((l) => `- ${l.url}`),
    'Kick-off deck links:', ...i.kickoffLinks.map((l) => `- ${l.url}`),
    i.notes && `Notes: ${i.notes}`,
  ].filter(Boolean).join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into the Claude chat.');
  } catch {
    // Clipboard can be blocked in embedded previews: show the text to copy by hand.
    const box = document.getElementById('copy-box');
    box.hidden = false;
    box.querySelector('textarea').value = text;
    box.querySelector('textarea').select();
  }
}
document.querySelector('#copy-box button').addEventListener('click', () => {
  document.getElementById('copy-box').hidden = true;
});

store.init().then(() => {
  document.getElementById('mode').textContent = store.mode === 'server'
    ? 'Saved on the server'
    : store.mode === 'local' ? 'Saved in this browser only' : 'Not saved: storage is blocked here, so entries disappear on reload';
  loadList();
});
