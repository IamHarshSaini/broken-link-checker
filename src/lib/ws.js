export function broadcastToScan(scanId, payload) {
  if (!global.wsClients) {
    console.log("❌ global.wsClients missing");
    return;
  }

  const client = global.wsClients.get(scanId);

  if (!client) {
    console.log("❌ No WS client for:", scanId);
    return;
  }

  if (client.readyState === 1) {
    client.send(
      JSON.stringify({
        ...payload,
        scanId,
      }),
    );

    console.log("✅ Sent:", payload.type, scanId);
  } else {
    console.log("❌ WS not open:", scanId);
  }
}
