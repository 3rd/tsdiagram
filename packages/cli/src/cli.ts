#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createCli } from "./app";

const metadata: unknown = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const { version } = z.object({ version: z.string().min(1) }).parse(metadata);

const app = createCli({
  version,
  assetsDirectory: fileURLToPath(new URL("./renderer/", import.meta.url)),
});

await app.serve();
process.stdin.destroy();
