/* components.js — re-exports from split modules.
 *
 * This file is kept for backward compatibility.
 * All logic has been moved to:
 *   utils.js             — escapeHtml, formatTime, truncate, parseAgentContent, labels, highlightConclusion
 *   agent-components.js  — renderAvatar, renderAgentCard, renderAgentPage, renderMemoryItems, renderRecordList, renderAgentCreateForm
 *   task-components.js   — renderTaskCard, renderTaskTimeline, renderTaskDetail, renderPendingTasksLeft, renderTaskForm
 *   workspace-components.js — renderAgentWorkspace, renderWorkspaceAgent, renderCharterButton, renderCharterPage
 *
 * Load order in HTML:
 *   utils.js → agent-components.js → task-components.js → workspace-components.js
 */
