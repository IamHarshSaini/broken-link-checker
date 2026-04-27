"use client";

import { Chips } from "primereact/chips";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { DataTable } from "primereact/datatable";
import { ToggleButton } from "primereact/togglebutton";
import { useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
  const dt = useRef(null);
  const scanIdRef = useRef(null);

  const [url, setUrl] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [currentPage, setCurrentPage] = useState("");
  const [brokenLinks, setBrokenLinks] = useState([]);
  const [checkedPages, setCheckedPages] = useState(0);
  const [checkedLinks, setCheckedLinks] = useState(0);
  const [scanIdReady, setScanIdReady] = useState(false);
  const [modalVisible, setFilterModalVisible] = useState(false);

  const siteDomain = useMemo(() => {
    if (!url) return "";

    try {
      const u = new URL(url);
      return u.origin;
    } catch {
      return "";
    }
  }, [url]);

  const [filters, setFilters] = useState([
    {
      key: "urlIncludes",
      label: "🔍 URL Contains",
      value: [],
    },
    {
      key: "urlExclude",
      label: "🚫 Exclude URLs Containing",
      value: [],
    },
    {
      key: "urlStartsWith",
      label: "➡️ URL Starts With",
      value: [],
    },
    {
      key: "urlNotStartsWith",
      label: "⛔ URL Does NOT Start With",
      value: [],
    },
  ]);

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

        // FIXED
        setFilters((prev) =>
          prev.map((item) => ({
            ...item,
            value: restoredOptions[item.key] || [],
          })),
        );

        // UPDATED
        setCheckedPages(data.checkedPages || 0);
        setCheckedLinks(data.checkedLinks || 0);

        setCurrentPage(data.currentPage || "");
        setBrokenLinks(data.brokenLinks || []);
        setDone(Boolean(data.done));
        setIsPaused(Boolean(data.paused));
        setLoading(Boolean(data.loading) && !data.done);

        if (data.createdAt) {
          setStartTime(data.createdAt);
        }
      } catch (err) {
        console.error("restore error:", err);
      }
    }

    restoreScan();
  }, [scanIdReady]);

  useEffect(() => {
    if (!scanIdReady) return;

    const ws = new WebSocket(
      `ws://localhost:3000/ws?scanId=${scanIdRef.current}`,
    );

    ws.onopen = () => {
      console.log("✅ WS Connected:", scanIdRef.current);
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
      }
    };

    ws.onerror = (err) => {
      console.error("❌ WS Error:", err);
    };

    ws.onclose = () => {
      console.log("❌ WS Closed");
    };

    return () => {
      ws.close();
    };
  }, [scanIdReady]);

  const speed = useMemo(() => {
    if (!startTime) return 0;
    const seconds = (Date.now() - startTime) / 1000;
    return seconds ? (checkedLinks / seconds).toFixed(1) : 0;
  }, [checkedLinks, startTime]);

  const urlBody = (row) => {
    let path = row.url;

    try {
      const u = new URL(row.url);
      path = u.pathname + u.search;
    } catch {}

    return (
      <span
        className="text-blue-600 break-all cursor-pointer hover:underline"
        onClick={() => navigator.clipboard.writeText(path)}
      >
        {path}
      </span>
    );
  };

  const sourceBody = (row) => {
    return (
      <span
        className="text-blue-600 cursor-pointer hover:underline"
        title="Click to copy and open"
        onClick={() => {
          let path = row.url;
          try {
            const u = new URL(row.url);
            path = u.pathname + u.search;
          } catch {}

          navigator.clipboard.writeText(row?.text || path);
          window.open(row.source, "_blank", "noopener,noreferrer");
        }}
      >
        Open
      </span>
    );
  };

  const startScan = async () => {
    try {
      setLoading(true);

      setCheckedPages(0);
      setCheckedLinks(0);

      setCurrentPage("");
      setBrokenLinks([]);
      setDone(false);
      setStartTime(Date.now());

      const filtersPayLoad = filters.reduce((acc, item) => {
        return {
          ...acc,
          [item.key]: item.value,
        };
      }, {});

      await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          scanId: scanIdRef.current,
          options: filtersPayLoad,
        }),
      });
    } catch (error) {
      setLoading(false);
    }
  };

  const stopScan = async () => {
    setIsPaused(false);

    await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "stop",
        scanId: scanIdRef.current,
      }),
    });

    setLoading(false);
  };

  const resetScan = async () => {
    if (!scanIdRef.current) return;

    await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "reset",
        scanId: scanIdRef.current,
      }),
    });

    // UPDATED
    setUrl("");
    setCheckedPages(0);
    setCheckedLinks(0);

    setCurrentPage("");
    setBrokenLinks([]);
    setDone(false);
    setLoading(false);
    setIsPaused(false);
    setStartTime(null);
  };

  const updateFilterValue = (targetKey, newValue) => {
    setFilters((prev) =>
      prev.map((item) =>
        item.key === targetKey
          ? {
              ...item,
              value: newValue,
            }
          : item,
      ),
    );
  };

  const handleDownloadClick = () => {
    if (!brokenLinks?.length || !dt.current) return;

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

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const fileUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = "broken-links.csv";
    link.click();

    URL.revokeObjectURL(fileUrl);
  };

  return (
    <>
      <div className="grid grid-cols-[280px_1fr] bg-linear-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col gap-4 p-5 sticky top-0 border-r bg-white/80 backdrop-blur-md">
          {[
            {
              label: "Pages Checked",
              value: checkedPages,
              emoji: "📄",
            },
            {
              label: "Links Checked",
              value: checkedLinks,
              emoji: "🔗",
            },
            {
              label: "Speed",
              value: `${speed}/s`,
              emoji: "⚡",
            },
            {
              label: "Broken",
              value: brokenLinks.length,
              emoji: "🚨",
            },
            {
              label: "Status",
              value: done ? "Done" : loading ? "Running" : "Idle",
              emoji: done ? "✅" : loading ? "⏳" : "🟢",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 p-3 rounded"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 font-medium">
                  {item.label}
                </p>
                <span className="text-2xl">{item.emoji}</span>
              </div>

              <p className="text-2xl font-bold mt-2 text-slate-800">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="h-screen">
          <DataTable
            ref={dt}
            rows={15}
            paginator
            scrollable
            size="small"
            scrollHeight="flex"
            value={brokenLinks}
            header={
              <header className="flex gap-4 bg-white">
                {loading ? (
                  <div className="flex px-4 items-center w-96.25 border rounded overflow-hidden">
                    <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis block">
                      {currentPage.replace(siteDomain, "")}
                    </span>
                  </div>
                ) : (
                  <InputText
                    value={url}
                    disabled={loading}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1 min-w-75"
                  />
                )}

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
                  className="w-36"
                  label={loading ? "Scanning" : "Scan"}
                />

                {loading && (
                  <>
                    <ToggleButton
                      checked={isPaused}
                      disabled={!loading}
                      onLabel="Resume Scan"
                      offLabel="Pause Scan"
                      onIcon="pi pi-play"
                      offIcon="pi pi-pause"
                      className="text-nowrap"
                      onChange={async (e) => {
                        const paused = e.value;
                        setIsPaused(paused);

                        await fetch("/api/control", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
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
                      disabled={!loading}
                    />
                  </>
                )}

                {done && (
                  <Button
                    outlined
                    label="Reset"
                    severity="danger"
                    icon="pi pi-reset"
                    onClick={resetScan}
                  />
                )}

                {brokenLinks?.length > 0 && (
                  <Button
                    outlined
                    onClick={handleDownloadClick}
                    className="w-36"
                    label="Download"
                    icon="pi pi-download"
                  />
                )}
              </header>
            }
            emptyMessage="No broken links found"
            rowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
          >
            <Column
              filter
              field="url"
              body={urlBody}
              header={() => {
                return <div className="text-nowrap">🔗 URL</div>;
              }}
              filterPlaceholder="Search URL"
            />

            {/* NEW */}
            <Column
              field="text"
              header={() => {
                return <div className="text-nowrap">📝 Anchor Text</div>;
              }}
              body={(e) => e?.text?.replace(siteDomain, "")}
            />

            <Column
              field="status"
              header={() => {
                return <div className="text-nowrap">📌 Status</div>;
              }}
              sortable
              filter
            />

            <Column
              field="source"
              header={() => {
                return <div className="text-nowrap">🌍 Source</div>;
              }}
              body={sourceBody}
            />
          </DataTable>
        </div>
      </div>

      {/* Filters Modal */}
      <Dialog
        header="Select Filters"
        visible={modalVisible}
        style={{ width: "50vw" }}
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
              label="Apply Filters"
              onClick={() => {
                // handle apply logic here
                setFilterModalVisible(false);
              }}
            />
          </div>
        }
      >
        <div className="grid gap-4">
          {filters.map((item) => {
            const { label, key, value } = item;

            return (
              <div key={key}>
                <label htmlFor={key} className="mb-2 inline-block">
                  {label}
                </label>

                <Chips
                  id={key}
                  value={value}
                  className="w-full"
                  inputClassName="w-full"
                  pt={{
                    container: {
                      className: "w-full",
                    },
                    inputToken: {
                      className: "w-full",
                    },
                  }}
                  onChange={(e) => {
                    updateFilterValue(key, e.value);
                  }}
                />
              </div>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
