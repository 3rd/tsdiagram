#!/usr/bin/env node
// Export a TypeScript file to SVG (and PNG) from the command line.
//
// Usage: tsdiagram-export <input.ts> [output.svg] [--png] [--scale 2]
//          [--url http://localhost:5173] [--chrome <path>] [--timeout 60]
//
// It opens the app in headless Chrome with the file as the current document
// and `?export=svg`, waits until the page publishes the SVG, and writes it.
// `--png` renders the SVG to PNG with a second Chrome run.
//
// Needs Node 22 or later (global WebSocket and fetch) and Google Chrome or
// Chromium. The app must be reachable at `--url`: run `pnpm dev` or
// `pnpm preview` first.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildShareUrl, readSvgSize } from "./share-url.mjs";

const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const parseArgs = (argv) => {
  const options = { url: "http://localhost:5173", png: false, scale: 2, timeout: 60, chrome: null };
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--png") options.png = true;
    else if (argument === "--url") options.url = argv[++index];
    else if (argument === "--chrome") options.chrome = argv[++index];
    else if (argument === "--scale") options.scale = Number(argv[++index]);
    else if (argument === "--timeout") options.timeout = Number(argv[++index]);
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--verbose") options.verbose = true;
    else positional.push(argument);
  }
  options.input = positional[0];
  options.output =
    positional[1] ?? (options.input ? options.input.replace(/\.[cm]?tsx?$/, "") + ".svg" : null);
  return options;
};

const findChrome = (explicit) => {
  const candidates = explicit ? [explicit] : CHROME_CANDIDATES;
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome not found. Pass --chrome <path> or set CHROME.");
  return found;
};

const startChrome = (chrome, userDataDir) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--remote-debugging-port=0",
        `--user-data-dir=${userDataDir}`,
        "--window-size=1600,1000",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve({ child, browserWsUrl: match[1] });
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited with code ${code}\n${stderr}`)));
    child.on("error", reject);
  });

/** A minimal DevTools client: one method call at a time, by id. */
const connect = (wsUrl) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener("open", () =>
      resolve({
        call: (method, params = {}, sessionId) =>
          new Promise((resolveCall, rejectCall) => {
            const id = nextId++;
            pending.set(id, { resolveCall, rejectCall });
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          }),
        close: () => socket.close(),
      })
    );
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !pending.has(message.id)) return;
      const { resolveCall, rejectCall } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCall(new Error(message.error.message));
      else resolveCall(message.result);
    });
    socket.addEventListener("error", () => reject(new Error(`Could not connect to ${wsUrl}`)));
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const verbose = process.argv.includes("--verbose");
const log = (message) => {
  if (verbose) console.error(`[tsdiagram-export] ${message}`);
};

const stopChrome = async (child) => {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, sleep(5000)]);
};

const exportSvg = async ({ chrome, pageUrl, timeout }) => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "tsdiagram-export-"));
  log(`starting ${chrome}`);
  const { child, browserWsUrl } = await startChrome(chrome, userDataDir);
  log(`devtools at ${browserWsUrl}`);
  try {
    const browser = await connect(browserWsUrl);
    log("connected, opening the page");
    try {
      const { targetId } = await browser.call("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await browser.call("Target.attachToTarget", { targetId, flatten: true });
      await browser.call("Page.enable", {}, sessionId);
      await browser.call("Runtime.enable", {}, sessionId);
      await browser.call("Page.navigate", { url: pageUrl }, sessionId);

      const deadline = Date.now() + timeout * 1000;
      while (Date.now() < deadline) {
        const { result } = await browser.call(
          "Runtime.evaluate",
          { expression: "JSON.stringify(window.__tsdiagramExport ?? null)", returnByValue: true },
          sessionId
        );
        const state = result.value ? JSON.parse(result.value) : null;
        if (state?.status === "done") {
          log(`svg received, ${state.svg.length} bytes`);
          return state.svg;
        }
        if (state?.status === "error") throw new Error(`Export failed in the page: ${state.message}`);
        await sleep(250);
      }
      throw new Error(`Timed out after ${timeout}s. Is the app running at the URL, and does the file parse?`);
    } finally {
      browser.close();
    }
  } finally {
    await stopChrome(child);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
};

const renderPng = async ({ chrome, svgPath, pngPath, scale }) => {
  const svg = await readFile(svgPath, "utf8");
  const size = readSvgSize(svg) ?? { width: 1600, height: 1000 };
  await new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--force-device-scale-factor=${scale}`,
        `--window-size=${size.width},${size.height}`,
        `--screenshot=${pngPath}`,
        `file://${path.resolve(svgPath)}`,
      ],
      { stdio: "ignore" }
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Chrome exited with code ${code}`))
    );
    child.on("error", reject);
  });
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input) {
    console.log(
      "Usage: tsdiagram-export <input.ts> [output.svg] [--png] [--scale 2] [--url http://localhost:5173] [--chrome <path>] [--timeout 60]"
    );
    process.exit(options.help ? 0 : 1);
  }
  const chrome = findChrome(options.chrome);
  const source = await readFile(options.input, "utf8");
  const pageUrl = buildShareUrl(options.url, source, path.basename(options.input));
  const svg = await exportSvg({ chrome, pageUrl, timeout: options.timeout });
  await writeFile(options.output, svg);
  console.log(`wrote ${options.output}`);
  if (options.png) {
    const pngPath = options.output.replace(/\.svg$/, "") + ".png";
    await renderPng({ chrome, svgPath: options.output, pngPath, scale: options.scale });
    console.log(`wrote ${pngPath}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
