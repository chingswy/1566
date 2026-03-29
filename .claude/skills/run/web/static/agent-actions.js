/* Agent page actions — open/close, edit, create modal, memory voting */

// ── Agent Page ────────────────────────────────────────

async function openAgentPage(name) {
  const agentPage = document.getElementById('agent-page');
  const agentPageContent = document.getElementById('agent-page-content');
  const mainSections = document.getElementById('main-sections');
  if (!agentPage || !agentPageContent) return;

  if (mainSections) mainSections.classList.add('dimmed');
  agentPageContent.innerHTML = '<div class="empty-state">Loading...</div>';

  requestAnimationFrame(() => {
    agentPage.classList.add('visible');
  });

  state.expandedAgent = name;

  try {
    const [agentRes, memoryRes, recordsRes] = await Promise.all([
      API.getAgent(name),
      API.getAgentMemory(name),
      API.getAgentRecords(name),
    ]);

    const detail = {
      agent: agentRes.data || {},
      memory: memoryRes.data || {},
      records: recordsRes.data || [],
    };
    state.agentDetails[name] = detail;
    state.memoryVotes[name] = {};

    agentPageContent.innerHTML = renderAgentPage(detail.agent, detail.memory, detail.records);
    agentPage.scrollTop = 0;
  } catch (err) {
    agentPageContent.innerHTML = `<div class="empty-state">Failed to load: ${err.message}</div>`;
  }
}

function closeAgentPage() {
  const agentPage = document.getElementById('agent-page');
  const mainSections = document.getElementById('main-sections');

  state.expandedAgent = null;

  if (agentPage) agentPage.classList.remove('visible');
  if (mainSections) mainSections.classList.remove('dimmed');
}

// ── Agent Save / Retire ───────────────────────────────

async function saveAgent(name) {
  const editor = document.getElementById(`agent-editor-${name}`);
  if (!editor) return;
  const newContent = editor.value;
  const res = await API.saveAgent(name, newContent);
  if (res.code === 0) {
    if (state.agentDetails[name]) {
      state.agentDetails[name].agent.full_content = newContent;
    }
    const viewEl = document.getElementById(`agent-view-${name}`);
    if (viewEl) viewEl.innerHTML = renderAgentDefinition(newContent);
    cancelAgentEdit(name);
    await loadAgents();
  } else {
    alert(`Save failed: ${res.message}`);
  }
}

async function retireAgent(name) {
  const res = await API.retireAgent(name);
  if (res.code === 0) {
    closeAgentPage();
    await loadAgents();
  } else {
    alert(`Retire failed: ${res.message}`);
  }
}

// ── Agent Definition Edit/View Toggle ─────────────────

function toggleAgentEdit(name) {
  const viewEl = document.getElementById(`agent-view-${name}`);
  const editEl = document.getElementById(`agent-edit-${name}`);
  const editBtn = document.querySelector(`[data-action="toggle-agent-edit"][data-agent="${name}"]`);
  if (!viewEl || !editEl) return;

  viewEl.classList.add('hidden');
  editEl.classList.remove('hidden');
  if (editBtn) editBtn.classList.add('hidden');

  const editor = document.getElementById(`agent-editor-${name}`);
  if (editor) editor.focus();
}

function cancelAgentEdit(name) {
  const viewEl = document.getElementById(`agent-view-${name}`);
  const editEl = document.getElementById(`agent-edit-${name}`);
  const editBtn = document.querySelector(`[data-action="toggle-agent-edit"][data-agent="${name}"]`);
  if (!viewEl || !editEl) return;

  const detail = state.agentDetails[name];
  if (detail && detail.agent) {
    const editor = document.getElementById(`agent-editor-${name}`);
    if (editor) editor.value = detail.agent.full_content || '';
  }

  editEl.classList.add('hidden');
  viewEl.classList.remove('hidden');
  if (editBtn) editBtn.classList.remove('hidden');
}

// ── Create Agent Modal ────────────────────────────────

let _modalContentUserEdited = false;
let _modalEscapeListener = null;

function showCreateAgentModal() {
  let overlay = document.getElementById('modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal-content" id="modal-content"></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  _modalContentUserEdited = false;
  document.getElementById('modal-content').innerHTML = renderAgentCreateForm();
  requestAnimationFrame(() => overlay.classList.add('open'));

  const cancelBtn = document.getElementById('modal-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  const contentEl = document.getElementById('new-agent-content');
  if (contentEl) {
    contentEl.value = generateAgentContent('', '', '', '');
  }

  ['new-agent-name', 'new-agent-desc', 'new-agent-expertise', 'new-agent-tags'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _onModalFieldInput);
  });

  if (contentEl) {
    contentEl.addEventListener('input', () => { _modalContentUserEdited = true; });
  }

  if (_modalEscapeListener) {
    document.removeEventListener('keydown', _modalEscapeListener);
  }
  _modalEscapeListener = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', _modalEscapeListener);

  _loadModalTemplateAgents();
}

function _onModalFieldInput() {
  if (_modalContentUserEdited) return;
  const name = document.getElementById('new-agent-name')?.value.trim() || '';
  const desc = document.getElementById('new-agent-desc')?.value.trim() || '';
  const expertise = document.getElementById('new-agent-expertise')?.value.trim() || '';
  const tags = document.getElementById('new-agent-tags')?.value.trim() || '';
  const contentEl = document.getElementById('new-agent-content');
  if (contentEl) {
    contentEl.value = generateAgentContent(name, desc, expertise, tags);
  }
}

async function _loadModalTemplateAgents() {
  const select = document.getElementById('new-agent-template');
  if (!select) return;
  try {
    const res = await API.listAgents();
    if (res.code === 0 && res.data && res.data.length > 0) {
      res.data.forEach(agent => {
        const opt = document.createElement('option');
        opt.value = agent.name;
        opt.textContent = agent.name + (agent.description ? ` — ${agent.description}` : '');
        select.appendChild(opt);
      });
    }
  } catch (e) {
    // silently ignore — template dropdown is optional
  }
  select.addEventListener('change', _onModalTemplateChange);
}

async function _onModalTemplateChange(e) {
  const agentName = e.target.value;
  if (!agentName) {
    _modalContentUserEdited = false;
    _onModalFieldInput();
    ['new-agent-desc', 'new-agent-expertise', 'new-agent-tags'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    return;
  }

  try {
    const res = await API.getAgent(agentName);
    if (res.code === 0 && res.data) {
      const agent = res.data;
      const fullContent = agent.full_content || '';

      const { meta } = parseAgentContent(fullContent);
      if (meta) {
        const descEl = document.getElementById('new-agent-desc');
        const expertiseEl = document.getElementById('new-agent-expertise');
        const tagsEl = document.getElementById('new-agent-tags');
        if (descEl && meta.description) descEl.value = meta.description;
        if (expertiseEl && meta.expertise) expertiseEl.value = meta.expertise;
        if (tagsEl && meta.tags) tagsEl.value = meta.tags;
      }

      const newContent = fullContent.replace(/^(---[\s\S]*?name:\s*)([^\n]+)/m, '$1');
      const contentEl = document.getElementById('new-agent-content');
      if (contentEl) contentEl.value = newContent;
      _modalContentUserEdited = true;
    }
  } catch (err) {
    // ignore
  }
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
  if (_modalEscapeListener) {
    document.removeEventListener('keydown', _modalEscapeListener);
    _modalEscapeListener = null;
  }
}

async function createAgent() {
  const name = document.getElementById('new-agent-name')?.value.trim();
  const description = document.getElementById('new-agent-desc')?.value.trim();
  const contentEl = document.getElementById('new-agent-content');
  const fullContent = contentEl?.value.trim();

  if (!name) {
    alert('Name is required');
    return;
  }
  if (!description && !fullContent) {
    alert('Name and description are required');
    return;
  }

  let finalContent = fullContent;
  if (!finalContent) {
    const expertise = document.getElementById('new-agent-expertise')?.value.trim() || '';
    const tags = document.getElementById('new-agent-tags')?.value.trim() || '';
    finalContent = generateAgentContent(name, description, expertise, tags);
  }

  finalContent = finalContent.replace(/^(---[\s\S]*?name:\s*)([^\n]*)/m, `$1${name}`);

  const res = await API.createAgent({ name, description, full_content: finalContent });
  if (res.code === 0) {
    const alias = document.getElementById('new-agent-alias')?.value.trim() || '';
    if (alias) await API.setAgentLabel(name, alias);
    await loadAgentLabels();
    closeModal();
    await loadAgents();
  } else {
    alert(`Create failed: ${res.message}`);
  }
}

// ── Memory Voting ─────────────────────────────────────

function toggleVote(agentName, idx, vote) {
  if (!state.memoryVotes[agentName]) state.memoryVotes[agentName] = {};

  const current = state.memoryVotes[agentName][idx];
  if (current === vote) {
    delete state.memoryVotes[agentName][idx];
  } else {
    state.memoryVotes[agentName][idx] = vote;
  }

  const btns = document.querySelectorAll(`[data-action="vote-memory"][data-agent="${agentName}"][data-idx="${idx}"]`);
  btns.forEach(btn => {
    btn.classList.remove('voted-up', 'voted-down');
    const v = state.memoryVotes[agentName][idx];
    if (v === 'up' && btn.dataset.vote === 'up') btn.classList.add('voted-up');
    if (v === 'down' && btn.dataset.vote === 'down') btn.classList.add('voted-down');
  });
}

async function submitMemoryFeedback(agentName) {
  const votes = state.memoryVotes[agentName] || {};
  const items = state.agentDetails[agentName]?.memory?.items || [];
  const comment = document.getElementById(`feedback-comment-${agentName}`)?.value.trim() || '';

  const feedbacks = [];
  for (const [idx, vote] of Object.entries(votes)) {
    const item = items[parseInt(idx)];
    if (item) {
      feedbacks.push({ item, vote });
    }
  }

  if (feedbacks.length === 0 && !comment) {
    alert('Please vote on at least one item or leave a comment');
    return;
  }

  const res = await API.submitFeedback(agentName, feedbacks, comment);
  if (res.code === 0) {
    state.memoryVotes[agentName] = {};
    alert('Feedback submitted as a memory task');
    await loadTasks();
  } else {
    alert(`Submit failed: ${res.message}`);
  }
}
