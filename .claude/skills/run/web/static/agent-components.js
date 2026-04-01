/* Agent UI Components — cards, page, avatar, memory, records */

// ── Avatar ───────────────────────────────────────────

// 水墨风配色：每个 agent 映射到不同的古色
const AGENT_COLORS = {
  chief_assistant:     { bg: 'linear-gradient(135deg, #2c1810, #4a2c17)', text: '#e8d5b7' },
  executor:   { bg: 'linear-gradient(135deg, #1a3c5e, #2e5a7a)', text: '#c8dbe8' },
  reviewer:   { bg: 'linear-gradient(135deg, #3d2b1f, #5a3e2b)', text: '#d4c4a8' },
  researcher: { bg: 'linear-gradient(135deg, #2d4a3e, #3e6354)', text: '#b8d4c8' },
  analyst:    { bg: 'linear-gradient(135deg, #4a1942, #6b2d5b)', text: '#dbb8d4' },
  architect:  { bg: 'linear-gradient(135deg, #1a1a2e, #2d2d44)', text: '#b8b8d4' },
  devops:     { bg: 'linear-gradient(135deg, #2e3d1a, #4a5a2d)', text: '#c8d4a8' },
  writer:     { bg: 'linear-gradient(135deg, #5a1a1a, #7a2d2d)', text: '#e8c8c8' },
  messenger:  { bg: 'linear-gradient(135deg, #1a4a4a, #2d6363)', text: '#b8dede' },
  tester:     { bg: 'linear-gradient(135deg, #4a3800, #7a5c00)', text: '#f0d060' },
};
const DEFAULT_COLOR = { bg: 'linear-gradient(135deg, #2c2c2c, #4a4a4a)', text: '#d4d4d4' };

function renderAvatar(name, size) {
  const sizeClass = size === 'lg' ? 'avatar-lg' : 'avatar-sm';
  const colors = AGENT_COLORS[name] || DEFAULT_COLOR;
  const roleLabel = getRoleLabel(name);
  const fullLabel = roleLabel || (name && name[0]) || '臣';
  const ch = size === 'lg'
    ? fullLabel
    : ((roleLabel && roleLabel[0]) || (name && name[0]) || '臣');
  const extraStyle = (size === 'lg' && ch.length >= 2)
    ? `font-size:${Math.min(22, Math.floor(40 / ch.length))}px;letter-spacing:-0.5px;`
    : '';
  return `<span class="avatar ink-avatar ${sizeClass}" style="background:${colors.bg};color:${colors.text};${extraStyle}" title="${escapeHtml(name || '')}">${escapeHtml(ch)}</span>`;
}

// ── Status Helpers ──────────────────────────────────

const STATUS_ICONS = {
  pending: '<span class="status-dot status-dot-pending"></span>',
  in_progress: '<span class="status-dot status-dot-in_progress"></span>',
  completed: '<span class="status-dot status-dot-completed"></span>',
  failed: '<span class="status-dot status-dot-failed"></span>',
  cancelled: '<span class="status-dot status-dot-cancelled"></span>',
  skipped: '<span class="status-dot status-dot-skipped"></span>',
};

function renderStatusBadge(status) {
  return `<span class="badge badge-${status}">${STATUS_ICONS[status] || ''} ${status}</span>`;
}

function renderTypeBadge(type) {
  return `<span class="badge badge-type-${type}">${type}</span>`;
}

// ── Agent Definition Renderer ─────────────────────

function renderAgentDefinition(rawContent) {
  const { meta, body } = parseAgentContent(rawContent);

  let metaCardHtml = '';
  if (meta && Object.keys(meta).length > 0) {
    metaCardHtml = `
      <div class="agent-meta-card">
        ${meta.name ? `<div class="meta-name">${escapeHtml(meta.name)}</div>` : ''}
        ${meta.description ? `<div class="meta-desc">${escapeHtml(meta.description)}</div>` : ''}
      </div>
    `;
  }

  const mdHtml = (typeof marked !== 'undefined' && body)
    ? marked.parse(body)
    : escapeHtml(body);

  return `${metaCardHtml}<div class="agent-md-body">${mdHtml}</div>`;
}

// ── Agent Card (left panel list item) ─────────────

function renderAgentCard(agent) {
  const displayName = getDisplayName(agent.name);
  const subLabel = getSubLabel(agent.name);
  const isActive = agent.status === 'active';
  const activeClass = isActive ? 'active' : '';
  const inactiveClass = isActive ? '' : ' inactive';
  return `
    <div class="glass-card clickable agent-card${inactiveClass}" data-action="open-agent" data-agent="${agent.name}">
      ${renderAvatar(agent.name, 'sm')}
      <div class="agent-name" style="flex:1">${escapeHtml(displayName)}</div>
      ${subLabel ? `<div class="agent-role-label">${escapeHtml(subLabel)}</div>` : ''}
      <button class="agent-status-toggle ${activeClass}" data-action="toggle-agent-status" data-agent="${agent.name}" title="${isActive ? '点击闲置' : '点击激活'}"></button>
    </div>
  `;
}

function renderAgentAddButton() {
  return `
    <div class="glass-card clickable agent-card agent-card-add" data-action="show-create-agent">
      +
    </div>
  `;
}

// ── Agent Detail Page ─────────────────────────────

function renderAgentPage(agent, memory, records) {
  const memoryHtml = memory ? renderMemoryItems(memory.items || [], agent.name) : '<div class="empty-state">No memory loaded</div>';
  const recordsHtml = records && records.length ? renderRecordList(records) : '<div class="empty-state">No records</div>';
  const displayName = getDisplayName(agent.name);
  const subLabel = getSubLabel(agent.name);

  return `
    <div class="agent-page-header">
      <button class="agent-page-back" data-action="close-agent-page">← 返回</button>
      ${renderAvatar(agent.name, 'lg')}
      <div class="agent-page-name-block">
        <div class="agent-page-name-row">
          <span class="agent-page-name" id="alias-display-${agent.name}">${escapeHtml(displayName)}</span>
          ${subLabel ? `<span class="agent-page-role">${escapeHtml(subLabel)}</span>` : ''}
          <button class="alias-edit-icon" data-action="toggle-alias-edit" data-agent="${agent.name}" title="设置别名">✏️</button>
        </div>
        <div class="alias-edit-group hidden" id="alias-edit-group-${agent.name}">
          <input class="alias-input" id="alias-input-${agent.name}" value="${escapeHtml(getRoleLabel(agent.name))}" placeholder="输入别名（留空则显示角色名）">
          <button class="btn-primary btn-sm" data-action="save-alias" data-agent="${agent.name}">确认</button>
          <button class="btn-secondary btn-sm" data-action="cancel-alias-edit" data-agent="${agent.name}">取消</button>
        </div>
      </div>
    </div>

    <div class="agent-page-columns">
      <div class="agent-col-left">
        <div class="agent-section">
          <div class="agent-section-title-row">
            <span class="agent-section-title">思危</span>
            <button class="btn-edit" data-action="toggle-agent-edit" data-agent="${agent.name}">Edit</button>
          </div>
          <div class="agent-page-body">
            <div class="agent-definition-view" id="agent-view-${agent.name}">${renderAgentDefinition(agent.full_content)}</div>
            <div class="agent-definition-edit hidden" id="agent-edit-${agent.name}">
              <textarea class="agent-editor" id="agent-editor-${agent.name}">${escapeHtml(agent.full_content || '')}</textarea>
              <div class="agent-page-toolbar">
                ${agent.name !== 'chief_assistant' ? `<button class="btn-danger btn-sm" data-action="retire-agent" data-agent="${agent.name}">Retire</button>` : ''}
                <button class="btn-secondary btn-sm" data-action="cancel-agent-edit" data-agent="${agent.name}">Cancel</button>
                <button class="btn-primary btn-sm" data-action="save-agent" data-agent="${agent.name}">Save</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="agent-col-right">
        <div class="agent-section agent-section-memory">
          <div class="agent-section-title-row">
            <span class="agent-section-title">思退</span>
            <button class="refresh-btn refresh-btn-sm" id="refresh-memory-btn" data-action="refresh-memory" data-agent="${agent.name}" title="刷新记忆">↺</button>
          </div>
          <div class="agent-page-body agent-memory-body">
            ${memoryHtml}
          </div>
        </div>

        <div class="agent-section agent-section-records">
          <div class="agent-section-title-row">
            <span class="agent-section-title">思变</span>
            <button class="refresh-btn refresh-btn-sm" id="refresh-records-btn" data-action="refresh-records" data-agent="${agent.name}" title="刷新记录">↺</button>
          </div>
          <div class="agent-page-body agent-records-body">
            ${recordsHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Category color hash helper ─────────────────────

function _categoryColor(category) {
  let hash = 5381;
  for (let i = 0; i < category.length; i++) {
    hash = ((hash << 5) + hash + category.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

// ── Memory Items ──────────────────────────────────

function renderMemoryItems(items, agentName) {
  if (!items || items.length === 0) {
    return '<div class="empty-state">No memory items</div>';
  }

  const groups = {};
  const NO_CAT = '__uncategorized__';
  items.forEach((item, idx) => {
    let category = NO_CAT;
    let text = item;
    const catMatch = item.match(/^[\u3010](.+?)[\u3011](.*)$/);
    if (catMatch) {
      category = catMatch[1];
      text = catMatch[2].trim();
    }
    if (!groups[category]) groups[category] = [];
    groups[category].push({ text, item, idx });
  });

  let html = '<div class="memory-list">';
  for (const [category, entries] of Object.entries(groups)) {
    const isNoCat = category === NO_CAT;
    const color = isNoCat ? '#86868b' : _categoryColor(category);
    html += `<div class="memory-group">`;
    if (!isNoCat) {
      html += `<div class="memory-group-title">
        <span class="memory-category-badge" style="background:${color}20;color:${color};border-color:${color}40">${escapeHtml(category)}</span>
      </div>`;
    }
    entries.forEach(({ text, item, idx }) => {
      html += `
        <div class="memory-item" data-idx="${idx}">
          <div class="memory-text">${escapeHtml(text)}</div>
          <button class="memory-delete-btn" data-action="delete-memory-item" data-agent="${agentName}" data-item="${escapeHtml(item)}" title="删除">×</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

// ── Record List ───────────────────────────────────

function renderRecordList(records) {
  if (!records || records.length === 0) {
    return '<div class="empty-state">No records</div>';
  }

  let html = '<div class="timeline">';
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    const tagsHtml = (r.tags || []).map(t => `<span class="record-tag">${escapeHtml(t)}</span>`).join('');
    html += `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-body">
          <div class="record-ts">${formatTime(r.ts) || ''}</div>
          <div class="record-content">${escapeHtml(r.content || '')}</div>
          ${tagsHtml ? `<div class="record-tags">${tagsHtml}</div>` : ''}
        </div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

// ── Agent Create Form (Modal) ────────────────────

function generateAgentContent(name, description, expertise, tags) {
  const titleName = name
    ? name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'New Agent';
  const frontmatter = `---
name: ${name || ''}
description: "${description || ''}"
role: worker
status: active
expertise: "${expertise || ''}"
tags: "${tags || ''}"
---`;

  const body = `
# ${titleName}

## 职责
${description || '描述该 agent 的职责。'}

## 专长领域
${expertise || '列出专长领域，逗号分隔。'}

## 工作原则
- 执行前必读自己的记忆（memory.md + 最近 records）
- 执行后必写记忆（add-record + 按需 update-memory）
- 可按需读取 attachments/ 下的共享知识文件
- 严格完成分配的子任务，不超出职责范围
`;

  return frontmatter + body;
}

function renderAgentCreateForm() {
  return `
    <div class="modal-title">Create New Agent</div>
    <div class="form-group">
      <label class="form-label">复制自（继承内容）</label>
      <select class="input-field" id="new-agent-template">
        <option value="">— none (blank template) —</option>
      </select>
      <div class="form-hint">选择后将继承该 agent 的描述、专长、标签和内容</div>
    </div>
    <div class="form-group">
      <label class="form-label">Name <span class="form-hint">（系统内部识别用，仅小写字母/数字/连字符）</span></label>
      <input class="input-field" id="new-agent-name" placeholder="lowercase-with-dashes">
    </div>
    <div class="form-group">
      <label class="form-label">别名 <span class="form-hint">（可选，仅在网页上显示，留空则显示原名）</span></label>
      <input class="input-field" id="new-agent-alias" placeholder="如：张居正、海瑞...">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input class="input-field" id="new-agent-desc" placeholder="What does this agent do?">
    </div>
    <div class="form-group">
      <label class="form-label">Expertise</label>
      <input class="input-field" id="new-agent-expertise" placeholder="comma-separated areas">
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <input class="input-field" id="new-agent-tags" placeholder="comma-separated tags">
    </div>
    <div class="form-group">
      <label class="form-label">Full Content (editable)</label>
      <textarea class="input-field agent-create-content" id="new-agent-content" rows="14" placeholder="Preview of agent file content..."></textarea>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn-primary" data-action="create-agent">Create</button>
    </div>
  `;
}
