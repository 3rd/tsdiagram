import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseModels } from "@tsdiagram/core";
import { Renderer } from "takumi-js/node";
import { afterAll, assert, beforeAll, expect, it } from "vitest";
import { loadDiagramAssets, resolveDiagramColors } from "./assets";
import { createModelCardNode, measureModelCard } from "./model-card";

let assetsDirectory: string;

beforeAll(async () => {
  assetsDirectory = await mkdtemp(path.join(tmpdir(), "tsdiagram-card-assets-"));
  const buildScript = fileURLToPath(new URL("../../scripts/build-renderer-assets.mjs", import.meta.url));
  await promisify(execFile)(process.execPath, [buildScript, assetsDirectory]);
});

afterAll(async () => {
  await rm(assetsDirectory, { recursive: true, force: true });
});

it("measures the visible header and field port boxes without changing rich card dimensions", async () => {
  const models = parseModels(`
    interface Target { value: string }
    interface Card<T extends Target> extends Target {
      readonly optional?: Target;
      read(input: Target): Target;
      read(input: Target, suffix: string): Target;
    }
    interface Consumer { card: Card<Target> }
  `);
  const model = models.find((candidate) => candidate.name === "Card");
  assert.exists(model);

  const renderer = new Renderer();
  const stylesheet = await loadDiagramAssets(assetsDirectory, renderer);
  const colors = await resolveDiagramColors(renderer, stylesheet, "dark");
  const card = await createModelCardNode({
    model,
    badgeHubIds: new Set(),
    portColors: new Map(),
    paneColor: colors.pane,
    accentColor: colors.accent,
    theme: "dark",
  });
  const css = [stylesheet, ...card.css];
  const visible = await renderer.measure(card.node, { css });
  const measured = await measureModelCard({ renderer, node: card.node, css });

  expect({ width: measured.width, height: measured.height }).toEqual({
    width: visible.width,
    height: visible.height,
  });

  const portIds = ["Card-target", "Card-source", "Card-source-optional", "Card-source-read"];
  expect(new Set(measured.ports.keys())).toEqual(new Set(portIds));

  const svg = await renderer.renderSvg(card.node, { css });
  const images = [...svg.matchAll(/<image x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)];
  expect(images).toHaveLength(measured.ports.size);

  for (const [index, id] of portIds.entries()) {
    const port = measured.ports.get(id);
    assert.exists(port);

    const [, x, y, width, height] = images[index];
    expect(port.x).toBe(Number(x) + (port.type === "source" ? Number(width) : 0));
    expect(port.y).toBe(Number(y) + Number(height) / 2);
  }
});
