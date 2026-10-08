import { expect, it } from "vitest";
import { decompressFromEncodedURIComponent } from "lz-string";
import { buildShareUrl, readSvgSize } from "./share-url.mjs";

it("builds a share URL that the app reads as the current document, with the export flag", () => {
  const url = new URL(buildShareUrl("http://localhost:5173/", "interface A { a: string }", "a.ts"));
  expect(url.searchParams.get("export")).toBe("svg");
  const state = JSON.parse(decompressFromEncodedURIComponent(url.hash.slice(2)));
  expect(state.currentDocumentId).toBe("cli");
  expect(state.documents[0]).toMatchObject({ id: "cli", title: "a.ts", source: "interface A { a: string }" });
});

it("reads the size of an SVG from its attributes or its viewBox", () => {
  expect(readSvgSize('<svg xmlns="x" width="120.4" height="80" viewBox="0 0 120 80">')).toEqual({
    width: 121,
    height: 80,
  });
  expect(readSvgSize('<svg viewBox="0 0 300 150.5">')).toEqual({ width: 300, height: 151 });
  expect(readSvgSize("<svg>")).toBeNull();
});
