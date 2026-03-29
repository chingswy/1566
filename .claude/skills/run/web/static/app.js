/* Main Application — state, init, rendering, event delegation.
 *
 * Load order (see index.html):
 *   api.js → utils.js → agent-components.js → task-components.js
 *   → workspace-components.js → workspace-logic.js
 *   → agent-actions.js → task-actions.js → app.js
 */

// ── Application State ────────────────────────────────

const state = {
  agents: [],
  tasks: [],
  expandedAgent: null,
  expandedTask: null,
  expandedCadoc: null,
  agentDetails: {},
  memoryVotes: {},
};

// ── Initialization ───────────────────────────────────

async function init() {
  await loadAgentLabels();
  await Promise.all([loadAgents(), loadTasks()]);
}

// ── Data Loading ─────────────────────────────────────

function _spinRefreshBtn(btnId, spinning) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (spinning) btn.classList.add('spinning');
  else btn.classList.remove('spinning');
}

async function loadAgents(triggerId) {
  if (triggerId) _spinRefreshBtn(triggerId, true);
  try {
    const res = await API.listAgents();
    if (res.code === 0 && res.data) {
      state.agents = res.data;
      renderAgentsSection();
      renderTasksSection();
    }
  } finally {
    if (triggerId) _spinRefreshBtn(triggerId, false);
  }
}

async function loadTasks(triggerId) {
  if (triggerId) _spinRefreshBtn(triggerId, true);
  try {
    const res = await API.listTasks();
    if (res.code === 0 && res.data) {
      const newTasks = res.data;
      const newDispatches = detectNewDispatches(state.tasks, newTasks);

      state.tasks = newTasks;
      renderTasksSection();

      if (newDispatches.length > 0) {
        requestAnimationFrame(() => {
          newDispatches.forEach(d => {
            animateScrollDecree('chief_assistant', d.agentName);
          });
        });
      }
    }
  } finally {
    if (triggerId) _spinRefreshBtn(triggerId, false);
  }
}

// ── Rendering ────────────────────────────────────────

function syncPendingTasksLeft() {
  const container = document.getElementById('pending-tasks-left-container');
  if (!container) return;
  container.innerHTML = renderPendingTasksLeft(state.tasks.filter(t => t.status === 'pending'));
  if (state.expandedCadoc !== null) {
    const el = document.getElementById(`cadoc-edit-${state.expandedCadoc}`);
    if (el) el.classList.remove('hidden');
    else state.expandedCadoc = null;
  }
}

function renderAgentsSection() {
  const container = document.getElementById('agents-container');
  if (!container) return;

  const sorted = [...state.agents].sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));

  let grid = container.querySelector('.agents-grid');
  if (!grid) {
    let html = '<div class="agents-grid">';
    sorted.forEach(agent => { html += renderAgentCard(agent); });
    html += renderAgentAddButton();
    html += '</div>';
    html += renderCharterButton();
    container.innerHTML = html;
  } else {
    const existingCards = {};
    grid.querySelectorAll('[data-action="open-agent"]').forEach(el => {
      existingCards[el.dataset.agent] = el;
    });

    const addBtn = grid.querySelector('[data-action="show-create-agent"]');
    sorted.forEach(agent => {
      const newHtml = renderAgentCard(agent);
      const existing = existingCards[agent.name];
      if (!existing) {
        const tmp = document.createElement('div');
        tmp.innerHTML = newHtml.trim();
        const newEl = tmp.firstElementChild;
        grid.insertBefore(newEl, addBtn || null);
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = newHtml.trim();
        const newEl = tmp.firstElementChild;
        if (existing.outerHTML !== newEl.outerHTML) {
          grid.replaceChild(newEl, existing);
        }
        delete existingCards[agent.name];
      }
    });
    Object.values(existingCards).forEach(el => el.remove());
  }

  syncPendingTasksLeft();
}

function renderTasksSection() {
  const activeContainer = document.getElementById('active-tasks-container');
  const historyContainer = document.getElementById('history-tasks-container');
  if (!activeContainer) return;

  const active = state.tasks.filter(t => t.status === 'in_progress' || t.status === 'pending');
  const history = state.tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');

  if (state.agents.length === 0 && active.length === 0) {
    activeContainer.innerHTML = '<div class="empty-state">天下已安已治矣</div>';
  } else {
    activeContainer.innerHTML = renderAgentWorkspace(state.agents, active);
    requestAnimationFrame(() => drawWorkspaceLines(active));
  }

  if (historyContainer) {
    if (history.length === 0) {
      historyContainer.innerHTML = '<div class="empty-state">No completed tasks</div>';
    } else {
      historyContainer.innerHTML = '<div class="task-list">' + history.map(t => renderTaskCard(t)).join('') + '</div>';
    }
  }

  if (state.expandedTask !== null) {
    const detailEl = document.getElementById(`task-detail-${state.expandedTask}`);
    if (detailEl) {
      detailEl.classList.add('open');
      const task = state.tasks.find(t => t.id === state.expandedTask);
      if (task) detailEl.innerHTML = renderTaskDetail(task);
    } else {
      state.expandedTask = null;
    }
  }

  syncPendingTasksLeft();
}

// ── Event Handling (Delegation) ──────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const formContainer = document.getElementById('task-form-container');
  if (formContainer) {
    formContainer.innerHTML = renderTaskForm();
  }

  init();

  document.getElementById('app').addEventListener('click', handleClick);

  document.getElementById('app').addEventListener('keydown', (e) => {
    if (e.target.id === 'task-input' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitTask();
    }
  });
});

async function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;

  switch (action) {
    case 'toggle-alias-edit': {
      const group = document.getElementById(`alias-edit-group-${btn.dataset.agent}`);
      if (group) group.classList.toggle('hidden');
      break;
    }

    case 'cancel-alias-edit': {
      const group = document.getElementById(`alias-edit-group-${btn.dataset.agent}`);
      if (group) group.classList.add('hidden');
      break;
    }

    case 'save-alias': {
      const name = btn.dataset.agent;
      const input = document.getElementById(`alias-input-${name}`);
      if (input) {
        await API.setAgentLabel(name, input.value);
        await loadAgentLabels();
        const group = document.getElementById(`alias-edit-group-${name}`);
        if (group) group.classList.add('hidden');
        renderAgentsSection();
        const display = document.getElementById(`alias-display-${name}`);
        if (display) display.textContent = getDisplayName(name);
      }
      break;
    }

    case 'open-agent':
      window.location.href = `/agent/${btn.dataset.agent}`;
      break;

    case 'toggle-agent-tasks':
      await toggleAgentTaskPopover(btn.dataset.agent, btn);
      break;

    case 'close-agent-page':
      closeAgentPage();
      break;

    case 'save-agent':
      await saveAgent(btn.dataset.agent);
      break;

    case 'retire-agent':
      if (confirm(`Retire agent "${btn.dataset.agent}"? Memory will be merged into chief_assistant.`)) {
        await retireAgent(btn.dataset.agent);
      }
      break;

    case 'toggle-agent-edit':
      toggleAgentEdit(btn.dataset.agent);
      break;

    case 'cancel-agent-edit':
      cancelAgentEdit(btn.dataset.agent);
      break;

    case 'show-create-agent':
      showCreateAgentModal();
      break;

    case 'create-agent':
      await createAgent();
      break;

    case 'close-modal':
      closeModal();
      break;

    case 'vote-memory':
      toggleVote(btn.dataset.agent, parseInt(btn.dataset.idx), btn.dataset.vote);
      break;

    case 'submit-feedback':
      await submitMemoryFeedback(btn.dataset.agent);
      break;

    case 'submit-task':
      await submitTask();
      break;

    case 'toggle-cadoc': {
      e.stopPropagation();
      const taskId = parseInt(btn.dataset.taskId);
      const editEl = document.getElementById(`cadoc-edit-${taskId}`);
      document.querySelectorAll('.cadoc-edit').forEach(el => {
        if (el.id !== `cadoc-edit-${taskId}`) el.classList.add('hidden');
      });
      if (editEl) {
        const willOpen = editEl.classList.contains('hidden');
        editEl.classList.toggle('hidden');
        state.expandedCadoc = willOpen ? taskId : null;
      }
      break;
    }

    case 'toggle-task':
      await toggleTaskDetail(parseInt(btn.closest('[data-task-id]').dataset.taskId));
      break;

    case 'save-task-edit':
      e.stopPropagation();
      await saveTaskEdit(parseInt(btn.dataset.taskId));
      break;

    case 'cancel-task':
      e.stopPropagation();
      if (confirm('Cancel this task?')) {
        state.expandedCadoc = null;
        await API.updateTask(parseInt(btn.dataset.taskId), { status: 'cancelled' });
        await loadTasks();
      }
      break;

    case 'delete-task':
      e.stopPropagation();
      if (confirm('Delete this task permanently?')) {
        await API.deleteTask(parseInt(btn.dataset.taskId));
        await loadTasks();
      }
      break;

    case 'delete-memory-item': {
      e.stopPropagation();
      const agentName = btn.dataset.agent;
      const item = btn.dataset.item;
      await API.submitFeedback(agentName, [{ item, vote: 'down' }], '');
      const res = await API.getAgentMemory(agentName);
      if (res.code === 0 && res.data) {
        const memBody = document.querySelector('.agent-memory-body');
        if (memBody) memBody.innerHTML = renderMemoryItems(res.data.items || [], agentName);
        if (state.agentDetails[agentName]) state.agentDetails[agentName].memory = res.data;
      }
      break;
    }

    case 'toggle-agent-status': {
      e.stopPropagation();
      const name = btn.dataset.agent;
      const res = await API.toggleAgentActive(name);
      if (res.code === 0) {
        await loadAgents();
      }
      break;
    }

    case 'refresh-agents':
      await loadAgents(btn.id || 'refresh-agents-btn');
      break;

    case 'refresh-workspace':
      await loadTasks(btn.id || 'refresh-workspace-btn');
      break;

    case 'refresh-history':
      await loadTasks(btn.id || 'refresh-history-btn');
      break;

    case 'refresh-memory': {
      const agentName = btn.dataset.agent;
      const btnId = btn.id || 'refresh-memory-btn';
      _spinRefreshBtn(btnId, true);
      try {
        const res = await API.getAgentMemory(agentName);
        if (res.code === 0 && res.data) {
          const memBody = document.querySelector('.agent-memory-body');
          if (memBody) memBody.innerHTML = renderMemoryItems(res.data.items || [], agentName);
          if (state.agentDetails[agentName]) state.agentDetails[agentName].memory = res.data;
        }
      } finally {
        _spinRefreshBtn(btnId, false);
      }
      break;
    }

    case 'refresh-records': {
      const agentName = btn.dataset.agent;
      const btnId = btn.id || 'refresh-records-btn';
      _spinRefreshBtn(btnId, true);
      try {
        const res = await API.getAgentRecords(agentName);
        if (res.code === 0 && res.data) {
          const recBody = document.querySelector('.agent-records-body');
          if (recBody) recBody.innerHTML = renderRecordList(res.data);
          if (state.agentDetails[agentName]) state.agentDetails[agentName].records = res.data;
        }
      } finally {
        _spinRefreshBtn(btnId, false);
      }
      break;
    }

    case 'open-charter':
      await openCharterPage();
      break;

    case 'close-charter-page':
      closeCharterPage();
      break;

    case 'toggle-charter-edit':
      toggleCharterEdit();
      break;

    case 'cancel-charter-edit':
      cancelCharterEdit();
      break;

    case 'save-charter':
      await saveCharter();
      break;
  }
}
