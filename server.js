const { createServer } = require("http");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

let wss;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  // ✅ Attach WS ONLY to custom path
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
    // ❗ IMPORTANT: ignore other upgrades (Next.js HMR will handle them)
  });

  wss.on("connection", () => {
    console.log("🔌 WS connected");
  });

  global.wss = wss;

  server.listen(3000, () => {
    console.log("🚀 http://localhost:3000");
  });
});
