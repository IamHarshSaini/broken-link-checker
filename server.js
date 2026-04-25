const { createServer } = require("http");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  // store sockets by scanId
  const wsClients = new Map();

  const wss = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", (req, socket, head) => {
    // allow /ws + query params
    if (req.url.startsWith("/ws")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws, req) => {
    const fullUrl = new URL(req.url, "http://localhost:3000");
    const scanId = fullUrl.searchParams.get("scanId");

    if (!scanId) {
      console.log("❌ Missing scanId");
      ws.close();
      return;
    }

    wsClients.set(scanId, ws);

    console.log("🔌 WS connected:", scanId);

    ws.on("close", () => {
      wsClients.delete(scanId);
      console.log("❌ WS disconnected:", scanId);
    });
  });

  // global access for crawler
  global.wsClients = wsClients;

  server.listen(3000, () => {
    console.log("🚀 http://localhost:3000");
  });
});
