/* Task actions — submit, edit, toggle detail, charter */

// ── Task Actions ──────────────────────────────────────

function makeCaption(content) {
  const cleaned = content.replace(/[\r\n]+/g, ' ');
  return cleaned.length > 20 ? cleaned.substring(0, 20) + '...' : cleaned;
}

async function submitTask() {
  const input = document.getElementById('task-input');
  if (!input) return;

  const content = input.value.trim();
  if (!content) return;

  const res = await API.createTask(content);
  if (res.code === 0) {
    input.value = '';
    const taskId = res.data && res.data.id;
    if (taskId) await API.updateTask(taskId, { caption: makeCaption(content) });
    await loadTasks();
  } else {
    alert(`Create failed: ${res.message}`);
  }
}

async function toggleTaskDetail(taskId) {
  const detailEl = document.getElementById(`task-detail-${taskId}`);
  if (!detailEl) return;

  if (state.expandedTask === taskId || detailEl.classList.contains('open')) {
    state.expandedTask = null;
    detailEl.classList.remove('open');
    detailEl.innerHTML = '';
    return;
  }

  if (state.expandedTask !== null) {
    const prev = document.getElementById(`task-detail-${state.expandedTask}`);
    if (prev) {
      prev.classList.remove('open');
      prev.innerHTML = '';
    }
  }

  state.expandedTask = taskId;
  detailEl.innerHTML = '<div class="empty-state">Loading...</div>';
  detailEl.classList.add('open');

  try {
    const res = await API.getTask(taskId);
    if (res.code === 0 && res.data) {
      detailEl.innerHTML = renderTaskDetail(res.data);
    }
  } catch (err) {
    detailEl.innerHTML = `<div class="empty-state">Failed to load</div>`;
  }
}

async function saveTaskEdit(taskId) {
  const input = document.getElementById(`task-edit-input-${taskId}`);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  const res = await API.updateTask(taskId, { content, caption: makeCaption(content) });
  if (res.code === 0) {
    state.expandedCadoc = null;
    await loadTasks();
  } else {
    alert(`Save failed: ${res.message}`);
  }
}

// ── Charter (SKILL.md) Page ───────────────────────────

let _charterContent = '';

async function openCharterPage() {
  const charterPage = document.getElementById('charter-page');
  const charterPageContent = document.getElementById('charter-page-content');
  const mainSections = document.getElementById('main-sections');
  if (!charterPage || !charterPageContent) return;

  if (mainSections) mainSections.classList.add('dimmed');
  charterPageContent.innerHTML = '<div class="empty-state">Loading...</div>';

  requestAnimationFrame(() => {
    charterPage.classList.add('visible');
  });

  try {
    const res = await API.getCharter();
    if (res.code === 0 && res.data) {
      _charterContent = res.data.content;
      charterPageContent.innerHTML = renderCharterPage(_charterContent);
      charterPage.scrollTop = 0;
    } else {
      charterPageContent.innerHTML = `<div class="empty-state">Failed to load: ${res.message}</div>`;
    }
  } catch (err) {
    charterPageContent.innerHTML = `<div class="empty-state">Failed to load: ${err.message}</div>`;
  }
}

function closeCharterPage() {
  const charterPage = document.getElementById('charter-page');
  const mainSections = document.getElementById('main-sections');

  if (charterPage) charterPage.classList.remove('visible');
  if (mainSections) mainSections.classList.remove('dimmed');
}

function toggleCharterEdit() {
  const viewEl = document.getElementById('charter-view');
  const editEl = document.getElementById('charter-edit');
  const editBtn = document.querySelector('[data-action="toggle-charter-edit"]');
  if (!viewEl || !editEl) return;

  viewEl.classList.add('hidden');
  editEl.classList.remove('hidden');
  if (editBtn) editBtn.classList.add('hidden');

  const editor = document.getElementById('charter-editor');
  if (editor) editor.focus();
}

function cancelCharterEdit() {
  const viewEl = document.getElementById('charter-view');
  const editEl = document.getElementById('charter-edit');
  const editBtn = document.querySelector('[data-action="toggle-charter-edit"]');
  if (!viewEl || !editEl) return;

  const editor = document.getElementById('charter-editor');
  if (editor) editor.value = _charterContent;

  editEl.classList.add('hidden');
  viewEl.classList.remove('hidden');
  if (editBtn) editBtn.classList.remove('hidden');
}

async function saveCharter() {
  const editor = document.getElementById('charter-editor');
  if (!editor) return;
  const newContent = editor.value;
  const res = await API.saveCharter(newContent);
  if (res.code === 0) {
    _charterContent = newContent;
    const viewEl = document.getElementById('charter-view');
    if (viewEl) viewEl.innerHTML = renderCharterMarkdown(newContent);
    cancelCharterEdit();
  } else {
    alert(`Save failed: ${res.message}`);
  }
}
