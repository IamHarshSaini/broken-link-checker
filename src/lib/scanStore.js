export const scanStore = new Map();

export function createScan(scanId, url, options) {
  scanStore.set(scanId, {
    scanId,
    url,
    options,

    checked: 0,
    currentPage: "",
    brokenLinks: [],
    done: false,
    loading: true,
    paused: false,
    stopped: false,
  });
}

export function getScan(scanId) {
  return scanStore.get(scanId);
}

export function updateScan(scanId, updates) {
  const existing = scanStore.get(scanId);
  if (!existing) return;

  scanStore.set(scanId, {
    ...existing,
    ...updates,
  });
}

export function addBroken(scanId, item) {
  const existing = scanStore.get(scanId);
  if (!existing) return;

  existing.brokenLinks.unshift(item);
}

export function finishScan(scanId) {
  const existing = scanStore.get(scanId);
  if (!existing) return;

  existing.done = true;
  existing.loading = false;
}
