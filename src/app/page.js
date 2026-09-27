"use client";

import { Chips } from "primereact/chips";
import { Column } from "primereact/column";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { DataTable } from "primereact/datatable";
import { InputNumber } from "primereact/inputnumber";
import { useEffect, useMemo, useRef, useState } from "react";

function formatElapsed(seconds) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function validateUrl(val) {
  if (!val) return "URL is required";
  try {
    const u = new URL(val);
    if (!["http:", "https:"].includes(u.protocol))
      return "URL must start with http:// or https://";
    return "";
  } catch {
    return "Invalid URL format";
  }
}

const STATUS_CONFIG = {
  TIMEOUT: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", label: "TIMEOUT" },
  DNS_ERROR: { cls: "bg-slate-500/15 text-slate-400 border-slate-500/25", label: "DNS ERR" },
  CONN_REFUSED: { cls: "bg-slate-500/15 text-slate-400 border-slate-500/25", label: "REFUSED" },
  SSL_ERROR: { cls: "bg-purple-500/15 text-purple-400 border-purple-500/25", label: "SSL ERR" },
  REDIRECT_LOOP: { cls: "bg-orange-500/15 text-orange-400 border-orange-500/25", label: "LOOP" },
  ERROR: { cls: "bg-slate-500/15 text-slate-400 border-slate-500/25", label: "ERROR" },
};

const TYPE_CONFIG = {
  link: { label: "Link", cls: "bg-blue-500/15 text-blue-400" },
  image: { label: "Image", cls: "bg-purple-500/15 text-purple-400" },
  script: { label: "JS", cls: "bg-amber-500/15 text-amber-400" },
  style: { label: "CSS", cls: "bg-emerald-500/15 text-emerald-400" },
};

export default function Home() {
  const dt = useRef(null);
  const scanIdRef = useRef(null);

  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [currentPage, setCurrentPage] = useState("");
  const [brokenLinks, setBrokenLinks] = useState([]);
  const [checkedPages, setCheckedPages] = useState(0);
  const [checkedLinks, setCheckedLinks] = useState(0);
  const [redirectedCount, setRedirectedCount] = useState(0);
  const [scanIdReady, setScanIdReady] = useState(false);
  const [modalVisible, setFilterModalVisible] = useState(false);

  const [concurrency, setConcurrency] = useState(10);
  const [maxDepth, setMaxDepth] = useState(0);
  const [crawlDelay, setCrawlDelay] = useState(0);
  const [userAgent, setUserAgent] = useState("");
  const [checkExternal, setCheckExternal] = useState(true);
  const [checkResources, setCheckResources] = useState(true);
  const [respectRobotsTxt, setRespectRobotsTxt] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [groupBySource, setGroupBySource] = useState(false);

  const siteDomain = useMemo(() => {
    if (!url) return "";
    try { return new URL(url).origin; } catch { return ""; }
  }, [url]);

  const [filters, setFilters] = useState([
    { key: "urlIncludes", label: "URL Contains", value: [] },
    { key: "urlExclude", label: "Exclude URLs Containing", value: [] },
    { key: "urlStartsWith", label: "URL Starts With", value: [] },
    { key: "urlNotStartsWith", label: "URL Does NOT Start With", value: [] },
  ]);

  useEffect(() => {
    if (!startTime) return;
    if (endTime) { setElapsed(Math.floor((endTime - startTime) / 1000)); return; }
    if (!loading) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading, startTime, endTime]);

  useEffect(() => {
    let id = sessionStorage.getItem("scanId");
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("scanId", id); }
    scanIdRef.current = id;
    setScanIdReady(true);
  }, []);

  useEffect(() => {
    if (!scanIdReady) return;
    async function restore() {
      try {
        const res = await fetch(`/api/scan-state?scanId=${scanIdRef.current}`);
        const data = await res.json();
        if (!data) return;
        setUrl(data.url || "");
        const o = data.options || {};
        setFilters((prev) => prev.map((item) => ({ ...item, value: o[item.key] || [] })));
        if (o.concurrency) setConcurrency(Number(o.concurrency));
        if (o.maxDepth !== undefined) setMaxDepth(Number(o.maxDepth));
        if (o.crawlDelay !== undefined) setCrawlDelay(Number(o.crawlDelay));
        if (o.userAgent) setUserAgent(o.userAgent);
        if (o.checkExternal !== undefined) setCheckExternal(Boolean(o.checkExternal));
        if (o.checkResources !== undefined) setCheckResources(Boolean(o.checkResources));
        if (o.respectRobotsTxt !== undefined) setRespectRobotsTxt(Boolean(o.respectRobotsTxt));
        if (o.webhookUrl) setWebhookUrl(o.webhookUrl);
        setCheckedPages(data.checkedPages || 0);
        setCheckedLinks(data.checkedLinks || 0);
        setRedirectedCount(data.redirectedCount || 0);
        setCurrentPage(data.currentPage || "");
        setBrokenLinks(data.brokenLinks || []);
        setDone(Boolean(data.done));
        setIsPaused(Boolean(data.paused));
        setLoading(Boolean(data.loading) && !data.done);
        if (data.createdAt) setStartTime(data.createdAt);
        if (data.finishedAt) setEndTime(data.finishedAt);
      } catch (err) {
        console.error("restore error:", err);
      }
    }
    restore();
  }, [scanIdReady]);

  useEffect(() => {
    if (!scanIdReady) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?scanId=${scanIdRef.current}`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.scanId !== scanIdRef.current) return;
      if (msg.type === "progress") {
        setCheckedPages(msg.checkedPages || 0);
        setCheckedLinks(msg.checkedLinks || 0);
        setCurrentPage(msg.currentPage || "");
        if (msg.redirectedCount !== undefined) setRedirectedCount(msg.redirectedCount);
      }
      if (msg.type === "broken") setBrokenLinks((prev) => [msg.data, ...prev]);
      if (msg.type === "done") {
        setDone(true); setLoading(false); setIsPaused(false); setEndTime(Date.now());
      }
    };
    ws.onerror = (err) => console.error("WS error:", err);
    return () => ws.close();
  }, [scanIdReady]);

  const speed = useMemo(() => {
    if (!startTime || !loading) return null;
    const s = (Date.now() - startTime) / 1000;
    return s ? (checkedLinks / s).toFixed(1) : null;
  }, [checkedLinks, startTime, loading]);

  // ── Column renderers ──────────────────────────────────────────────────────

  const urlBody = (row) => {
    let path = row.url;
    try { const u = new URL(row.url); path = u.pathname + u.search; } catch {}
    let finalPath = row.finalUrl;
    try { if (row.finalUrl) { const u = new URL(row.finalUrl); finalPath = u.pathname + u.search; } } catch {}
    return (
      <div>
        <span
          className="text-blue-400 break-all cursor-pointer hover:text-blue-300 transition-colors text-sm"
          title="Click to copy"
          onClick={() => navigator.clipboard.writeText(path)}
        >
          {path}
        </span>
        {row.redirectCount > 0 && (
          <div className="text-xs text-amber-500/80 mt-0.5">
            ↪ {row.redirectCount} redirect{row.redirectCount !== 1 ? "s" : ""}
            {finalPath && finalPath !== path && (
              <span className="text-slate-600 ml-1">→ {finalPath}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const typeBody = (row) => {
    const { label, cls } = TYPE_CONFIG[row.type] || TYPE_CONFIG.link;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>{label}</span>;
  };

  const statusBody = (row) => {
    const s = row.status;
    if (typeof s === "number") {
      let cls = "bg-slate-500/15 text-slate-400 border-slate-500/25";
      if (s >= 500) cls = "bg-orange-500/15 text-orange-400 border-orange-500/25";
      else if (s >= 400) cls = "bg-red-500/15 text-red-400 border-red-500/25";
      return <span className={`px-2 py-0.5 rounded-md border text-xs font-mono font-bold ${cls}`}>{s}</span>;
    }
    const { cls, label } = STATUS_CONFIG[s] || STATUS_CONFIG.ERROR;
    return <span className={`px-2 py-0.5 rounded-md border text-xs font-mono font-bold ${cls}`}>{label}</span>;
  };

  const responseTimeBody = (row) => {
    const ms = row.responseTime;
    if (!ms) return <span className="text-slate-700 text-xs">—</span>;
    let cls = "text-emerald-400";
    if (ms > 3000) cls = "text-red-400";
    else if (ms > 1000) cls = "text-amber-400";
    const display = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    return <span className={`text-xs font-mono font-semibold ${cls}`}>{display}</span>;
  };

  const sourceBody = (row) => {
    let srcPath = row.source;
    try { const u = new URL(row.source); srcPath = u.pathname + u.search; } catch {}
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-500 text-xs truncate" title={row.source}>{srcPath}</span>
        <a
          href={row.source}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-400 text-xs whitespace-nowrap shrink-0 transition-colors"
        >
          ↗
        </a>
      </div>
    );
  };

  // ── Scan controls ─────────────────────────────────────────────────────────

  const buildOptions = () => {
    const fp = filters.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {});
    return {
      ...fp,
      concurrency,
      maxDepth,
      crawlDelay,
      userAgent,
      checkExternal,
      checkResources,
      respectRobotsTxt,
      ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
    };
  };

  const startScan = async () => {
    const err = validateUrl(url);
    if (err) { setUrlError(err); return; }
    setUrlError("");
    try {
      setLoading(true);
      setCheckedPages(0); setCheckedLinks(0); setRedirectedCount(0);
      setCurrentPage(""); setBrokenLinks([]); setDone(false);
      setEndTime(null); setElapsed(0); setStartTime(Date.now());
      await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, scanId: scanIdRef.current, options: buildOptions() }),
      });
    } catch { setLoading(false); }
  };

  const stopScan = async () => {
    setIsPaused(false);
    await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", scanId: scanIdRef.current }),
    });
    setLoading(false);
  };

  const togglePause = async () => {
    const paused = !isPaused;
    setIsPaused(paused);
    await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: paused ? "pause" : "resume", scanId: scanIdRef.current }),
    });
  };

  const resetScan = async () => {
    if (!scanIdRef.current) return;
    await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", scanId: scanIdRef.current }),
    });
    setUrl(""); setUrlError("");
    setCheckedPages(0); setCheckedLinks(0); setRedirectedCount(0);
    setCurrentPage(""); setBrokenLinks([]);
    setDone(false); setLoading(false); setIsPaused(false);
    setStartTime(null); setEndTime(null); setElapsed(0);
    setConcurrency(10); setMaxDepth(0); setCrawlDelay(0);
    setUserAgent(""); setCheckExternal(true); setCheckResources(true);
    setRespectRobotsTxt(true); setWebhookUrl("");
  };

  const handleDownloadClick = () => {
    if (!brokenLinks?.length) return;
    const headers = ["url", "type", "status", "responseTime", "redirectCount", "finalUrl", "text", "source"];
    const rows = [headers, ...brokenLinks.map((item) => headers.map((key) => item[key] ?? ""))];
    const csvContent = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = "broken-links.csv";
    link.click();
    URL.revokeObjectURL(fileUrl);
  };

  const updateFilterValue = (key, value) =>
    setFilters((prev) => prev.map((item) => (item.key === key ? { ...item, value } : item)));

  const statusBreakdown = useMemo(() => {
    return Object.entries(
      brokenLinks.reduce((acc, l) => {
        const key = String(l.status);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    ).sort(([a], [b]) => a.localeCompare(b));
  }, [brokenLinks]);

  const breakdownMax = useMemo(
    () => Math.max(...statusBreakdown.map(([, c]) => c), 1),
    [statusBreakdown],
  );

  const groupCounts = useMemo(() => {
    const m = new Map();
    for (const l of brokenLinks) m.set(l.source, (m.get(l.source) || 0) + 1);
    return m;
  }, [brokenLinks]);

  const tableRows = useMemo(() => {
    if (!groupBySource) return brokenLinks;
    return [...brokenLinks].sort((a, b) => a.source.localeCompare(b.source));
  }, [brokenLinks, groupBySource]);

  const sourceGroupHeader = (row) => {
    let path = row.source;
    try {
      const u = new URL(row.source);
      path = (u.pathname + u.search) || "/";
    } catch {}
    const count = groupCounts.get(row.source) || 0;
    return (
      <div className="flex items-center gap-2 py-0.5">
        <i className="pi pi-file text-slate-500 text-xs" />
        <span className="text-sm text-slate-300 font-medium truncate">{path}</span>
        <span className="text-xs text-slate-600">
          ({count} broken)
        </span>
        <a
          href={row.source}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-400 text-xs"
        >
          ↗
        </a>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-screen bg-[#080c14] overflow-hidden text-slate-200">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="w-60 shrink-0 flex flex-col border-r border-white/5 bg-[#0d1221] overflow-y-auto">
          {/* Brand */}
          <div className="px-5 pt-5 pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-950">
                <i className="pi pi-link text-white text-sm" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-tight tracking-tight">
                  LinkScan
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">Broken link detector</p>
              </div>
            </div>
          </div>

          {/* Scan status */}
          <div className="px-4 pt-4">
            <div
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${
                done
                  ? "bg-emerald-950/40 border-emerald-900/40"
                  : loading
                    ? "bg-blue-950/40 border-blue-900/40"
                    : "bg-white/[0.02] border-white/5"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  done
                    ? "bg-emerald-400"
                    : loading && !isPaused
                      ? "bg-blue-400 animate-pulse"
                      : loading && isPaused
                        ? "bg-amber-400"
                        : "bg-slate-700"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  done ? "text-emerald-300" : loading ? "text-blue-300" : "text-slate-500"
                }`}
              >
                {done ? "Scan complete" : loading ? (isPaused ? "Paused" : "Scanning…") : "Ready"}
              </span>
              {(loading || done) && startTime && (
                <span className="ml-auto text-xs text-slate-600 font-mono tabular-nums">
                  {formatElapsed(elapsed)}
                </span>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="px-4 pt-3 grid grid-cols-2 gap-2">
            {[
              {
                label: "Pages",
                value: checkedPages.toLocaleString(),
                icon: "pi-file-o",
                accent: "text-blue-400",
                glow: "bg-blue-500/8",
              },
              {
                label: "Links",
                value: checkedLinks.toLocaleString(),
                icon: "pi-link",
                accent: "text-indigo-400",
                glow: "bg-indigo-500/8",
              },
              {
                label: "Broken",
                value: brokenLinks.length.toLocaleString(),
                icon: "pi-exclamation-circle",
                accent: brokenLinks.length > 0 ? "text-red-400" : "text-slate-700",
                glow: brokenLinks.length > 0 ? "bg-red-500/8" : "bg-white/[0.02]",
              },
              {
                label: "Redirects",
                value: redirectedCount.toLocaleString(),
                icon: "pi-arrow-right-arrow-left",
                accent: redirectedCount > 0 ? "text-amber-400" : "text-slate-700",
                glow: redirectedCount > 0 ? "bg-amber-500/8" : "bg-white/[0.02]",
              },
            ].map((item) => (
              <div key={item.label} className={`${item.glow} rounded-xl p-3 border border-white/5`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <i className={`pi ${item.icon} text-xs ${item.accent}`} />
                </div>
                <p className="text-xl font-bold text-white leading-none tabular-nums">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {/* Speed & Elapsed */}
          <div className="px-4 pt-2 grid grid-cols-2 gap-2">
            <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Speed</span>
                <i className="pi pi-bolt text-xs text-yellow-400/70" />
              </div>
              <p className="text-xl font-bold text-white leading-none tabular-nums">
                {speed ? `${speed}/s` : "—"}
              </p>
            </div>
            <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Time</span>
                <i className="pi pi-clock text-xs text-slate-600" />
              </div>
              <p className="text-xl font-bold text-white leading-none tabular-nums">
                {startTime ? formatElapsed(elapsed) : "—"}
              </p>
            </div>
          </div>

          {/* Error breakdown */}
          {statusBreakdown.length > 0 && (
            <div className="px-4 pt-5 pb-5 mt-2 border-t border-white/5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-4">
                Breakdown
              </p>
              <div className="space-y-3">
                {statusBreakdown.map(([status, count]) => {
                  const pct = Math.round((count / breakdownMax) * 100);
                  const sn = Number(status);
                  const barColor = !isNaN(sn)
                    ? sn >= 500
                      ? "bg-orange-500"
                      : "bg-red-500"
                    : status === "TIMEOUT"
                      ? "bg-yellow-500"
                      : status === "SSL_ERROR"
                        ? "bg-purple-500"
                        : "bg-slate-500";
                  return (
                    <div key={status}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-mono text-slate-400">{status}</span>
                        <span className="text-slate-300 font-bold tabular-nums">{count}</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1" />
        </aside>

        {/* ── Main panel ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0 bg-[#0d1221] border-b border-white/5 px-5 py-3 flex items-start gap-2.5">
            {/* URL input / scanning indicator */}
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="h-9 flex items-center gap-3 px-3 bg-white/[0.03] border border-white/8 rounded-lg overflow-hidden">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                  <span className="text-sm text-slate-400 truncate font-mono">
                    {currentPage.replace(siteDomain, "") || "Initializing…"}
                  </span>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <i className="pi pi-globe absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-sm pointer-events-none" />
                    <input
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        if (urlError) setUrlError(validateUrl(e.target.value));
                      }}
                      onKeyDown={(e) => e.key === "Enter" && startScan()}
                      placeholder="https://example.com or /sitemap.xml"
                      className={`w-full h-9 pl-9 pr-3 bg-white/[0.03] border ${
                        urlError ? "border-red-500/50" : "border-white/8"
                      } rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all`}
                    />
                  </div>
                  {urlError && <p className="text-xs text-red-400 mt-1 ml-1">{urlError}</p>}
                </div>
              )}
            </div>

            {/* Settings */}
            <button
              disabled={loading}
              onClick={() => setFilterModalVisible(true)}
              className="h-9 px-3.5 rounded-lg border border-white/8 bg-white/[0.03] text-slate-400 text-sm hover:bg-white/6 hover:text-slate-200 transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <i className="pi pi-sliders-h text-xs" />
              <span>Settings</span>
            </button>

            {/* Scan */}
            {!loading && (
              <button
                onClick={startScan}
                className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-blue-950 shrink-0"
              >
                <i className="pi pi-play text-xs" />
                Scan
              </button>
            )}

            {/* Pause / Stop */}
            {loading && (
              <>
                <button
                  onClick={togglePause}
                  className="h-9 px-3.5 rounded-lg border border-white/8 bg-white/[0.03] text-slate-300 text-sm hover:bg-white/6 transition-all flex items-center gap-2 shrink-0"
                >
                  <i className={`pi ${isPaused ? "pi-play" : "pi-pause"} text-xs`} />
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={stopScan}
                  className="h-9 px-3.5 rounded-lg border border-red-900/40 bg-red-950/25 text-red-400 text-sm hover:bg-red-950/40 transition-all flex items-center gap-2 shrink-0"
                >
                  <i className="pi pi-stop text-xs" />
                  Stop
                </button>
              </>
            )}

            {/* Reset */}
            {done && (
              <button
                onClick={resetScan}
                className="h-9 px-3.5 rounded-lg border border-white/8 bg-white/[0.03] text-slate-400 text-sm hover:bg-white/6 hover:text-slate-200 transition-all flex items-center gap-2 shrink-0"
              >
                <i className="pi pi-refresh text-xs" />
                Reset
              </button>
            )}

            {/* Group by page */}
            {brokenLinks?.length > 0 && (
              <button
                onClick={() => setGroupBySource((v) => !v)}
                className={`h-9 px-3.5 rounded-lg border text-sm transition-all flex items-center gap-2 shrink-0 ${
                  groupBySource
                    ? "border-blue-500/40 bg-blue-950/40 text-blue-300"
                    : "border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/6 hover:text-slate-200"
                }`}
              >
                <i className="pi pi-objects-column text-xs" />
                Group by page
              </button>
            )}

            {/* Export */}
            {brokenLinks?.length > 0 && (
              <button
                onClick={handleDownloadClick}
                className="h-9 px-3.5 rounded-lg border border-white/8 bg-white/[0.03] text-slate-400 text-sm hover:bg-white/6 hover:text-slate-200 transition-all flex items-center gap-2 shrink-0"
              >
                <i className="pi pi-download text-xs" />
                Export
              </button>
            )}
          </div>

          {/* Scan shimmer bar */}
          {loading && (
            <div className="h-px bg-white/5 overflow-hidden shrink-0 relative">
              <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan-bar" />
            </div>
          )}

          {/* DataTable */}
          <div className="flex-1 overflow-hidden">
            <DataTable
              ref={dt}
              rows={20}
              paginator
              scrollable
              size="small"
              scrollHeight="flex"
              value={tableRows}
              {...(groupBySource
                ? {
                    rowGroupMode: "subheader",
                    groupRowsBy: "source",
                    rowGroupHeaderTemplate: sourceGroupHeader,
                  }
                : {})}
              emptyMessage={
                <div className="flex flex-col items-center gap-4 py-24 text-slate-600">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                    <i
                      className={`text-2xl ${
                        loading
                          ? "pi pi-spin pi-spinner text-blue-500/50"
                          : done
                            ? "pi pi-check text-emerald-600"
                            : "pi pi-search text-slate-700"
                      }`}
                    />
                  </div>
                  <p className="text-sm text-slate-500">
                    {loading
                      ? "Scanning… no broken links yet"
                      : done
                        ? "No broken links — your site looks healthy!"
                        : "Enter a URL above and press Scan"}
                  </p>
                </div>
              }
              rowsPerPageOptions={[10, 20, 50]}
            >
              <Column
                filter
                field="url"
                body={urlBody}
                header="URL"
                filterPlaceholder="Filter by URL"
              />
              <Column
                field="type"
                header="Type"
                body={typeBody}
                style={{ width: "80px" }}
              />
              <Column
                field="text"
                header="Anchor Text"
                body={(row) => (
                  <span className="text-slate-500 text-xs">
                    {row?.text?.replace(siteDomain, "") || "—"}
                  </span>
                )}
              />
              <Column
                field="status"
                header="Status"
                body={statusBody}
                sortable
                filter
                style={{ width: "110px" }}
              />
              <Column
                field="responseTime"
                header="Time"
                body={responseTimeBody}
                sortable
                style={{ width: "90px" }}
              />
              {!groupBySource && (
                <Column field="source" header="Found On" body={sourceBody} />
              )}
            </DataTable>
          </div>
        </div>
      </div>

      {/* ── Settings modal ──────────────────────────────────────────────── */}
      <Dialog
        header="Scan Settings"
        visible={modalVisible}
        style={{ width: "560px" }}
        onHide={() => setFilterModalVisible(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setFilterModalVisible(false)}
              className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 text-sm hover:bg-white/6 hover:text-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => setFilterModalVisible(false)}
              className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-950"
            >
              Apply
            </button>
          </div>
        }
      >
        <div className="grid gap-6 pt-1">
          {/* URL Filters */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-3">
              URL Filters
            </p>
            <div className="grid gap-4">
              {filters.map(({ label, key, value }) => (
                <div key={key}>
                  <label htmlFor={key} className="text-sm text-slate-300 mb-1.5 inline-block">
                    {label}
                  </label>
                  <Chips
                    id={key}
                    value={value}
                    className="w-full"
                    inputClassName="w-full"
                    pt={{
                      container: { className: "w-full" },
                      inputToken: { className: "w-full" },
                    }}
                    onChange={(e) => updateFilterValue(key, e.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Crawl Settings */}
          <div className="border-t border-white/5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-4">
              Crawl Settings
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-300 mb-1.5 inline-block">
                  Concurrency (1–50)
                </label>
                <InputNumber
                  value={concurrency}
                  min={1}
                  max={50}
                  showButtons
                  className="w-full"
                  onValueChange={(e) => setConcurrency(Math.min(50, Math.max(1, e.value || 1)))}
                />
                <p className="text-xs text-slate-600 mt-1">Parallel link checks</p>
              </div>

              <div>
                <label className="text-sm text-slate-300 mb-1.5 inline-block">
                  Max Depth (0 = unlimited)
                </label>
                <InputNumber
                  value={maxDepth}
                  min={0}
                  max={20}
                  showButtons
                  className="w-full"
                  onValueChange={(e) => setMaxDepth(Math.max(0, e.value || 0))}
                />
                <p className="text-xs text-slate-600 mt-1">Hops from start URL</p>
              </div>

              <div>
                <label className="text-sm text-slate-300 mb-1.5 inline-block">
                  Crawl Delay (ms)
                </label>
                <InputNumber
                  value={crawlDelay}
                  min={0}
                  max={10000}
                  step={100}
                  showButtons
                  className="w-full"
                  onValueChange={(e) => setCrawlDelay(Math.max(0, e.value || 0))}
                />
                <p className="text-xs text-slate-600 mt-1">Pause between pages</p>
              </div>

              <div className="flex flex-col justify-center gap-3 pt-2">
                {[
                  {
                    id: "ext",
                    label: "Check external links",
                    checked: checkExternal,
                    set: setCheckExternal,
                  },
                  {
                    id: "res",
                    label: "Check images / JS / CSS",
                    checked: checkResources,
                    set: setCheckResources,
                  },
                  {
                    id: "robots",
                    label: "Respect robots.txt",
                    checked: respectRobotsTxt,
                    set: setRespectRobotsTxt,
                  },
                ].map(({ id, label, checked, set }) => (
                  <label
                    key={id}
                    className="flex items-center gap-3 cursor-pointer select-none group"
                  >
                    <div
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => set(!checked)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer ${
                        checked
                          ? "bg-blue-600 border-blue-600"
                          : "bg-white/[0.03] border-white/15 hover:border-white/25"
                      }`}
                    >
                      {checked && <i className="pi pi-check text-white" style={{ fontSize: "9px" }} />}
                    </div>
                    <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Request Settings */}
          <div className="border-t border-white/5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-3">
              Request Settings
            </p>
            <label className="text-sm text-slate-300 mb-1.5 inline-block">User Agent</label>
            <InputText
              value={userAgent}
              onChange={(e) => setUserAgent(e.target.value)}
              placeholder="Mozilla/5.0 (compatible; MyBot/1.0)"
              className="w-full"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Sent with every request. Leave blank for default.
            </p>
          </div>

          {/* Notifications */}
          <div className="border-t border-white/5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 mb-3">
              Notifications
            </p>
            <label className="text-sm text-slate-300 mb-1.5 inline-block">
              Webhook URL (Slack-compatible)
            </label>
            <InputText
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Posted once when the scan finishes, with a summary and broken-link count.
            </p>
          </div>
        </div>
      </Dialog>
    </>
  );
}
