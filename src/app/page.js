"use client";

import { Chips } from "primereact/chips";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { DataTable } from "primereact/datatable";
import { InputNumber } from "primereact/inputnumber";
import { ToggleButton } from "primereact/togglebutton";
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
    if (!["http:", "https:"].includes(u.protocol)) {
      return "URL must start with http:// or https://";
    }
    return "";
  } catch {
    return "Invalid URL format";
  }
}

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
  const [scanIdReady, setScanIdReady] = useState(false);
  const [modalVisible, setFilterModalVisible] = useState(false);
  const [concurrency, setConcurrency] = useState(10);

  const siteDomain = useMemo(() => {
    if (!url) return "";
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  }, [url]);

  const [filters, setFilters] = useState([
    { key: "urlIncludes", label: "URL Contains", value: [] },
    { key: "urlExclude", label: "Exclude URLs Containing", value: [] },
    { key: "urlStartsWith", label: "URL Starts With", value: [] },
    { key: "urlNotStartsWith", label: "URL Does NOT Start With", value: [] },
  ]);

  // Elapsed timer — live when scanning, frozen when done
  useEffect(() => {
    if (!startTime) return;

    if (endTime) {
      setElapsed(Math.floor((endTime - startTime) / 1000));
      return;
    }

    if (!loading) return;

    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [loading, startTime, endTime]);

  useEffect(() => {
    let existingScanId = sessionStorage.getItem("scanId");

    if (!existingScanId) {
      existingScanId = crypto.randomUUID();
      sessionStorage.setItem("scanId", existingScanId);
    }

    scanIdRef.current = existingScanId;
    setScanIdReady(true);
  }, []);

  useEffect(() => {
    if (!scanIdReady) return;

    async function restoreScan() {
      try {
        const res = await fetch(`/api/scan-state?scanId=${scanIdRef.current}`);
        const data = await res.json();

        if (!data) return;

        setUrl(data.url || "");

        const restoredOptions = { ...(data.options || {}) };

        setFilters((prev) =>
          prev.map((item) => ({
            ...item,
            value: restoredOptions[item.key] || [],
          })),
        );

        if (restoredOptions.concurrency) {
          setConcurrency(Number(restoredOptions.concurrency));
        }

        setCheckedPages(data.checkedPages || 0);
        setCheckedLinks(data.checkedLinks || 0);
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

    restoreScan();
  }, [scanIdReady]);

  useEffect(() => {
    if (!scanIdReady) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${wsProtocol}//${window.location.host}/ws?scanId=${scanIdRef.current}`,
    );

    ws.onopen = () => {
      console.log("WS connected:", scanIdRef.current);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.scanId !== scanIdRef.current) return;

      if (msg.type === "progress") {
        setCheckedPages(msg.checkedPages || 0);
        setCheckedLinks(msg.checkedLinks || 0);
        setCurrentPage(msg.currentPage || "");
      }

      if (msg.type === "broken") {
        setBrokenLinks((prev) => [msg.data, ...prev]);
      }

      if (msg.type === "done") {
        setDone(true);
        setLoading(false);
        setIsPaused(false);
        setEndTime(Date.now());
      }
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
    };

    ws.onclose = () => {
      console.log("WS closed");
    };

    return () => ws.close();
  }, [scanIdReady]);

  const speed = useMemo(() => {
    if (!startTime) return 0;
    const seconds = (Date.now() - startTime) / 1000;
    return seconds ? (checkedLinks / seconds).toFixed(1) : 0;
  }, [checkedLinks, startTime]);

  // ── Column body renderers ──────────────────────────────────────────────────

  const urlBody = (row) => {
    let path = row.url;
    try {
      const u = new URL(row.url);
      path = u.pathname + u.search;
    } catch {}

    return (
      <span
        className="text-blue-600 break-all cursor-pointer hover:underline"
        title="Click to copy path"
        onClick={() => navigator.clipboard.writeText(path)}
      >
        {path}
      </span>
    );
  };

  const statusBody = (row) => {
    const s = row.status;
    let cls = "bg-gray-100 text-gray-600 border-gray-200";

    if (typeof s === "number") {
      if (s >= 500) cls = "bg-orange-100 text-orange-700 border-orange-200";
      else if (s >= 400) cls = "bg-red-100 text-red-700 border-red-200";
    }

    return (
      <span
        className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${cls}`}
      >
        {s}
      </span>
    );
  };

  const sourceBody = (row) => {
    let srcPath = row.source;
    try {
      const u = new URL(row.source);
      srcPath = u.pathname + u.search;
    } catch {}

    return (
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-gray-500 text-xs truncate"
          title={row.source}
        >
          {srcPath}
        </span>
        <a
          href={row.source}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-xs whitespace-nowrap shrink-0"
        >
          Open ↗
        </a>
      </div>
    );
  };

  // ── Scan controls ──────────────────────────────────────────────────────────

  const startScan = async () => {
    const err = validateUrl(url);
    if (err) {
      setUrlError(err);
      return;
    }

    setUrlError("");

    try {
      setLoading(true);
      setCheckedPages(0);
      setCheckedLinks(0);
      setCurrentPage("");
      setBrokenLinks([]);
      setDone(false);
      setEndTime(null);
      setElapsed(0);
      setStartTime(Date.now());

      const filtersPayLoad = filters.reduce(
        (acc, item) => ({ ...acc, [item.key]: item.value }),
        {},
      );

      await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          scanId: scanIdRef.current,
          options: { ...filtersPayLoad, concurrency },
        }),
      });
    } catch {
      setLoading(false);
    }
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

  const resetScan = async () => {
    if (!scanIdRef.current) return;

    await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", scanId: scanIdRef.current }),
    });

    setUrl("");
    setUrlError("");
    setCheckedPages(0);
    setCheckedLinks(0);
    setCurrentPage("");
    setBrokenLinks([]);
    setDone(false);
    setLoading(false);
    setIsPaused(false);
    setStartTime(null);
    setEndTime(null);
    setElapsed(0);
    setConcurrency(10);
  };

  const updateFilterValue = (targetKey, newValue) => {
    setFilters((prev) =>
      prev.map((item) =>
        item.key === targetKey ? { ...item, value: newValue } : item,
      ),
    );
  };

  const handleDownloadClick = () => {
    if (!brokenLinks?.length) return;

    const headers = Object.keys(brokenLinks[0]);

    const rows = [
      headers,
      ...brokenLinks.map((item) => headers.map((key) => item[key] || "")),
    ];

    const csvContent = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = "broken-links.csv";
    link.click();
    URL.revokeObjectURL(fileUrl);
  };

  // ── Sidebar stats ──────────────────────────────────────────────────────────

  const stats = [
    { label: "Pages Checked", value: checkedPages, icon: "pi pi-file", color: "text-blue-500" },
    { label: "Links Checked", value: checkedLinks, icon: "pi pi-link", color: "text-indigo-500" },
    {
      label: "Speed",
      value: loading ? `${speed}/s` : "—",
      icon: "pi pi-bolt",
      color: "text-yellow-500",
    },
    {
      label: "Broken",
      value: brokenLinks.length,
      icon: "pi pi-exclamation-circle",
      color: brokenLinks.length > 0 ? "text-red-500" : "text-gray-400",
    },
    {
      label: "Elapsed",
      value: startTime ? formatElapsed(elapsed) : "—",
      icon: "pi pi-clock",
      color: "text-slate-500",
    },
    {
      label: "Status",
      value: done ? "Done" : loading ? (isPaused ? "Paused" : "Running") : "Idle",
      icon: done ? "pi pi-check-circle" : loading ? "pi pi-spin pi-spinner" : "pi pi-circle",
      color: done ? "text-green-500" : loading ? "text-blue-500" : "text-gray-400",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-[260px_1fr] h-screen bg-linear-to-br from-slate-50 to-blue-50">
        {/* Sidebar */}
        <aside className="flex flex-col gap-3 p-4 sticky top-0 border-r bg-white/80 backdrop-blur-md overflow-y-auto">
          <div className="mb-1">
            <h1 className="text-base font-bold text-slate-800 tracking-tight">
              Broken Link Checker
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Real-time site scanner</p>
          </div>

          {stats.map((item) => (
            <div
              key={item.label}
              className="bg-white border border-slate-100 p-3 rounded-lg shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                  {item.label}
                </p>
                <i className={`${item.icon} ${item.color} text-sm`} />
              </div>
              <p className="text-xl font-bold mt-1 text-slate-800">{item.value}</p>
            </div>
          ))}

          {done && brokenLinks.length > 0 && (
            <div className="mt-auto pt-2 border-t">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-medium">
                By Status
              </p>
              {Object.entries(
                brokenLinks.reduce((acc, l) => {
                  const key = String(l.status);
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {}),
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, count]) => (
                  <div
                    key={status}
                    className="flex justify-between items-center text-xs py-1"
                  >
                    <span className="text-gray-500">{status}</span>
                    <span className="font-semibold text-slate-700">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="h-screen flex flex-col overflow-hidden">
          <DataTable
            ref={dt}
            rows={15}
            paginator
            scrollable
            size="small"
            scrollHeight="flex"
            value={brokenLinks}
            className="flex-1"
            header={
              <header className="flex flex-wrap gap-2 bg-white">
                <div className="flex-1 min-w-64 flex flex-col">
                  {loading ? (
                    <div className="flex items-center h-full px-3 border rounded bg-slate-50 overflow-hidden">
                      <i className="pi pi-spin pi-spinner text-blue-400 text-xs mr-2 shrink-0" />
                      <span className="text-sm text-slate-500 truncate">
                        {currentPage.replace(siteDomain, "") || "Starting…"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <InputText
                        value={url}
                        disabled={loading}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (urlError) setUrlError(validateUrl(e.target.value));
                        }}
                        onKeyDown={(e) => e.key === "Enter" && !loading && startScan()}
                        placeholder="https://example.com"
                        className={`w-full ${urlError ? "p-invalid" : ""}`}
                      />
                      {urlError && (
                        <small className="text-red-500 text-xs">{urlError}</small>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  outlined
                  label="Filters"
                  disabled={loading}
                  icon="pi pi-filter"
                  onClick={() => setFilterModalVisible(true)}
                />

                <Button
                  loading={loading}
                  disabled={loading}
                  onClick={startScan}
                  label={loading ? "Scanning…" : "Scan"}
                />

                {loading && (
                  <>
                    <ToggleButton
                      checked={isPaused}
                      disabled={!loading}
                      onLabel="Resume"
                      offLabel="Pause"
                      onIcon="pi pi-play"
                      offIcon="pi pi-pause"
                      className="text-nowrap"
                      onChange={async (e) => {
                        const paused = e.value;
                        setIsPaused(paused);

                        await fetch("/api/control", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: paused ? "pause" : "resume",
                            scanId: scanIdRef.current,
                          }),
                        });
                      }}
                    />

                    <Button
                      severity="danger"
                      outlined
                      label="Stop"
                      icon="pi pi-stop"
                      onClick={stopScan}
                    />
                  </>
                )}

                {done && (
                  <Button
                    outlined
                    label="Reset"
                    severity="danger"
                    icon="pi pi-refresh"
                    onClick={resetScan}
                  />
                )}

                {brokenLinks?.length > 0 && (
                  <Button
                    outlined
                    onClick={handleDownloadClick}
                    label="Export CSV"
                    icon="pi pi-download"
                  />
                )}
              </header>
            }
            emptyMessage={
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <i className="pi pi-check-circle text-4xl text-green-300" />
                <p className="text-sm">
                  {loading ? "Scanning… no broken links yet" : "No broken links found"}
                </p>
              </div>
            }
            rowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
          >
            <Column
              filter
              field="url"
              body={urlBody}
              header="URL"
              filterPlaceholder="Search URL"
              style={{ minWidth: "200px" }}
            />

            <Column
              field="text"
              header="Anchor Text"
              body={(row) => (
                <span className="text-gray-600 text-xs">
                  {row?.text?.replace(siteDomain, "") || "—"}
                </span>
              )}
              style={{ minWidth: "120px" }}
            />

            <Column
              field="status"
              header="Status"
              body={statusBody}
              sortable
              filter
              style={{ minWidth: "90px" }}
            />

            <Column
              field="source"
              header="Found On"
              body={sourceBody}
              style={{ minWidth: "160px" }}
            />
          </DataTable>
        </div>
      </div>

      {/* Filters Modal */}
      <Dialog
        header="Scan Filters & Settings"
        visible={modalVisible}
        style={{ width: "520px" }}
        onHide={() => setFilterModalVisible(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => setFilterModalVisible(false)}
            />
            <Button
              label="Apply"
              onClick={() => setFilterModalVisible(false)}
            />
          </div>
        }
      >
        <div className="grid gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              URL Filters
            </p>
            <div className="grid gap-4">
              {filters.map((item) => {
                const { label, key, value } = item;
                return (
                  <div key={key}>
                    <label htmlFor={key} className="text-sm mb-1.5 inline-block">
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
                );
              })}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Scan Settings
            </p>
            <div>
              <label className="text-sm mb-1.5 inline-block">
                Concurrency — parallel link checks (1–50)
              </label>
              <InputNumber
                value={concurrency}
                min={1}
                max={50}
                showButtons
                className="w-full"
                onValueChange={(e) =>
                  setConcurrency(Math.min(50, Math.max(1, e.value || 1)))
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                Higher values are faster but may trigger rate limits. Default: 10.
              </p>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
