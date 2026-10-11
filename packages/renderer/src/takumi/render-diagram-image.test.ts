import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, assert, beforeAll, expect, it } from "vitest";
import { renderDiagramImage } from "./render-diagram-image";

let assetsDirectory: string;

beforeAll(async () => {
  assetsDirectory = await mkdtemp(path.join(tmpdir(), "tsdiagram-image-assets-"));
  const buildScript = fileURLToPath(new URL("../../scripts/build-renderer-assets.mjs", import.meta.url));
  await promisify(execFile)(process.execPath, [buildScript, assetsDirectory]);
});

afterAll(async () => {
  await rm(assetsDirectory, { recursive: true, force: true });
});

it("renders related models to browser-free SVG and scales its PNG to the requested bound", async () => {
  const result = await renderDiagramImage({
    source: "interface User { name: string; address: Address } interface Address { street: string }",
    assetsDirectory,
    png: { scale: 2, maxSide: 300 },
  });

  expect(result.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(result.svg).toContain(
    `width="${result.width}" height="${result.height}" viewBox="0 0 ${result.width} ${result.height}"`
  );
  expect(result.svg).toContain("<path");
  expect(result.svg).not.toContain("foreignObject");

  const imageTypes = [...result.svg.matchAll(/<image\b[^>]*href="data:([^;,]+)/g)].map((match) => match[1]);
  expect(imageTypes).toHaveLength(3);
  expect(new Set(imageTypes)).toEqual(new Set(["image/svg+xml"]));

  expect(result.width).toBeGreaterThan(100);
  expect(result.height).toBeGreaterThan(50);
  assert.exists(result.png);
  expect(Math.max(result.png.width, result.png.height)).toBe(300);
  expect([...result.png.bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  const header = new DataView(result.png.bytes.buffer, result.png.bytes.byteOffset);
  expect(header.getUint32(16)).toBe(result.png.width);
  expect(header.getUint32(20)).toBe(result.png.height);
});

it("applies vertical layout, dark colors, and neutral edges when requested", async () => {
  const source =
    "interface First { second: Second } interface Second { third: Third } interface Third { value: string }";
  const horizontal = await renderDiagramImage({ source, assetsDirectory, options: { compactLayout: false } });
  const vertical = await renderDiagramImage({
    source,
    assetsDirectory,
    options: { direction: "vertical", compactLayout: false, theme: "dark", colorizeEdges: false },
  });

  expect(horizontal.width).toBeGreaterThan(horizontal.height);
  expect(vertical.height).toBeGreaterThan(vertical.width);
  expect(vertical.svg).toContain('fill="#141414"');

  const edgeLayer = vertical.svg.match(/<image\b[^>]*href="data:image\/svg\+xml;base64,([^"]+)"/);
  assert.exists(edgeLayer);

  const edges = Buffer.from(edgeLayer[1], "base64").toString("utf8");
  expect(edges.match(/<path /g)).toHaveLength(2);
  expect(edges).toContain('stroke="rgba(122, 122, 122, 1)"');
});

it("omits badge-hub edges by default and restores them when disabled", async () => {
  const source = `
    type Id = string;
    interface First { ids: Id[] }
    interface Second { ids: Id[] }
    interface Third { ids: Id[] }
    interface Fourth { ids: Id[] }
    interface Fifth { ids: Id[] }
    interface Sixth { ids: Id[] }
  `;
  const badges = await renderDiagramImage({ source, assetsDirectory });
  const nodes = await renderDiagramImage({ source, assetsDirectory, options: { badgeHubs: false } });
  const badgeLayer = badges.svg.match(/<image\b[^>]*href="data:image\/svg\+xml;base64,([^"]+)"/);
  assert.exists(badgeLayer);

  const nodeLayer = nodes.svg.match(/<image\b[^>]*href="data:image\/svg\+xml;base64,([^"]+)"/);
  assert.exists(nodeLayer);

  expect(Buffer.from(badgeLayer[1], "base64").toString("utf8")).not.toContain("<path ");
  expect(
    Buffer.from(nodeLayer[1], "base64")
      .toString("utf8")
      .match(/<path /g)
  ).toHaveLength(6);
});

it("renders an empty source as a padded empty canvas without a PNG", async () => {
  const result = await renderDiagramImage({ source: "", assetsDirectory });

  expect(result.width).toBe(36);
  expect(result.height).toBe(36);
  expect(result.png).toBeNull();
});
