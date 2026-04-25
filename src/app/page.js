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

  const [url, setUrl] = useState("");
  const [done, setDone] = useState(false);
  const [checked, setChecked] = useState(0);
  const [sitemap, setSitemap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [currentPage, setCurrentPage] = useState("");
  const [brokenLinks, setBrokenLinks] = useState([]);
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

  // ⚡ Speed
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

  const startScan = async () => {
    try {
      setLoading(true);
      setChecked(0);
      setCurrentPage("");
      setBrokenLinks([]);
      setDone(false);
      setStartTime(Date.now());

      const filtersPayLoad = filters.reduce((a, b) => {
        return { ...a, [b.key]: b.value };
      }, {});

      await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, options: { ...filtersPayLoad, sitemap } }),
      });
    } catch (error) {}
  };

  const updateFilterValue = (targetKey, newValue) => {
    setFilters((prev) =>
      prev.map((item) =>
        item.key === targetKey ? { ...item, value: newValue } : item,
      ),
    );
  };

  const TableHeader = () => {
    return (
      <header className="flex gap-4 bg-white">
        {currentPage ? (
          <div className="flex px-4 items-center grow border rounded">
            <span className="font-medium">{currentPage.replace(url, "")}</span>
          </div>
        ) : (
          <InputText
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1"
          />
        )}

        <Button
          outlined
          label="Filters"
          disabled={loading}
          icon="pi pi-filter"
          onClick={(e) => setFilterModalVisible(true)}
        />
        <Button
          loading={loading}
          disabled={loading}
          onClick={startScan}
          className="w-37.5"
          label={loading ? "Scaning" : "Scan"}
        />

        <ToggleButton
          checked={sitemap}
          disabled={loading}
          onLabel="🗺️ Scan from Sitemap"
          offLabel="🌐 Crawl Website Pages"
          onChange={(e) => setSitemap(e.value)}
        />

        {brokenLinks?.length > 0 && (
          <Button
            outlined
            className="w-37.5"
            label={"Download"}
            icon="pi pi-download"
          />
        )}
      </header>
    );
  };

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000/ws");
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "progress") {
        setChecked(msg.checked);
        setCurrentPage(msg.currentPage);
      }
      if (msg.type === "broken") {
        setBrokenLinks((prev) => [msg.data, ...prev]);
      }
      if (msg.type === "done") {
        setDone(true);
        setLoading(false);
      }
    };
    return () => ws.close();
  }, []);

  return (
    <>
      <div className="grid grid-cols-[280px_1fr] min-h-screen bg-linear-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col gap-4 p-5 sticky top-0 border-r bg-white/80 backdrop-blur-md">
          {[
            { label: "Checked", value: checked, emoji: "🔍" },
            { label: "Speed", value: `${speed}/s`, emoji: "⚡" },
            { label: "Broken", value: brokenLinks.length, emoji: "🚨" },
            {
              label: "Status",
              value: done ? "Done" : "Running",
              emoji: done ? "✅" : "⏳",
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

        {/* Table Section */}
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
      <Dialog
        disabled
        header="Select Filters"
        visible={modalVisible}
        style={{ width: "50vw" }}
        onHide={() => {
          if (!modalVisible) return;
          setFilterModalVisible(false);
        }}
      >
        <div className="grid gap-4">
          {filters.map((x) => {
            const { label, key, type, value } = x;

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
