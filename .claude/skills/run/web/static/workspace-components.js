/* Workspace & Charter Components — 朝堂式布局 + 内阁章程 */

// ── Agent Workspace (朝堂式布局) ─────────────────────

function renderAgentWorkspace(agents, activeTasks) {
  if (!agents || agents.length === 0) {
    return '<div class="empty-state">天下已安已治矣</div>';
  }

  const chief = agents.find(a => a.name === 'chief_assistant');
  const tester = agents.find(a => a.name === 'tester' && a.status === 'active');
  const workers = agents.filter(a => a.name !== 'chief_assistant' && a.name !== 'tester' && a.status === 'active');

  // Build agent→task mapping from dispatch logs
  const agentTaskMap = {};
  activeTasks.forEach(task => {
    if (task.status !== 'in_progress') return;
    const logs = task.logs || [];
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.action === 'dispatch') {
        const detail = log.detail || '';
        const dispatchMatch = detail.match(/^派发给\s+([A-Za-z_][A-Za-z0-9_]*)[\s：:]/);
        if (dispatchMatch) {
          const dispatchedAgent = dispatchMatch[1];
          agentTaskMap[dispatchedAgent] = task;
        } else {
          if (log.agent_name) agentTaskMap[log.agent_name] = task;
        }
        break;
      }
    }
  });

  const chiefHtml = chief
    ? renderWorkspaceAgent(chief, agentTaskMap[chief.name], 'right')
    : '';

  const workersHtml = workers.map((w, i) => {
    const dir = i < Math.ceil(workers.length / 2) ? 'right' : 'left';
    return renderWorkspaceAgent(w, agentTaskMap[w.name], dir);
  }).join('');

  const testerHtml = tester
    ? renderWorkspaceAgent(tester, agentTaskMap[tester.name], 'right')
    : '';

  return `
    <div class="workspace">
      <svg class="workspace-lines" id="workspace-lines"></svg>
      <div class="workspace-chief-assistant-row">
        ${chiefHtml}
      </div>
      <div class="workspace-workers-row">
        ${workersHtml}
      </div>
      ${testerHtml ? `<div class="workspace-tester-row">${testerHtml}</div>` : ''}
      <div class="workspace-scroll-overlay" id="scroll-overlay"></div>
    </div>
    <div class="ws-task-popover hidden" id="ws-task-popover"></div>
  `;
}

function renderWorkspaceAgent(agent, activeTask, bubbleDir) {
  const isInactive = agent.status === 'inactive';
  const isBusy = !!activeTask;
  const stateClass = isInactive ? 'ws-inactive' : (isBusy ? 'ws-busy' : 'ws-ready');
  const displayName = getDisplayName(agent.name);

  let bubbleHtml = '';
  if (activeTask) {
    const taskTitle = getTaskTitle(activeTask, 18);
    const dir = bubbleDir || 'right';
    bubbleHtml = `<div class="ws-bubble ws-bubble-${dir}">${escapeHtml(taskTitle)}</div>`;
  }

  return `
    <div class="ws-agent ${stateClass}" data-agent="${agent.name}" data-action="toggle-agent-tasks" title="${escapeHtml(displayName)}">
      ${renderAvatar(agent.name, 'lg')}
      ${bubbleHtml}
    </div>
  `;
}

// ── Charter (SKILL.md) Button & Page ──────────────────

function renderCharterButton() {
  return `
    <div class="glass-card clickable charter-btn" data-action="open-charter">
      <span class="charter-btn-icon">典</span>
      <span class="charter-btn-text">内阁章程</span>
    </div>
  `;
}

function renderCharterMarkdown(content) {
  if (!content) return '<div class="empty-state">No content</div>';
  const stripped = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const mdHtml = (typeof marked !== 'undefined' && stripped)
    ? marked.parse(stripped)
    : escapeHtml(stripped);
  return `<div class="agent-md-body">${mdHtml}</div>`;
}

function renderCharterPage(content) {
  return `
    <div class="agent-page-header">
      <button class="agent-page-back" data-action="close-charter-page">\u2190 返回</button>
      <span class="charter-page-icon">典</span>
      <div class="agent-page-name-block">
        <div class="agent-page-name-row">
          <span class="agent-page-name">内阁章程</span>
          <span class="agent-page-role">SKILL.md</span>
        </div>
      </div>
    </div>

    <div class="charter-page-body-wrap">
      <div class="agent-section">
        <div class="agent-section-title-row">
          <span class="agent-section-title">章程内容</span>
          <button class="btn-edit" data-action="toggle-charter-edit">修订</button>
        </div>
        <div class="agent-page-body">
          <div class="agent-definition-view" id="charter-view">${renderCharterMarkdown(content)}</div>
          <div class="agent-definition-edit hidden" id="charter-edit">
            <textarea class="agent-editor charter-editor-textarea" id="charter-editor">${escapeHtml(content || '')}</textarea>
            <div class="agent-page-toolbar">
              <button class="btn-secondary btn-sm" data-action="cancel-charter-edit">取消</button>
              <button class="btn-primary btn-sm" data-action="save-charter">保存</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
