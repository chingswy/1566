/* Workspace rendering helpers — SVG lines, dispatch detection, scroll animation, popover */

// ── Workspace Connection Lines ────────────────────────

function drawWorkspaceLines(activeTasks) {
  const svg = document.getElementById('workspace-lines');
  if (!svg) return;

  const workspace = svg.closest('.workspace');
  if (!workspace) return;

  const chiefEl = workspace.querySelector('.workspace-chief-assistant-row .ws-agent');
  const workerEls = workspace.querySelectorAll('.workspace-workers-row .ws-agent');
  const testerEl = workspace.querySelector('.workspace-tester-row .ws-agent');

  if (!chiefEl || workerEls.length === 0) {
    svg.innerHTML = '';
    return;
  }

  // Build set of busy worker names from in_progress task logs
  const busyAgents = new Set();
  (activeTasks || []).forEach(task => {
    if (task.status !== 'in_progress') return;
    const logs = task.logs || [];
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].action === 'dispatch' && logs[i].agent_name) {
        busyAgents.add(logs[i].agent_name);
        break;
      }
    }
  });

  const wRect = workspace.getBoundingClientRect();
  const cRect = chiefEl.getBoundingClientRect();
  const lx = cRect.left + cRect.width / 2 - wRect.left;
  const ly = cRect.top + cRect.height / 2 - wRect.top;

  // Cache all worker rects in one pass to avoid double reflow queries
  const workerRects = Array.from(workerEls).map(wEl => ({
    el: wEl,
    rect: wEl.getBoundingClientRect(),
    agentName: wEl.dataset.agent,
  }));

  let lines = '';

  // Chief → each Worker (solid lines)
  workerRects.forEach(({ rect: r, agentName }) => {
    const wx = r.left + r.width / 2 - wRect.left;
    const wy = r.top + r.height / 2 - wRect.top;
    const isBusy = busyAgents.has(agentName);
    lines += `<line class="workspace-line${isBusy ? ' line-busy' : ''}" x1="${lx}" y1="${ly}" x2="${wx}" y2="${wy}"/>`;
  });

  // Each Worker → Tester (dashed lines converging)
  if (testerEl) {
    const tr = testerEl.getBoundingClientRect();
    const tx = tr.left + tr.width / 2 - wRect.left;
    const ty = tr.top + tr.height / 2 - wRect.top;
    workerRects.forEach(({ rect: r }) => {
      const wx = r.left + r.width / 2 - wRect.left;
      const wy = r.top + r.height / 2 - wRect.top;
      lines += `<line class="workspace-line workspace-line-to-tester" stroke-dasharray="4,3" x1="${wx}" y1="${wy}" x2="${tx}" y2="${ty}"/>`;
    });
  }

  svg.innerHTML = lines;
}

// ── Dispatch Detection & Scroll Animation ────────────

function detectNewDispatches(oldTasks, newTasks) {
  const dispatches = [];
  if (!oldTasks || oldTasks.length === 0) return dispatches;

  const oldLogCounts = {};
  (oldTasks || []).forEach(t => {
    oldLogCounts[t.id] = (t.logs || []).length;
  });

  newTasks.forEach(task => {
    const logs = task.logs || [];
    const oldCount = oldLogCounts[task.id] || 0;
    for (let i = oldCount; i < logs.length; i++) {
      if (logs[i].action === 'dispatch' && logs[i].agent_name) {
        dispatches.push({ agentName: logs[i].agent_name, taskId: task.id });
      }
    }
  });

  return dispatches;
}

function animateScrollDecree(fromAgent, toAgent) {
  const workspace = document.querySelector('.workspace');
  if (!workspace) return;

  const fromEl = workspace.querySelector(`[data-agent="${fromAgent}"]`);
  const toEl = workspace.querySelector(`[data-agent="${toAgent}"]`);
  if (!fromEl || !toEl) return;

  const wRect = workspace.getBoundingClientRect();
  const fRect = fromEl.getBoundingClientRect();
  const tRect = toEl.getBoundingClientRect();

  const scroll = document.createElement('span');
  scroll.className = 'scroll-decree';
  scroll.textContent = '\uD83D\uDCDC';

  const startX = fRect.left + fRect.width / 2 - wRect.left;
  const startY = fRect.top + fRect.height / 2 - wRect.top;
  const endX = tRect.left + tRect.width / 2 - wRect.left;
  const endY = tRect.top + tRect.height / 2 - wRect.top;

  scroll.style.setProperty('--start-x', startX + 'px');
  scroll.style.setProperty('--start-y', startY + 'px');
  scroll.style.setProperty('--end-x', endX + 'px');
  scroll.style.setProperty('--end-y', endY + 'px');
  scroll.style.left = '0';
  scroll.style.top = '0';

  workspace.appendChild(scroll);
  scroll.addEventListener('animationend', () => scroll.remove());
}

// ── Agent Task Popover ────────────────────────────────

async function toggleAgentTaskPopover(agentName, anchorEl) {
  const popover = document.getElementById('ws-task-popover');
  if (!popover) return;

  if (!popover.classList.contains('hidden') && popover.dataset.agent === agentName) {
    popover.classList.add('hidden');
    popover.dataset.agent = '';
    const backdrop = document.getElementById('ws-popover-backdrop');
    if (backdrop) backdrop.remove();
    return;
  }

  popover.dataset.agent = agentName;

  if (anchorEl) {
    const aRect = anchorEl.getBoundingClientRect();
    const popWidth = Math.min(480, window.innerWidth - 16);
    let left = aRect.left + aRect.width / 2 - popWidth / 2;
    let top = aRect.bottom + 10;

    if (left < 8) left = 8;
    if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - popWidth - 8;
    if (top + 480 > window.innerHeight) top = aRect.top - 480 - 10;

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  let backdrop = document.getElementById('ws-popover-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'ws-popover-backdrop';
    backdrop.className = 'ws-popover-backdrop';
    backdrop.addEventListener('click', () => {
      popover.classList.add('hidden');
      popover.dataset.agent = '';
      backdrop.remove();
    });
    document.body.appendChild(backdrop);
  }

  const agentTasks = findAgentTasks(agentName);
  const toShow = agentTasks.slice(0, 5);

  if (agentTasks.length === 0) {
    popover.innerHTML = `<div class="ws-popover-body"><div class="empty-state" style="padding:12px 0">暂无相关任务</div></div>`;
  } else {
    popover.innerHTML = `<div class="ws-popover-body">${toShow.map(t => renderTaskCard(t, false, 'pop-', true, agentName)).join('')}</div>`;
  }

  popover.classList.remove('hidden');
}

function findAgentTasks(agentName) {
  const matched = [];
  state.tasks.forEach(task => {
    if (agentName === 'chief_assistant') {
      matched.push(task);
      return;
    }
    const logs = task.logs || [];
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].agent_name === agentName) {
        matched.push(task);
        break;
      }
    }
  });
  matched.sort((a, b) => {
    const ta = new Date((a.updated_at || a.created_at || '').replace(' ', 'T'));
    const tb = new Date((b.updated_at || b.created_at || '').replace(' ', 'T'));
    return tb - ta;
  });
  return matched;
}
