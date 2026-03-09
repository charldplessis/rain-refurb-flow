// ── State ─────────────────────────────────────────────────────
let models = [];
let currentModelId = null;
let stages = [];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadModels();
  bindModalEvents();

  document.getElementById('btnReset').addEventListener('click', handleReset);
  document.getElementById('btnSaveStage').addEventListener('click', handleSaveStage);
});

// ── API helpers ───────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Models ────────────────────────────────────────────────────
async function loadModels() {
  try {
    models = await api('GET', '/api/models');
    renderSidebar();
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

function renderSidebar() {
  const list = document.getElementById('modelList');
  list.innerHTML = '';
  models.forEach(model => {
    const li = document.createElement('li');
    if (model.id === currentModelId) li.classList.add('active');
    li.innerHTML = `
      <a href="#" data-id="${model.id}">
        ${escHtml(model.name)}
        <span class="cat-count">${model.stage_count || 0}</span>
      </a>
    `;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      selectModel(model.id);
    });
    list.appendChild(li);
  });
}

function updateSidebarBadge() {
  const model = models.find(m => m.id === currentModelId);
  if (!model) return;
  model.stage_count = stages.length;
  const a = document.querySelector(`#modelList li a[data-id="${currentModelId}"]`);
  if (a) {
    const badge = a.querySelector('.cat-count');
    if (badge) badge.textContent = stages.length;
  }
}

// ── Select model ──────────────────────────────────────────────
async function selectModel(modelId) {
  currentModelId = modelId;
  document.querySelectorAll('#modelList li').forEach(li => li.classList.remove('active'));
  const a = document.querySelector(`#modelList li a[data-id="${modelId}"]`);
  if (a) a.closest('li').classList.add('active');

  const model = models.find(m => m.id === modelId);
  document.getElementById('topbarTitle').textContent = model ? model.name : '';
  document.getElementById('topbarRight').classList.remove('hidden');

  await loadStages(modelId);
}

async function loadStages(modelId) {
  try {
    stages = await api('GET', `/api/models/${modelId}/stages`);
    renderFlowchart();
    renderStats();
    updateSidebarBadge();
  } catch (err) {
    console.error('Failed to load stages:', err);
  }
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const total    = stages.length;
  const approved = stages.filter(s => s.status === 'approved').length;
  const declined = stages.filter(s => s.status === 'declined').length;
  const totalMin = stages.reduce((sum, s) => sum + (parseInt(s.time_minutes) || 0), 0);
  const pct      = total > 0 ? Math.round((approved / total) * 100) : 0;

  document.getElementById('topbarStats').innerHTML = `
    <div class="stat-item">
      <span class="s-val blue">${total}</span>
      <span class="s-lbl">Stages</span>
    </div>
    <div class="stat-item">
      <span class="s-val">${totalMin}m</span>
      <span class="s-lbl">Total Time</span>
    </div>
    <div class="stat-item">
      <span class="s-val green">${approved}</span>
      <span class="s-lbl">Approved</span>
    </div>
    <div class="stat-item">
      <span class="s-val red">${declined}</span>
      <span class="s-lbl">Declined</span>
    </div>
    <div class="stat-item">
      <span class="s-val ${pct === 100 ? 'green' : ''}">${pct}%</span>
      <span class="s-lbl">Progress</span>
    </div>
  `;
  document.getElementById('progressBar').style.width = pct + '%';
}

// ── Flowchart ─────────────────────────────────────────────────
function renderFlowchart() {
  const emptyState = document.getElementById('emptyState');
  const flowchart  = document.getElementById('flowchart');

  emptyState.classList.add('hidden');
  flowchart.classList.remove('hidden');
  flowchart.innerHTML = '';

  const model = models.find(m => m.id === currentModelId);
  flowchart.appendChild(makeTerminal('▶  Start' + (model ? ' — ' + model.name : '')));

  stages.forEach((stage, idx) => {
    flowchart.appendChild(makeConnector());
    flowchart.appendChild(makeStageCard(stage, idx + 1));
  });

  if (stages.length > 0) {
    flowchart.appendChild(makeConnector());
    flowchart.appendChild(makeTerminal('■  End'));
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'add-stage-btn';
  addBtn.innerHTML = '＋ Add Stage';
  addBtn.style.marginTop = stages.length > 0 ? '20px' : '12px';
  addBtn.addEventListener('click', () => openStageModal(null));
  flowchart.appendChild(addBtn);
}

function makeTerminal(text) {
  const div = document.createElement('div');
  div.className = 'flow-terminal';
  div.textContent = text;
  return div;
}

function makeConnector() {
  const div = document.createElement('div');
  div.className = 'flow-connector';
  div.innerHTML = '<div class="line"></div><div class="arrowhead"></div>';
  return div;
}

function makeStageCard(stage, num) {
  const card = document.createElement('div');
  card.className = `stage-card ${stage.status}`;
  card.dataset.id = stage.id;

  const notesPreview = stage.notes
    ? `<div class="stage-notes-preview">${escHtml(stage.notes)}</div>`
    : `<div class="stage-notes-preview empty">No notes</div>`;

  card.innerHTML = `
    <div class="card-header">
      <div class="stage-num">${num}</div>
      <div class="stage-name">${escHtml(stage.name)}</div>
      <div class="card-header-right">
        <span class="status-pill ${stage.status}">${capitalize(stage.status)}</span>
        <button class="btn-edit stage-edit-btn" title="Edit stage">Edit</button>
        <button class="btn-delete stage-delete-btn" title="Delete stage">Delete</button>
      </div>
    </div>
    <div class="card-body">
      <div class="time-box">
        <span class="lbl">Time</span>
        <span class="time-val">${stage.time_minutes}</span>
        <span class="unit">min</span>
      </div>
      ${notesPreview}
    </div>
    <div class="card-footer">
      <span class="footer-lbl">Decision:</span>
      <button class="btn-approve ${stage.status === 'approved' ? 'active' : ''}">
        ✓ Approve
      </button>
      <button class="btn-decline ${stage.status === 'declined' ? 'active' : ''}">
        ✕ Decline
      </button>
    </div>
  `;

  card.querySelector('.stage-edit-btn').addEventListener('click', () => openStageModal(stage));
  card.querySelector('.stage-delete-btn').addEventListener('click', () => handleDeleteStage(stage.id));

  card.querySelector('.btn-approve').addEventListener('click', () => {
    const newStatus = stage.status === 'approved' ? 'pending' : 'approved';
    setStageStatus(stage, card, newStatus);
  });

  card.querySelector('.btn-decline').addEventListener('click', () => {
    const newStatus = stage.status === 'declined' ? 'pending' : 'declined';
    setStageStatus(stage, card, newStatus);
  });

  return card;
}

// ── Status ────────────────────────────────────────────────────
function setStageStatus(stage, card, newStatus) {
  stage.status = newStatus;
  card.className = `stage-card ${newStatus}`;
  card.querySelector('.status-pill').className = `status-pill ${newStatus}`;
  card.querySelector('.status-pill').textContent = capitalize(newStatus);
  card.querySelector('.btn-approve').classList.toggle('active', newStatus === 'approved');
  card.querySelector('.btn-decline').classList.toggle('active', newStatus === 'declined');
  renderStats();
  updateSidebarBadge();
  api('PUT', `/api/stages/${stage.id}`, { status: newStatus }).catch(console.error);
}

// ── Stage modal ───────────────────────────────────────────────
function openStageModal(stage) {
  const isEdit = stage !== null;
  document.getElementById('modalStageTitle').textContent = isEdit ? 'Edit Stage' : 'Add Stage';
  document.getElementById('editStageId').value = isEdit ? stage.id : '';
  document.getElementById('stageName').value  = isEdit ? stage.name         : '';
  document.getElementById('stageTime').value  = isEdit ? stage.time_minutes : 10;
  document.getElementById('stageNotes').value = isEdit ? (stage.notes || '') : '';
  showModal('modalStage');
  setTimeout(() => document.getElementById('stageName').focus(), 100);
}

async function handleSaveStage() {
  const id    = document.getElementById('editStageId').value;
  const name  = document.getElementById('stageName').value.trim();
  const time  = parseInt(document.getElementById('stageTime').value) || 10;
  const notes = document.getElementById('stageNotes').value.trim();

  if (!name) {
    document.getElementById('stageName').focus();
    return;
  }

  try {
    if (id) {
      await api('PUT', `/api/stages/${id}`, { name, time_minutes: time, notes });
    } else {
      await api('POST', `/api/models/${currentModelId}/stages`, { name, time_minutes: time, notes });
    }
    hideModal('modalStage');
    await loadStages(currentModelId);
    if (!id) {
      const wrap = document.getElementById('flowchartWrap');
      setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 100);
    }
  } catch (err) {
    console.error('Failed to save stage:', err);
  }
}

// ── Delete stage ──────────────────────────────────────────────
async function handleDeleteStage(stageId) {
  if (!confirm('Delete this stage?')) return;
  try {
    await api('DELETE', `/api/stages/${stageId}`);
    await loadStages(currentModelId);
  } catch (err) {
    console.error('Failed to delete stage:', err);
  }
}

// ── Reset ─────────────────────────────────────────────────────
async function handleReset() {
  if (!currentModelId) return;
  if (!confirm('Reset all stages to pending and clear notes?')) return;
  try {
    await api('POST', `/api/models/${currentModelId}/reset`);
    await loadStages(currentModelId);
  } catch (err) {
    console.error('Failed to reset:', err);
  }
}

// ── Modal helpers ─────────────────────────────────────────────
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

function bindModalEvents() {
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.modal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideModal(overlay.id);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => hideModal(m.id));
    }
    if (e.key === 'Enter' && !document.getElementById('modalStage').classList.contains('hidden')) {
      const active = document.activeElement;
      if (active && active.tagName !== 'TEXTAREA') handleSaveStage();
    }
  });
}

// ── Utils ─────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
