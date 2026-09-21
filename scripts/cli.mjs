#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createScan, getScan } from "../src/lib/scanStore.js";
import { runCrawler } from "../src/lib/crawler.js";

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    flags[key] = value === undefined ? true : value;
  }
  return flags;
}

async function main() {
  const [url, ...rest] = process.argv.slice(2);

  if (!url) {
    console.error(
      "Usage: node scripts/cli.mjs <url> [--concurrency=N] [--max-depth=N] [--crawl-delay=N]\n" +
        "                             [--no-external] [--no-resources] [--ignore-robots] [--webhook-url=URL]",
    );
    process.exit(2);
  }

  const flags = parseArgs(rest);
  const options = {
    concurrency: Number(flags["concurrency"] ?? 10),
    maxDepth: Number(flags["max-depth"] ?? 0),
    crawlDelay: Number(flags["crawl-delay"] ?? 0),
    checkExternal: !flags["no-external"],
    checkResources: !flags["no-resources"],
    respectRobotsTxt: !flags["ignore-robots"],
    ...(flags["webhook-url"] ? { webhookUrl: flags["webhook-url"] } : {}),
  };

  const scanId = randomUUID();
  createScan(scanId, url, options);

  console.log(`Scanning ${url} ...`);
  await runCrawler(url, scanId, options);

  const scan = getScan(scanId);
  const broken = scan?.brokenLinks || [];

  console.log(`\nChecked ${scan.checkedPages} page(s), ${scan.checkedLinks} link(s).`);

  if (broken.length === 0) {
    console.log("No broken links found.");
    process.exit(0);
  }

  console.log(`Found ${broken.length} broken link(s):\n`);
  for (const b of broken) {
    console.log(`  [${b.status}] ${b.url}`);
    console.log(`      on ${b.source}`);
  }

  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(2);
});
