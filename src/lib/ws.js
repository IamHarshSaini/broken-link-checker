export function broadcast(data) {
  if (!global.wss) return;
  const msg = JSON.stringify(data);
  global.wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}
