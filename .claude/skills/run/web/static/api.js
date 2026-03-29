/* API Layer — wraps all backend REST calls */

const API = {
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = await res.json();
    if (data.code !== 0) {
      console.error(`API error: ${data.message}`);
    }
    return data;
  },

  // Tasks
  listTasks(params) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request('GET', `/api/tasks${qs}`);
  },
  createTask(content) {
    return this.request('POST', '/api/tasks', { content });
  },
  getTask(id) {
    return this.request('GET', `/api/tasks/${id}`);
  },
  updateTask(id, data) {
    return this.request('PUT', `/api/tasks/${id}`, data);
  },
  deleteTask(id) {
    return this.request('DELETE', `/api/tasks/${id}`);
  },

  // Agents
  listAgents() {
    return this.request('GET', '/api/agents');
  },
  getAgent(name) {
    return this.request('GET', `/api/agents/${name}`);
  },
  createAgent(data) {
    return this.request('POST', '/api/agents', data);
  },
  saveAgent(name, content) {
    return this.request('PUT', `/api/agents/${name}`, { content });
  },
  retireAgent(name, mergeInto = 'chief_assistant') {
    return this.request('POST', `/api/agents/${name}/retire`, { merge_into: mergeInto });
  },
  getAgentMemory(name) {
    return this.request('GET', `/api/agents/${name}/memory`);
  },
  getAgentRecords(name) {
    return this.request('GET', `/api/agents/${name}/records`);
  },
  submitFeedback(name, feedbacks, comment) {
    return this.request('POST', `/api/agents/${name}/memory/feedback`, { feedbacks, comment });
  },
  toggleAgentActive(name) {
    return this.request('POST', `/api/agents/${name}/toggle-active`, {});
  },

  // Charter (SKILL.md)
  getCharter() {
    return this.request('GET', '/api/charter');
  },
  saveCharter(content) {
    return this.request('PUT', '/api/charter', { content });
  },

  // Agent Labels
  setAgentLabel(name, label) {
    return this.request('PUT', '/api/agent-labels', { name, label });
  },
};
