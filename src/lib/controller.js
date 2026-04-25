export const crawlerControl = {
  paused: false,
  stopped: false,
};

export function pauseCrawler() {
  crawlerControl.paused = true;
}

export function resumeCrawler() {
  crawlerControl.paused = false;
}

export function stopCrawler() {
  crawlerControl.stopped = true;
}
