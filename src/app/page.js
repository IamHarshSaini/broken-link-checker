"use client";

import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { DataTable } from "primereact/datatable";
import { useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
  const dt = useRef(null);

  const [done, setDone] = useState(false);
  const [checked, setChecked] = useState(0);
  const [currentPage, setCurrentPage] = useState("");
  const [brokenLinks, setBrokenLinks] = useState([]);

  const [url, setUrl] = useState("");

  const [startTime, setStartTime] = useState(null);
  const [globalFilter, setGlobalFilter] = useState("");

  const [statusFilter, setStatusFilter] = useState(null);
  const [filters, setFilters] = useState({
    includeStartsWith: "",
    excludeStartsWith: "",
    includeIncludes: "",
    excludeIncludes: "",
  });

  const parseList = (str) =>
    str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const startScan = async () => {
    setChecked(0);
    setCurrentPage("");
    setBrokenLinks([]);
    setDone(false);
    setStartTime(Date.now());

    const options = {
      includeStartsWith: parseList(filters.includeStartsWith),
      excludeStartsWith: parseList(filters.excludeStartsWith),
      includeIncludes: parseList(filters.includeIncludes),
      excludeIncludes: parseList(filters.excludeIncludes),
    };

    await fetch("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, options }),
    });
  };

  // ⚡ Speed
  const speed = useMemo(() => {
    if (!startTime) return 0;
    const seconds = (Date.now() - startTime) / 1000;
    return seconds ? (checked / seconds).toFixed(1) : 0;
  }, [checked, startTime]);

  const filtered = useMemo(() => {
    let data = brokenLinks;
    if (statusFilter) {
      data = data.filter((d) => String(d.status) === statusFilter);
    }

    return data;
  }, [brokenLinks, statusFilter]);

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

  const sourceBody = (row) => (
    <a
      href={row.source}
      title={row.source}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline"
    >
      Open
    </a>
  );

  const TableHeader = () => {
    return (
      <header className="flex gap-4 bg-white">
        {currentPage ? (
          <div className="relative flex px-4 items-center grow border rounded">
            <div
              className="h-full absolute -z-1 top-0 left-0 bg-blue-300 transition-all duration-300 rounded"
              style={{
                width: `${done ? 100 : Math.min((checked / 1000) * 100, 95)}%`,
              }}
            />
            <span>{currentPage}</span>
          </div>
        ) : (
          <InputText
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1"
          />
        )}

        <Button label="Scan" className="w-[200px]" onClick={startScan} />
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
      }
    };
    return () => ws.close();
  }, []);

  return (
    <div className="grid grid-cols-[250px_1fr]">
      <div className="flex flex-col gap-4 p-4 sticky top-0 border-r">
        {[
          { label: "Checked", value: checked },
          { label: "Speed", value: `${speed}/s` },
          { label: "Broken", value: brokenLinks.length },
          { label: "Status", value: done ? "Done" : "Running" },
        ].map((item, i) => (
          <div key={i} className="bg-white border p-4 rounded-xl">
            <p className="text-lg font-semibold">{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
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
          value={filtered}
          scrollHeight={"flex"}
          header={<TableHeader />}
          globalFilter={globalFilter}
          emptyMessage="No broken links found"
          rowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
        >
          <Column
            field="url"
            body={urlBody}
            header="Bad URL"
            filterPlaceholder="Search URL"
          />

          <Column
            field="status"
            header="Status"
            sortable
            filter
            filterElement={(options) => (
              <Dropdown
                value={options.value}
                options={[
                  { label: "404", value: "404" },
                  { label: "500", value: "500" },
                  { label: "ERROR", value: "ERROR" },
                ]}
                onChange={(e) => options.filterApplyCallback(e.value)}
                placeholder="Status"
              />
            )}
          />

          <Column field="source" header="Source" body={sourceBody} />
        </DataTable>
      </div>
    </div>
  );
}
