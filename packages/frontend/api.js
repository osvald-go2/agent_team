// Backend adapter for the static prototype. Falls back silently when the
// backend is unavailable, so index.html can still be opened as a mock.
window.AgentTeamApi = (() => {
  const defaultBase = window.AGENTTEAM_API_BASE || (location.protocol === "file:" ? "http://localhost:3001" : "");

  async function request(path, options = {}) {
    const res = await fetch(defaultBase + path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const payload = text ? JSON.parse(text) : null;
        if (payload?.message || payload?.error) message = payload.message || payload.error;
      } catch {}
      throw new Error(message);
    }
    if (res.status === 204 || !text) return null;
    return JSON.parse(text);
  }

  function wsUrl(sessionId) {
    const url = defaultBase
      ? new URL(defaultBase)
      : new URL(location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    return url.toString();
  }

  return {
    async bootstrap() {
      return request("/api/bootstrap");
    },
    async createEntity(kind, record) {
      return request(`/api/entities/${encodeURIComponent(kind)}`, {
        method: "POST",
        body: JSON.stringify(record),
      });
    },
    async updateEntity(kind, id, patch) {
      return request(`/api/entities/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },
    async deleteEntity(kind, id) {
      return request(`/api/entities/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async importGitSkill(payload) {
      return request("/api/skills/import-git", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    async createSession(payload) {
      return request("/api/sessions", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    async sendMessage(sessionId, text, id, model) {
      return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ text, id, model }),
      });
    },
    async startRun(sessionId, goal, model) {
      return request(`/api/sessions/${encodeURIComponent(sessionId)}/runs`, {
        method: "POST",
        body: JSON.stringify({ goal, model }),
      });
    },
    connect(sessionId, onEvent) {
      const ws = new WebSocket(wsUrl(sessionId));
      ws.onmessage = (event) => {
        try {
          onEvent(JSON.parse(event.data));
        } catch (error) {
          console.warn("Bad AgentTeam WS event", error);
        }
      };
      return ws;
    },
  };
})();
