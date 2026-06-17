# LinkScan — Broken Link Checker

A fast, self-hosted broken link checker built with **Next.js 16**, **React 19**, and **WebSockets**. Crawl any website or XML sitemap, detect broken URLs, images, scripts, and stylesheets in real time, and export results to CSV.

---

## Features

- **Real-time crawling** — live results streamed via WebSocket as pages are scanned
- **Sitemap support** — feed a `sitemap.xml` (including sitemap index files) to scan every URL at once
- **Multi-resource detection** — checks `<a href>`, `<img src>`, `<script src>`, and `<link rel="stylesheet">`
- **Smart redirect tracking** — follows redirect chains hop-by-hop, reports final URL and hop count
- **Error classification** — distinguishes `404`, `5xx`, `TIMEOUT`, `DNS_ERROR`, `CONN_REFUSED`, `SSL_ERROR`, and `REDIRECT_LOOP`
- **Pause / Resume / Stop** — full scan lifecycle control without losing progress
- **Session restore** — refreshing the tab restores the last scan state from the server
- **CSV export** — download broken links with status, source page, anchor text, response time, and redirect chain
- **URL filters** — include/exclude patterns to scope the crawl (e.g. skip `/blog`, only crawl `/docs`)
- **Configurable crawl settings** — concurrency (1–50), max depth, crawl delay, custom User-Agent
- **Dark UI** — sidebar stats, per-status breakdown bars, sortable/filterable data table (PrimeReact)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + PrimeReact 10 + Tailwind CSS 4 |
| State | Redux Toolkit + React-Redux |
| Crawler | Axios + Cheerio + p-limit |
| Real-time | WebSocket (`ws` library, custom Node server) |
| Runtime | Node.js (custom `server.js` — not `next start`) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm / yarn / pnpm / bun

### Install

```bash
git clone https://github.com/your-username/broken-link-checker.git
cd broken-link-checker
npm install
```

### Run (development)

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** The app uses a custom Node.js server (`server.js`) for WebSocket support. `npm run dev` starts Next.js directly; for the full WebSocket experience in production use `node server.js`.

### Run (production)

```bash
npm run build
node server.js
```

---

## Usage

1. Enter a URL (e.g. `https://example.com`) or a sitemap path (e.g. `https://example.com/sitemap.xml`)
2. Optionally open **Settings** to configure:
   - **Concurrency** — how many links are checked in parallel (default: 10, max: 50)
   - **Max Depth** — how many hops from the start URL to crawl (0 = unlimited)
   - **Crawl Delay** — milliseconds to wait between page fetches (polite crawling)
   - **User Agent** — custom `User-Agent` header sent with every request
   - **Check external links** — toggle off to only check links on the same domain
   - **Check images / JS / CSS** — toggle off to only check `<a href>` links
   - **URL filters** — include/exclude URL patterns (supports multiple values)
3. Click **Scan** — broken links appear in the table as they are found
4. Use **Pause**, **Resume**, or **Stop** at any time
5. Click **Export** to download a CSV of all broken links

---

## Project Structure

```
src/
├── app/
│   ├── page.js              # Main UI (scan form, results table, settings modal)
│   ├── layout.js            # Root layout
│   ├── globals.css          # Global styles
│   └── api/
│       ├── scan/route.js    # POST /api/scan — starts a crawl
│       ├── scan-state/route.js  # GET /api/scan-state — restore session state
│       └── control/route.js # POST /api/control — pause/resume/stop/reset
├── lib/
│   ├── crawler.js           # Core crawl + link-check engine
│   ├── scanStore.js         # In-memory scan state store
│   └── ws.js                # WebSocket broadcast helpers
└── redux/
    ├── store/               # Redux store setup
    ├── slices/              # brokenlink slice
    ├── hooks/               # typed hooks
    └── Provider/            # Redux provider wrapper
server.js                    # Custom Node HTTP + WebSocket server
```

---

## How the Crawler Works

1. **Page fetch** — `axios.get` fetches the HTML of each page in the queue
2. **Resource extraction** — Cheerio parses the HTML and extracts all links, images, scripts, and stylesheets
3. **Link checking** — each resource URL is checked once (deduplicated) using HEAD (with GET fallback on 405), following redirects manually to record the full chain
4. **Queue expansion** — internal `<a href>` links that pass the URL filter and depth limit are added back to the queue
5. **Broadcast** — every progress update and broken-link event is pushed to the browser over WebSocket in real time

Error categories returned by the checker:

| Status | Meaning |
|---|---|
| `404`, `4xx` | Client error (not found, forbidden, etc.) |
| `5xx` | Server error |
| `TIMEOUT` | Request exceeded 10 s |
| `DNS_ERROR` | Hostname not resolved |
| `CONN_REFUSED` | Server actively refused the connection |
| `SSL_ERROR` | TLS/certificate problem |
| `REDIRECT_LOOP` | More than 10 redirect hops |
| `ERROR` | Any other network-level failure |

---

## API Reference

### `POST /api/scan`

Start a new crawl.

```json
{
  "url": "https://example.com",
  "scanId": "<uuid>",
  "options": {
    "concurrency": 10,
    "maxDepth": 0,
    "crawlDelay": 0,
    "userAgent": "",
    "checkExternal": true,
    "checkResources": true,
    "urlIncludes": [],
    "urlExclude": [],
    "urlStartsWith": [],
    "urlNotStartsWith": []
  }
}
```

### `GET /api/scan-state?scanId=<uuid>`

Returns the current (or last) scan state for session restore.

### `POST /api/control`

Control an in-progress scan.

```json
{ "action": "pause" | "resume" | "stop" | "reset", "scanId": "<uuid>" }
```

### WebSocket `ws://localhost:3000/ws?scanId=<uuid>`

Messages pushed from server to client:

| `type` | Payload |
|---|---|
| `progress` | `{ checkedPages, checkedLinks, currentPage, redirectedCount }` |
| `broken` | `{ url, type, status, responseTime, redirectCount, finalUrl, text, source }` |
| `done` | — |

---

## CSV Export Format

| Column | Description |
|---|---|
| `url` | The broken resource URL |
| `type` | `link`, `image`, `script`, or `style` |
| `status` | HTTP status code or error category |
| `responseTime` | Response time in ms |
| `redirectCount` | Number of redirects followed |
| `finalUrl` | Final URL after redirects (if different) |
| `text` | Anchor text or alt text |
| `source` | Page URL where the resource was found |

---

## License

MIT
