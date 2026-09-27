export function broadcastToScan(scanId, payload) {
  if (!global.wsClients) return;

  const client = global.wsClients.get(scanId);
  if (!client || client.readyState !== 1) return;

  client.send(JSON.stringify({ ...payload, scanId }));
}
