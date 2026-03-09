// ── State ─────────────────────────────────────────────────────
let models = [];
let currentModelId = null;
let currentView = 'detail'; // 'detail' | 'graphic'
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
    const isActive = model.id === currentModelId;
    const li = document.createElement('li');
    if (isActive) li.classList.add('active');

    li.innerHTML = `
      <a href="#" class="model-link" data-id="${model.id}">
        <span class="model-chevron">${isActive ? '▾' : '▸'}</span>
        ${escHtml(model.name)}
        <span class="cat-count">${model.stage_count || 0}</span>
      </a>
      ${isActive ? `
      <ul class="sub-nav-list">
        <li class="${currentView === 'graphic' ? 'active' : ''}">
          <a href="#" class="sub-link" data-view="graphic">
            <span class="sub-icon">◈</span> Graphic
          </a>
        </li>
        <li class="${currentView === 'detail' ? 'active' : ''}">
          <a href="#" class="sub-link" data-view="detail">
            <span class="sub-icon">≡</span> Process Detail
          </a>
        </li>
      </ul>` : ''}
    `;

    li.querySelector('.model-link').addEventListener('click', (e) => {
      e.preventDefault();
      if (model.id === currentModelId) {
        // Already selected — toggle back to detail view
        switchView('detail');
      } else {
        currentView = 'detail';
        selectModel(model.id);
      }
    });

    li.querySelectorAll('.sub-link').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(a.dataset.view);
      });
    });

    list.appendChild(li);
  });
}

function updateSidebarBadge() {
  const model = models.find(m => m.id === currentModelId);
  if (!model) return;
  model.stage_count = stages.length;
  renderSidebar();
}

// ── Select model ──────────────────────────────────────────────
async function selectModel(modelId) {
  currentModelId = modelId;
  document.getElementById('topbarRight').classList.remove('hidden');
  await loadStages(modelId);
}

function switchView(view) {
  currentView = view;
  renderSidebar();
  renderTopbar();
  renderCurrentView();
}

function renderTopbar() {
  const model = models.find(m => m.id === currentModelId);
  const name  = model ? model.name : '';
  const badge = currentView === 'graphic'
    ? ' <span class="view-badge">Graphic</span>'
    : ' <span class="view-badge detail">Process Detail</span>';
  document.getElementById('topbarTitle').innerHTML = escHtml(name) + badge;

  // Show reset only in detail view
  document.getElementById('btnReset').style.display = currentView === 'detail' ? '' : 'none';
}

async function loadStages(modelId) {
  try {
    stages = await api('GET', `/api/models/${modelId}/stages`);
    renderTopbar();
    renderStats();
    renderCurrentView();
    updateSidebarBadge();
  } catch (err) {
    console.error('Failed to load stages:', err);
  }
}

function renderCurrentView() {
  if (currentView === 'graphic') {
    renderGraphic();
  } else {
    renderDetail();
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

// ── Graphic View ──────────────────────────────────────────────
function renderGraphic() {
  const emptyState = document.getElementById('emptyState');
  const flowchart  = document.getElementById('flowchart');

  emptyState.classList.add('hidden');
  flowchart.classList.remove('hidden');
  flowchart.innerHTML = '';
  flowchart.className = 'flowchart graphic-view';

  const model = models.find(m => m.id === currentModelId);

  flowchart.appendChild(makeTfcOval('start', model ? model.name : 'Start'));

  stages.forEach((stage, idx) => {
    flowchart.appendChild(makeTfcArrow());
    flowchart.appendChild(makeTfcProcess(stage, idx + 1));
    flowchart.appendChild(makeTfcArrow());
    flowchart.appendChild(makeTfcDecision(stage));
  });

  flowchart.appendChild(makeTfcArrow());
  flowchart.appendChild(makeTfcOval('end', 'End'));
}

function makeTfcOval(type, text) {
  const div = document.createElement('div');
  div.className = `tfc-oval ${type}`;
  div.textContent = text;
  return div;
}

function makeTfcArrow() {
  const div = document.createElement('div');
  div.className = 'tfc-arrow';
  div.innerHTML = '<div class="tfc-arrow-line"></div><div class="tfc-arrow-head"></div>';
  return div;
}

function makeTfcProcess(stage, num) {
  const div = document.createElement('div');
  div.className = `tfc-process ${stage.status}`;
  div.innerHTML = `
    <div class="tfc-proc-num">Stage ${String(num).padStart(2, '0')}</div>
    <div class="tfc-proc-name">${escHtml(stage.name)}</div>
    <div class="tfc-proc-time">⏱ ${stage.time_minutes} min</div>
  `;
  return div;
}

function makeTfcDecision(stage) {
  const ap = stage.status === 'approved';
  const dc = stage.status === 'declined';

  const div = document.createElement('div');
  div.className = 'tfc-decision';

  // Left column (empty mirror)
  const left = document.createElement('div');
  left.className = 'tfc-d-left';

  // Center column: diamond + Yes label
  const center = document.createElement('div');
  center.className = 'tfc-d-center';
  center.innerHTML = `
    <div class="tfc-diamond ${stage.status}"><span>Pass?</span></div>
    <div class="tfc-yes-lbl ${ap ? 'active' : ''}">Yes ↓</div>
  `;

  // Right column: No branch
  const right = document.createElement('div');
  right.className = 'tfc-d-right';
  right.innerHTML = `
    <div class="tfc-no-branch">
      <div class="tfc-no-line ${dc ? 'active' : ''}"></div>
      <span class="tfc-no-lbl ${dc ? 'active' : ''}">No</span>
      ${dc ? '<div class="tfc-declined-pill">✕ Declined</div>' : ''}
    </div>
  `;

  div.appendChild(left);
  div.appendChild(center);
  div.appendChild(right);
  return div;
}

// ── Detail View ───────────────────────────────────────────────
function renderDetail() {
  const emptyState = document.getElementById('emptyState');
  const flowchart  = document.getElementById('flowchart');

  emptyState.classList.add('hidden');
  flowchart.classList.remove('hidden');
  flowchart.innerHTML = '';
  flowchart.className = 'flowchart';

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
  // Update detail card DOM
  card.className = `stage-card ${newStatus}`;
  card.querySelector('.status-pill').className = `status-pill ${newStatus}`;
  card.querySelector('.status-pill').textContent = capitalize(newStatus);
  card.querySelector('.btn-approve').classList.toggle('active', newStatus === 'approved');
  card.querySelector('.btn-decline').classList.toggle('active', newStatus === 'declined');
  renderStats();
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

  if (!name) { document.getElementById('stageName').focus(); return; }

  try {
    if (id) {
      await api('PUT', `/api/stages/${id}`, { name, time_minutes: time, notes });
    } else {
      await api('POST', `/api/models/${currentModelId}/stages`, { name, time_minutes: time, notes });
    }
    hideModal('modalStage');
    await loadStages(currentModelId);
    if (!id && currentView === 'detail') {
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
      if (document.activeElement && document.activeElement.tagName !== 'TEXTAREA') handleSaveStage();
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
