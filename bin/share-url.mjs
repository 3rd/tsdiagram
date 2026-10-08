import lzString from "lz-string";

// lz-string is CommonJS, so Node needs the default import
const { compressToEncodedURIComponent } = lzString;

/**
 * Builds the URL that opens `source` as the current document, in the same
 * `#/<lz-string>` format that the share dialog writes.
 */
export const buildShareUrl = (appUrl, source, title = "diagram") => {
  const id = "cli";
  const state = {
    documents: [{ id, title, source, lastModified: Date.now() }],
    currentDocumentId: id,
  };
  const base = new URL(appUrl);
  base.searchParams.set("export", "svg");
  base.hash = `/${compressToEncodedURIComponent(JSON.stringify(state))}`;
  return base.toString();
};

/** Reads the width and height of an SVG document from its root element. */
export const readSvgSize = (svg) => {
  const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const read = (name) => {
    const value = root.match(new RegExp(`\\s${name}="([\\d.]+)`))?.[1];
    return value ? Math.ceil(Number(value)) : null;
  };
  const width = read("width");
  const height = read("height");
  if (width && height) return { width, height };
  const viewBox = root
    .match(/viewBox="([\d.\s-]+)"/)?.[1]
    ?.trim()
    .split(/\s+/)
    .map(Number);
  if (viewBox?.length === 4) return { width: Math.ceil(viewBox[2]), height: Math.ceil(viewBox[3]) };
  return null;
};
