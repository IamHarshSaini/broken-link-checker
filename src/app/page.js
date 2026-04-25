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
  const [checked, setChecked] = useState(0);
  const [sitemap, setSitemap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [currentPage, setCurrentPage] = useState("");
  const [brokenLinks, setBrokenLinks] = useState([]);
  const [scanIdReady, setScanIdReady] = useState(false);
  const [modalVisible, setFilterModalVisible] = useState(false);

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

  // save scanId once
  useEffect(() => {
    let existingScanId = sessionStorage.getItem("scanId");

    if (!existingScanId) {
      existingScanId = crypto.randomUUID();
      sessionStorage.setItem("scanId", existingScanId);
    }

    scanIdRef.current = existingScanId;
    setScanIdReady(true);
  }, []);

  // restore state after reload
  useEffect(() => {
    if (!scanIdReady) return;

    async function restoreScan() {
      try {
        const res = await fetch(`/api/scan-state?scanId=${scanIdRef.current}`);

        const data = await res.json();

        if (!data) return;

        setUrl(data.url || "");

        setSitemap(Boolean(data.options?.sitemap));

        delete data.options.sitemap;

        setFilters((prev) =>
          prev.map((x) => {
            const { key } = x;
            if (data?.options?.[key]) {
              return { ...x, [key]: data.options[key] };
            } else {
              return x;
            }
          }),
        );

        setChecked(data.checked || 0);
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

    // connection opened
    ws.onopen = () => {
      console.log("✅ WS Connected:", scanIdRef.current);
    };

    // incoming messages
    ws.onmessage = (event) => {
      console.log("WS message:", event.data);

      const msg = JSON.parse(event.data);

      // ignore messages from other scans/tabs
      if (msg.scanId !== scanIdRef.current) return;

      if (msg.type === "progress") {
        setChecked(msg.checked || 0);
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

    // websocket error
    ws.onerror = (err) => {
      console.error("❌ WS Error:", err);
    };

    // websocket closed
    ws.onclose = () => {
      console.log("❌ WS Closed");
    };

    // cleanup
    return () => {
      ws.close();
    };
  }, [scanIdReady]);

  // speed
  const speed = useMemo(() => {
    if (!startTime) return 0;
    const seconds = (Date.now() - startTime) / 1000;
    return seconds ? (checked / seconds).toFixed(1) : 0;
  }, [checked, startTime]);

  const urlBody = (row) => {
    let path = row.url;

    try {
      const u = new URL(row.url);
      path = u.pathname + u.search;
    } catch {}

    return (
      <span
        className="text-blue-600 cursor-pointer hover:underline"
        onClick={() => navigator.clipboard.writeText(path)}
      >
        {path}
      </span>
    );
  };

  const sourceBody = (row) => {
    let path = row.source;

    try {
      const u = new URL(row.url);
      path = u.pathname + u.search;
    } catch {}

    return (
      <span
        className="text-blue-600 cursor-pointer hover:underline"
        title="Click to copy and open"
        onClick={() => {
          navigator.clipboard.writeText(path);
          window.open(row.source, "_blank", "noopener,noreferrer");
        }}
      >
        Open
      </span>
    );
  };

  // start scan
  const startScan = async () => {
    try {
      setLoading(true);
      setChecked(0);
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
          options: {
            ...filtersPayLoad,
            sitemap,
          },
        }),
      });
    } catch (error) {
      setLoading(false);
    }
  };

  // stop
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

    // optional backend reset call (recommended)
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

    setChecked(0);
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

  const TableHeader = () => {
    return (
      <header className="flex gap-4 bg-white flex-wrap">
        {loading ? (
          <div className="flex px-4 items-center grow border rounded min-w-[300px]">
            <span className="font-medium">{currentPage.replace(url, "")}</span>
          </div>
        ) : (
          <InputText
            value={url}
            disabled={loading}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 min-w-[300px]"
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
              onChange={async (e) => {
                const paused = e.value;
                setIsPaused(paused);
                await fetch("/api/control", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    action: paused ? "resume" : "pause",
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

        {!loading && !done && (
          <ToggleButton
            checked={sitemap}
            disabled={loading}
            onLabel="🗺️ Scan from Sitemap"
            offLabel="🌐 Crawl Website Pages"
            onChange={(e) => setSitemap(e.value)}
          />
        )}

        {brokenLinks?.length > 0 && (
          <Button
            outlined
            className="w-36"
            label="Download"
            icon="pi pi-download"
          />
        )}
      </header>
    );
  };

  return (
    <>
      <div className="grid grid-cols-[280px_1fr] min-h-screen bg-linear-to-br from-slate-50 to-blue-50">
        {/* Sidebar */}
        <div className="flex flex-col gap-4 p-5 sticky top-0 border-r bg-white/80 backdrop-blur-md">
          {[
            {
              label: "Checked",
              value: checked,
              emoji: "🔍",
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
              className="bg-white border border-slate-200 p-5 rounded"
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

        {/* Table */}
        <div className="h-screen">
          <DataTable
            ref={dt}
            rows={15}
            paginator
            scrollable
            size="small"
            scrollHeight="flex"
            value={brokenLinks}
            header={<TableHeader />}
            emptyMessage="No broken links found"
            rowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
          >
            <Column
              filter
              field="url"
              body={urlBody}
              header="🔗 URL"
              filterPlaceholder="Search URL"
            />

            <Column field="status" header="📌 Status" sortable filter />

            <Column field="source" header="🌍 Source" body={sourceBody} />
          </DataTable>
        </div>
      </div>

      {/* Filters Modal */}
      <Dialog
        header="Select Filters"
        visible={modalVisible}
        style={{ width: "50vw" }}
        onHide={() => setFilterModalVisible(false)}
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
