/* Task UI Components — task cards, timeline, forms, cadoc */

// ── Task Form ────────────────────────────────────────

function renderTaskForm() {
  return `
    <div class="glass-card task-form-card">
      <textarea class="task-textarea" id="task-input" placeholder="有何旨意，请示下..."></textarea>
      <div class="task-form-actions">
        <button class="btn-primary btn-decree" data-action="submit-task">下诏</button>
      </div>
    </div>
  `;
}

// ── Task Card ─────────────────────────────────────────

function renderTaskCard(task, defaultExpanded, idPrefix, readonly, filterAgent) {
  const prefix = idPrefix || '';
  const statusIcon = STATUS_ICONS[task.status] || '';
  const time = formatTime(task.updated_at || task.created_at);
  const title = getTaskTitle(task);

  if (readonly) {
    const verdictHtml = task.verdict
      ? `<div class="task-verdict"><span class="verdict-icon">⚖</span>${highlightConclusion(escapeHtml(task.verdict))}</div>`
      : '';
    const detailContent =
      `<div class="task-detail open" id="${prefix}task-detail-${task.id}">` +
      renderTaskTimeline(task, filterAgent) +
      renderRawInputBlock(task) +
      verdictHtml +
      `</div>`;
    return `
    <div class="glass-card task-card open">
      <div class="task-header">
        <span class="task-title">${statusIcon} ${escapeHtml(title)}</span>
        <div class="task-meta">
          ${task.type === 'memory' ? renderTypeBadge('memory') : ''}
          <span class="task-time">${time}</span>
        </div>
      </div>
      ${detailContent}
    </div>
  `;
  }

  const expandedClass = defaultExpanded ? ' open' : '';
  const expandedContent = defaultExpanded
    ? `<div class="task-detail open" id="${prefix}task-detail-${task.id}">` +
      renderTaskTimeline(task) +
      renderRawInputBlock(task) +
      renderTaskActions(task, prefix) +
      `</div>`
    : `<div class="task-detail" id="${prefix}task-detail-${task.id}"></div>`;

  return `
    <div class="glass-card clickable task-card${expandedClass}" data-action="toggle-task" data-task-id="${task.id}">
      <div class="task-header">
        <span class="task-title">${statusIcon} ${escapeHtml(title)}</span>
        <div class="task-meta">
          ${task.type === 'memory' ? renderTypeBadge('memory') : ''}
          <span class="task-time">${time}</span>
        </div>
      </div>
      ${expandedContent}
    </div>
  `;
}

// ── Task Timeline ─────────────────────────────────────

function renderTaskTimeline(task, filterAgent) {
  let logs = task.logs || [];
  if (logs.length === 0) return '';

  if (filterAgent) {
    if (filterAgent === 'chief_assistant') {
      logs = logs.filter(log => log.action === 'dispatch');
    } else {
      logs = logs.filter(log => log.agent_name === filterAgent);
    }
  }
  if (logs.length === 0) return '';

  let html = '<div class="task-timeline">';
  let testerDividerInserted = false;
  logs.forEach(log => {
    const ts = log.created_at ? `<span class="tl-ts">${formatTime(log.created_at)}</span>` : '';
    if (!testerDividerInserted && log.action === 'dispatch' && log.agent_name === 'tester') {
      html += `<div class="tl-phase-divider">── 验收 ──</div>`;
      testerDividerInserted = true;
    }
    if (log.action === 'verdict') {
      html += `
        <div class="tl-item tl-verdict">
          <span class="tl-arrow">⚖</span>
          ${filterAgent ? '' : `<span class="tl-agent tl-agent-tester">${escapeHtml(getDisplayName(log.agent_name || 'tester'))}</span>`}
          <span class="tl-detail">${escapeHtml(log.detail || '')}</span>
          ${ts}
        </div>`;
    } else if (log.action === 'dispatch') {
      html += `
        <div class="tl-item tl-dispatch">
          <span class="tl-arrow tl-arrow-out">→</span>
          ${filterAgent ? '' : `<span class="tl-agent">${escapeHtml(getDisplayName(log.agent_name || 'chief_assistant'))}</span>`}
          <span class="tl-detail">${escapeHtml(log.detail || '')}</span>
          ${ts}
        </div>`;
    } else if (log.action === 'done') {
      html += `
        <div class="tl-item tl-done">
          <span class="tl-arrow tl-arrow-in">←</span>
          ${filterAgent ? '' : `<span class="tl-agent">${escapeHtml(getDisplayName(log.agent_name || ''))}</span>`}
          <span class="tl-detail">${escapeHtml(log.detail || '')}</span>
          ${ts}
        </div>`;
    } else {
      html += `
        <div class="tl-item tl-other">
          ${(!filterAgent && log.agent_name) ? `<span class="tl-agent">${escapeHtml(getDisplayName(log.agent_name))}</span>` : ''}
          <span class="tl-action">${escapeHtml(log.action)}</span>
          ${log.detail ? `<span class="tl-detail">${escapeHtml(log.detail)}</span>` : ''}
          ${ts}
        </div>`;
    }
  });
  html += '</div>';
  return html;
}

// ── Raw Input Block ───────────────────────────────────

function renderRawInputBlock(task) {
  return `
    <details class="raw-input-block">
      <summary class="raw-input-toggle">旨意</summary>
      <div class="raw-input-content">${escapeHtml(task.content)}</div>
    </details>
  `;
}

// ── Task Actions ──────────────────────────────────────

function renderTaskActions(task, idPrefix) {
  const prefix = idPrefix || '';
  let html = '';
  if (task.verdict) {
    html += `
      <div class="task-verdict">
        <span class="verdict-icon">⚖</span>${highlightConclusion(escapeHtml(task.verdict))}
      </div>
    `;
  }
  if (task.conclusion) {
    html += `
      <div class="task-conclusion">
        <div class="task-conclusion-label">${task.status === 'failed' ? '失败原因' : '执行结论'}</div>
        ${highlightConclusion(escapeHtml(task.conclusion))}
      </div>
    `;
  }
  if (task.status === 'pending') {
    html += `
      <div class="task-edit-area" id="${prefix}task-edit-area-${task.id}">
        <textarea class="task-edit-textarea" id="${prefix}task-edit-input-${task.id}">${escapeHtml(task.content)}</textarea>
        <div class="task-actions">
          <button class="btn-danger btn-sm" data-action="cancel-task" data-task-id="${task.id}">Cancel</button>
          <button class="btn-primary btn-sm" data-action="save-task-edit" data-task-id="${task.id}">Save</button>
        </div>
      </div>
    `;
  } else if (task.status === 'in_progress') {
    html += `
      <div class="task-actions">
        <button class="btn-danger btn-sm" data-action="cancel-task" data-task-id="${task.id}">Cancel</button>
      </div>
    `;
  } else {
    html += `
      <div class="task-actions">
        <button class="btn-danger btn-sm" data-action="delete-task" data-task-id="${task.id}">Delete</button>
      </div>
    `;
  }
  return html;
}

// ── Task Detail (full expand) ─────────────────────────

function renderTaskDetail(task) {
  return renderTaskTimeline(task) + renderRawInputBlock(task) + renderTaskActions(task);
}

// ── 案牍列表（左栏 pending 任务）────────────────────

function renderPendingTasksLeft(tasks) {
  let listHtml = '';
  if (!tasks || tasks.length === 0) {
    listHtml = '<div class="cadoc-empty">无积压案牍</div>';
  } else {
    listHtml = '<div class="cadoc-list">';
    tasks.forEach(task => {
      const title = getTaskTitle(task, 22);
      listHtml += `
        <div class="cadoc-item" data-action="toggle-cadoc" data-task-id="${task.id}">
          <span class="cadoc-dot"></span>
          <span class="cadoc-title">${escapeHtml(title)}</span>
        </div>
        <div class="cadoc-edit hidden" id="cadoc-edit-${task.id}">
          <textarea class="cadoc-textarea" id="task-edit-input-${task.id}">${escapeHtml(task.content)}</textarea>
          <div class="cadoc-actions">
            <button class="btn-danger btn-sm" data-action="cancel-task" data-task-id="${task.id}">撤销</button>
            <button class="btn-primary btn-sm" data-action="save-task-edit" data-task-id="${task.id}">保存</button>
          </div>
        </div>
      `;
    });
    listHtml += '</div>';
  }
  return `
    <div class="cadoc-section">
      <div class="cadoc-header">案牍</div>
      ${listHtml}
    </div>
  `;
}
