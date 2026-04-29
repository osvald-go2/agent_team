export class EventBus {
  constructor() {
    this.clients = new Set();
  }

  add(ws, sessionId = null) {
    const client = { ws, sessionId };
    this.clients.add(client);
    ws.on("close", () => this.clients.delete(client));
    return client;
  }

  publish(event) {
    const payload = JSON.stringify({ ...event, createdAt: event.createdAt || new Date().toISOString() });
    for (const client of this.clients) {
      if (client.ws.readyState !== 1) continue;
      if (client.sessionId && event.sessionId && client.sessionId !== event.sessionId) continue;
      client.ws.send(payload);
    }
  }
}
