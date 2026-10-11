import { mkdtemp, readFile, rm, writeFile, link, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli, runJson } from "gunsmith/testing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCli } from "../app";
import { confirmOutputOverwrite } from "./confirm-output-overwrite";
import { renderInWorkerProcess } from "./render-process";

vi.mock("./confirm-output-overwrite", () => ({ confirmOutputOverwrite: vi.fn() }));
vi.mock("./render-process", () => ({ renderInWorkerProcess: vi.fn() }));

let directory: string;
let input: string;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text>Person</text></svg>';
const createApp = () => createCli({ version: "0.0.0", assetsDirectory: path.join(directory, "renderer") });
const renderArguments = () => ["render", input];
const renderSourceSvg = (source: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><metadata><![CDATA[${source}]]></metadata></svg>`;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tsdiagram-command-"));
  input = path.join(directory, "source.ts");
  await writeFile(input, "interface Person { name: string }");
  vi.mocked(confirmOutputOverwrite).mockReset();
  vi.mocked(confirmOutputOverwrite).mockResolvedValue(false);
  vi.mocked(renderInWorkerProcess).mockReset();
  vi.mocked(renderInWorkerProcess).mockResolvedValue({ svg, width: 120, height: 80, png: null });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it("generates root and render help from the command schemas", async () => {
  const root = await runCli(createApp(), []);
  expect(root.exitCode).toBe(0);
  expect(root.stdout).toContain("render");

  const command = await runCli(createApp(), ["render", "--help"]);
  expect(command.exitCode).toBe(0);
  expect(command.stdout).toContain("--max-side");
  expect(command.stdout).toContain("--timeout");
  expect(command.stdout).toContain("--code");
  expect(command.stdout).toContain("--force");
  expect(command.stdout).toContain("-o, --output");
  expect(command.stdout).toContain("cat domain.ts | tsdiagram render\n");
  expect(command.stdout).toContain("cat domain.ts | tsdiagram render -o diagram.svg");
  expect(command.stdout).not.toContain("--mcp");
});

it("exposes the render input and output schemas", async () => {
  const result = await runCli(createApp(), ["render", "--schema"]);
  expect(result.exitCode).toBe(0);

  const schema: unknown = JSON.parse(result.stdout);
  expect(schema).toHaveProperty("output.properties.svg");
  expect(schema).toHaveProperty("input.properties.maxSide");
  expect(schema).toHaveProperty("input.properties.code");
  expect(schema).toHaveProperty("input.properties.output.alias", "o");
  expect(schema).toHaveProperty("input.properties.outputPath");
});

it("rejects an invalid option value before rendering", async () => {
  const result = await runJson(createApp(), [...renderArguments(), "--scale", "0"]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", message: expect.stringContaining("scale") },
  });
  expect(await readdir(directory)).toEqual(["source.ts"]);
});

it("writes the default SVG path and reports human success", async () => {
  const result = await runCli(createApp(), renderArguments());
  const output = path.join(directory, "source.svg");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe(`wrote ${output}\n`);
  expect(result.stderr).toBe("");
  expect(await readFile(output, "utf8")).toBe(svg);
});

it("returns written file metadata without progress text in JSON mode", async () => {
  const result = await runJson(createApp(), [...renderArguments(), "--verbose"]);
  expect(result.exitCode).toBe(0);
  expect(result.json).toEqual({
    input,
    svg: { path: path.join(directory, "source.svg"), bytes: Buffer.byteLength(svg), width: 120, height: 80 },
    png: null,
  });
  expect(result.stderr).toBe("");
});

it("protects an existing diagram.svg for stdin in JSON mode even with a terminal", async () => {
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  vi.mocked(confirmOutputOverwrite).mockResolvedValue(true);
  const output = path.join(directory, "diagram.svg");
  await writeFile(output, "previous diagram");

  const result = await runJson(createApp(), ["render"], { stdin: "interface Person {}", isTTY: true });
  expect(result.exitCode).toBe(2);
  expect(result.json).toEqual({
    ok: false,
    error: { code: "USAGE", message: `Output files already exist:\n  ${output}\nUse --force to overwrite.` },
  });
  expect(result.stderr).toBe("");
  expect(await readFile(output, "utf8")).toBe("previous diagram");
});

it("refuses an existing PNG without creating the SVG in a noninteractive run", async () => {
  const output = path.join(directory, "source.svg");
  const pngOutput = path.join(directory, "source.png");
  await writeFile(pngOutput, "previous PNG");

  const result = await runCli(createApp(), [...renderArguments(), "--png"]);
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(pngOutput);
  expect(result.stderr).toContain("--force");
  expect(await readFile(pngOutput, "utf8")).toBe("previous PNG");
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("leaves both outputs unchanged when overwrite confirmation is declined", async () => {
  const output = path.join(directory, "source.svg");
  const pngOutput = path.join(directory, "source.png");
  await writeFile(output, "previous SVG");
  await writeFile(pngOutput, "previous PNG");

  const result = await runCli(createApp(), [...renderArguments(), "--png"], { isTTY: true });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Overwrite cancelled. No files were written.");
  expect(await readFile(output, "utf8")).toBe("previous SVG");
  expect(await readFile(pngOutput, "utf8")).toBe("previous PNG");
});

it("replaces both outputs after interactive confirmation", async () => {
  const output = path.join(directory, "source.svg");
  const pngOutput = path.join(directory, "source.png");
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  await writeFile(output, "previous SVG");
  await writeFile(pngOutput, "previous PNG");
  vi.mocked(confirmOutputOverwrite).mockResolvedValue(true);
  vi.mocked(renderInWorkerProcess).mockResolvedValue({
    svg,
    width: 120,
    height: 80,
    png: { bytes: pngBytes, width: 240, height: 160 },
  });

  const result = await runCli(createApp(), [...renderArguments(), "--png"], { isTTY: true });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`wrote ${output}`);
  expect(result.stdout).toContain(`wrote ${pngOutput}`);
  expect(await readFile(output, "utf8")).toBe(svg);
  expect(await readFile(pngOutput)).toEqual(Buffer.from(pngBytes));
});

it("overwrites existing stdin outputs with --force in JSON mode", async () => {
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  const output = path.join(directory, "diagram.svg");
  const pngOutput = path.join(directory, "diagram.png");
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  await writeFile(output, "previous SVG");
  await writeFile(pngOutput, "previous PNG");
  vi.mocked(renderInWorkerProcess).mockResolvedValue({
    svg,
    width: 120,
    height: 80,
    png: { bytes: pngBytes, width: 240, height: 160 },
  });

  const result = await runJson(createApp(), ["render", "--png", "--force"], { stdin: "interface Person {}" });
  expect(result.exitCode).toBe(0);
  expect(result.json).toMatchObject({ input: null, svg: { path: output }, png: { path: pngOutput } });
  expect(await readFile(output, "utf8")).toBe(svg);
  expect(await readFile(pngOutput)).toEqual(Buffer.from(pngBytes));
});

it("preserves an output file created while rendering", async () => {
  const output = path.join(directory, "source.svg");
  vi.mocked(renderInWorkerProcess).mockImplementation(async () => {
    await writeFile(output, "another render's output");
    return { svg, width: 120, height: 80, png: null };
  });

  const result = await runJson(createApp(), renderArguments());
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({
    ok: false,
    error: { code: "USAGE", message: expect.stringContaining("--force") },
  });
  expect(await readFile(output, "utf8")).toBe("another render's output");
});

it.each([
  { form: "positional", outputArguments: [] },
  { form: "named", outputArguments: ["--output"] },
])(
  "renders inline source exactly with $form output without echoing the source",
  async ({ outputArguments }) => {
    const source = 'interface Person {\n  name: "Zoë & 李";\n}\n';
    const output = path.join(directory, "inline.svg");
    vi.mocked(renderInWorkerProcess).mockImplementation(async ({ source: text }) => ({
      svg: renderSourceSvg(text),
      width: 120,
      height: 80,
      png: null,
    }));

    const result = await runJson(createApp(), ["render", "--code", source, ...outputArguments, output], {
      env: { NODE_ENV: "development" },
      stdin: "this input is not selected",
    });
    expect(result.exitCode).toBe(0);
    expect(result.json).toEqual({
      input: null,
      svg: { path: output, bytes: Buffer.byteLength(renderSourceSvg(source)), width: 120, height: 80 },
      png: null,
    });
    expect(result.stderr).toBe("");
    expect(await readFile(output, "utf8")).toBe(renderSourceSvg(source));
  }
);

it.each([
  { form: "positional", outputArguments: ["-"] },
  { form: "named", outputArguments: ["-o"] },
])("renders piped source exactly with $form SVG and PNG outputs", async ({ outputArguments }) => {
  const source = 'interface Person {\n  name: "Renée & 李";\n}\n';
  const output = path.join(directory, "piped.svg");
  const pngOutput = path.join(directory, "piped.png");
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  vi.mocked(renderInWorkerProcess).mockImplementation(async ({ source: text }) => ({
    svg: renderSourceSvg(text),
    width: 120,
    height: 80,
    png: { bytes: pngBytes, width: 240, height: 160 },
  }));

  const result = await runJson(createApp(), ["render", ...outputArguments, output, "--png"], {
    stdin: source,
    env: { NODE_ENV: "development" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.json).toEqual({
    input: null,
    svg: { path: output, bytes: Buffer.byteLength(renderSourceSvg(source)), width: 120, height: 80 },
    png: { path: pngOutput, bytes: pngBytes.byteLength, width: 240, height: 160 },
  });
  expect(result.stderr).toBe("");
  expect(await readFile(output, "utf8")).toBe(renderSourceSvg(source));
  expect(await readFile(pngOutput)).toEqual(Buffer.from(pngBytes));
});

it.each([
  { mode: "stdin", args: ["render", "-"] },
  { mode: "code", args: ["render", "--code", ""] },
])("accepts empty $mode source like an empty file", async ({ args }) => {
  const output = path.join(directory, "empty.svg");
  vi.mocked(renderInWorkerProcess).mockImplementation(async ({ source }) => ({
    svg: renderSourceSvg(source),
    width: 120,
    height: 80,
    png: null,
  }));

  const result = await runCli(createApp(), [...args, output], { stdin: "" });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe(`wrote ${output}\n`);
  expect(result.stderr).toBe("");
  expect(await readFile(output, "utf8")).toBe(renderSourceSvg(""));
});

it.each([
  { mode: "implicit", args: ["render"] },
  { mode: "explicit", args: ["render", "-"] },
])("writes diagram.svg and diagram.png for $mode stdin without an output path", async ({ args }) => {
  vi.spyOn(process, "cwd").mockReturnValue(directory);

  const source = 'interface Person {\n  name: "Zoë";\n}\n';
  const output = path.join(directory, "diagram.svg");
  const pngOutput = path.join(directory, "diagram.png");
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  vi.mocked(renderInWorkerProcess).mockImplementation(async ({ source: text }) => ({
    svg: renderSourceSvg(text),
    width: 120,
    height: 80,
    png: { bytes: pngBytes, width: 240, height: 160 },
  }));

  const result = await runJson(createApp(), [...args, "--png"], {
    stdin: source,
    env: { NODE_ENV: "development" },
  });
  expect(result.exitCode).toBe(0);
  expect(result.json).toEqual({
    input: null,
    svg: { path: output, bytes: Buffer.byteLength(renderSourceSvg(source)), width: 120, height: 80 },
    png: { path: pngOutput, bytes: pngBytes.byteLength, width: 240, height: 160 },
  });
  expect(result.stderr).toBe("");
  expect(await readFile(output, "utf8")).toBe(renderSourceSvg(source));
  expect(await readFile(pngOutput)).toEqual(Buffer.from(pngBytes));
});

it("defaults inline code to diagram.svg without reading available stdin", async () => {
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  const source = "interface Person {}";
  const output = path.join(directory, "diagram.svg");
  vi.mocked(renderInWorkerProcess).mockImplementation(async ({ source: text }) => ({
    svg: renderSourceSvg(text),
    width: 120,
    height: 80,
    png: null,
  }));

  const result = await runJson(createApp(), ["render", "--code", source], {
    stdin: "interface Other {}",
  });
  expect(result.exitCode).toBe(0);
  expect(result.json).toEqual({
    input: null,
    svg: { path: output, bytes: Buffer.byteLength(renderSourceSvg(source)), width: 120, height: 80 },
    png: null,
  });
  expect(result.stderr).toBe("");
  expect(await readFile(output, "utf8")).toBe(renderSourceSvg(source));
});

it.each([
  { mode: "implicit", args: ["render"] },
  { mode: "explicit", args: ["render", "-"] },
])("requires input for $mode stdin when no pipe or redirection is available", async ({ args }) => {
  const result = await runJson(createApp(), args);
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({
    ok: false,
    error: { code: "USAGE", message: expect.stringContaining("No stdin is available") },
  });
});

it("rejects named and positional output paths for file input before writing", async () => {
  const output = path.join(directory, "diagram.svg");
  const result = await runJson(createApp(), [
    ...renderArguments(),
    output,
    "--output",
    path.join(directory, "other.svg"),
  ]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toEqual({
    ok: false,
    error: { code: "USAGE", message: "Choose either --output or a positional output path, not both." },
  });
  expect(await readdir(directory)).toEqual(["source.ts"]);
});

it("rejects named and positional output paths for inline code before writing", async () => {
  const output = path.join(directory, "diagram.svg");
  const result = await runJson(createApp(), [
    "render",
    "--code",
    "interface Person {}",
    output,
    "-o",
    path.join(directory, "other.svg"),
  ]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toEqual({
    ok: false,
    error: { code: "USAGE", message: "Choose either --output or a positional output path, not both." },
  });
  expect(await readdir(directory)).toEqual(["source.ts"]);
});

it.each([
  {
    selection: "inline code with '-' for stdin",
    sourceArguments: ["-", "diagram.svg"],
    message: "Choose either --code or '-' for stdin.",
  },
  {
    selection: "inline code with an input file",
    sourceArguments: ["source.ts", "diagram.svg"],
    message: "--code accepts only one positional argument: the SVG output path.",
  },
])("rejects $selection before writing", async ({ sourceArguments, message }) => {
  vi.spyOn(process, "cwd").mockReturnValue(directory);

  const result = await runJson(createApp(), ["render", "--code", "interface Person {}", ...sourceArguments], {
    stdin: "interface Other {}",
  });
  expect(result.exitCode).toBe(2);
  expect(result.json).toEqual({ ok: false, error: { code: "USAGE", message } });
  expect(await readdir(directory)).toEqual(["source.ts"]);
});

it("times out while waiting for implicit stdin without publishing output", async () => {
  vi.useFakeTimers();
  vi.spyOn(process, "cwd").mockReturnValue(directory);

  const readStarted = Promise.withResolvers<void>();
  const pendingInput = Promise.withResolvers<string>();
  let stdout = "";
  const run = createApp().serve(["render", "--timeout", "1"], {
    format: "json",
    stdout: (text) => {
      stdout += text;
    },
    exit: () => {},
    stdin: () => {
      readStarted.resolve();
      return pendingInput.promise;
    },
  });
  await readStarted.promise;
  await vi.advanceTimersByTimeAsync(1000);

  expect(await run).toBe(1);
  expect(JSON.parse(stdout)).toEqual({
    ok: false,
    error: { code: "UNKNOWN", message: "Rendering timed out after 1s" },
  });

  pendingInput.resolve("interface Late {}");
  await pendingInput.promise;
  expect(await readdir(directory)).toEqual(["source.ts"]);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels a pending stdin read on SIGTERM and restores signal listeners", async () => {
  const readStarted = Promise.withResolvers<void>();
  const pendingInput = Promise.withResolvers<string>();
  const listeners = process.listenerCount("SIGTERM");
  let stdout = "";
  const run = createApp().serve(["render", "-", path.join(directory, "piped.svg")], {
    format: "json",
    stdout: (text) => {
      stdout += text;
    },
    exit: () => {},
    stdin: () => {
      readStarted.resolve();
      return pendingInput.promise;
    },
  });
  await readStarted.promise;
  process.emit("SIGTERM");

  expect(await run).toBe(1);
  expect(JSON.parse(stdout)).toEqual({
    ok: false,
    error: { code: "UNKNOWN", message: "Rendering cancelled by SIGTERM" },
  });
  expect(process.listenerCount("SIGTERM")).toBe(listeners);

  pendingInput.resolve("interface Late {}");
  await pendingInput.promise;
  expect(await readdir(directory)).toEqual(["source.ts"]);
});

it("reports stdin read failures as usage errors without publishing output", async () => {
  let stdout = "";
  const exitCode = await createApp().serve(["render", "-", path.join(directory, "piped.svg")], {
    format: "json",
    stdout: (text) => {
      stdout += text;
    },
    exit: () => {},
    stdin: () => Promise.reject(new Error("pipe failed")),
  });
  expect(exitCode).toBe(2);
  expect(JSON.parse(stdout)).toEqual({
    ok: false,
    error: { code: "USAGE", message: "Could not read stdin: pipe failed" },
  });
  expect(await readdir(directory)).toEqual(["source.ts"]);
});

it("accepts reserved characters and arbitrary extensions in the output path", async () => {
  const output = path.join(directory, "résumé #1?%20.artifact");
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  vi.mocked(renderInWorkerProcess).mockResolvedValue({
    svg,
    width: 120,
    height: 80,
    png: { bytes: pngBytes, width: 240, height: 160 },
  });
  const result = await runJson(createApp(), [...renderArguments(), output, "--png"]);
  expect(result.exitCode).toBe(0);
  expect(result.json).toMatchObject({
    svg: { path: output },
    png: { path: `${output}.png`, bytes: 4, width: 240, height: 160 },
  });
  expect(await readFile(output, "utf8")).toBe(svg);
  expect(await readFile(`${output}.png`)).toEqual(Buffer.from(pngBytes));
});

it("reports an unavailable input as a usage error", async () => {
  const result = await runJson(createApp(), ["render", path.join(directory, "missing.ts")]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({ ok: false, error: { code: "USAGE" } });
});

it("rejects an output that would overwrite the input", async () => {
  const result = await runJson(createApp(), [...renderArguments(), input]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toEqual({
    ok: false,
    error: { code: "USAGE", message: `Output would overwrite the input file: ${input}` },
  });
  expect(await readFile(input, "utf8")).toBe("interface Person { name: string }");
});

it("rejects a PNG output hard-linked to the input even with --force", async () => {
  const pngOutput = path.join(directory, "diagram.png");
  await link(input, pngOutput);
  const result = await runJson(createApp(), [
    ...renderArguments(),
    path.join(directory, "diagram.svg"),
    "--png",
    "--force",
  ]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toEqual({
    ok: false,
    error: { code: "USAGE", message: `Output would overwrite the input file: ${pngOutput}` },
  });
  expect(await readFile(input, "utf8")).toBe("interface Person { name: string }");
});

it("rejects SVG and PNG outputs sharing a hard link even with --force", async () => {
  const output = path.join(directory, "diagram.svg");
  const pngOutput = path.join(directory, "diagram.png");
  await writeFile(output, "previous export");
  await link(output, pngOutput);

  const result = await runJson(createApp(), [...renderArguments(), output, "--png", "--force"]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({
    ok: false,
    error: { code: "USAGE", message: expect.stringContaining("same file") },
  });
  expect(await readFile(output, "utf8")).toBe("previous export");
  expect(await readFile(pngOutput, "utf8")).toBe("previous export");
});

it("rejects a dangling PNG symlink to the SVG output before creating either file", async () => {
  const output = path.join(directory, "diagram.svg");
  const pngOutput = path.join(directory, "diagram.png");
  await symlink(output, pngOutput);

  const result = await runJson(createApp(), [...renderArguments(), output, "--png"]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({
    ok: false,
    error: { code: "USAGE", message: expect.stringContaining("same file") },
  });
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(pngOutput)).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports a render failure without publishing output", async () => {
  vi.mocked(renderInWorkerProcess).mockRejectedValue(new Error("Could not lay out diagram"));
  const result = await runJson(createApp(), renderArguments());
  expect(result.exitCode).toBe(1);
  expect(result.json).toEqual({
    ok: false,
    error: { code: "UNKNOWN", message: "Could not lay out diagram" },
  });
  await expect(readFile(path.join(directory, "source.svg"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports output write failure as a usage error", async () => {
  const result = await runJson(createApp(), [
    ...renderArguments(),
    path.join(directory, "missing", "diagram.svg"),
  ]);
  expect(result.exitCode).toBe(2);
  expect(result.json).toMatchObject({
    ok: false,
    error: { code: "USAGE", message: expect.stringContaining("Could not write output") },
  });
});
