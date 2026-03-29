/* Utility helpers — escaping, formatting, label lookups */

// ── HTML Escape ──────────────────────────────────────

const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => _escMap[c]);
}

// ── Time Formatting ──────────────────────────────────

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T'));
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ── Text Helpers ─────────────────────────────────────

function truncate(text, len, ellipsis = '…') {
  if (!text) return '';
  return text.length > len ? text.substring(0, len) + ellipsis : text;
}

function getTaskTitle(task, len = 20) {
  return task.caption ? task.caption : truncate(task.content, len);
}

// ── YAML Frontmatter Parser ──────────────────────────

function parseAgentContent(rawContent) {
  const raw = rawContent || '';
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return { meta: null, body: raw };

  const metaLines = fmMatch[1].split('\n');
  const meta = {};
  metaLines.forEach(line => {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?$/);
    if (m) meta[m[1]] = m[2].trim();
  });
  return { meta, body: fmMatch[2].trim() };
}

// ── Role Label (loaded from /api/agent-labels) ──────

let _agentLabels = {};

async function loadAgentLabels() {
  try {
    const res = await API.request('GET', '/api/agent-labels');
    _agentLabels = (res.code === 0 && res.data) ? res.data : {};
  } catch (e) {
    _agentLabels = {};
  }
}

function getRoleLabel(agentName) {
  return _agentLabels[agentName] || '';
}

function getDisplayName(agentName) {
  return getRoleLabel(agentName) || agentName;
}

function getSubLabel(agentName) {
  const display = getDisplayName(agentName);
  return display !== agentName ? agentName : '';
}

// ── Conclusion Highlight ─────────────────────────────

function highlightConclusion(escapedText) {
  let result = escapedText.replace(/`([^`]+)`/g, '<code class="hl-code">$1</code>');
  result = result.replace(/(?<![&<\w])([A-Za-z0-9_\-./]+\.(js|ts|jsx|tsx|py|css|html|json|yaml|yml|md|toml|sh|go|rs|java|c|cpp|h|hpp|rb|php|sql|env|lock|txt|xml|vue|svelte))\b/g, '<span class="hl-file">$1</span>');
  result = result.replace(/\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*|[A-Z][a-z]+[A-Z][a-zA-Z0-9]*)\b/g, function(match) {
    return '<span class="hl-ident">' + match + '</span>';
  });
  return result;
}
