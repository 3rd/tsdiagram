import { elementToSVG } from "dom-to-svg";
import mainStyle from "../index.css?inline";
import reactFlowStyle from "../reactflow.css?inline";

const CONTAINER_QUERY = ".react-flow__viewport";
const EDGE_QUERY = ".react-flow__edge-path";
const HEADER_QUERY = ".svg-export-header";
const NODE_QUERY = ".react-flow__node";
const PADDING = 18;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SVGExportOptions = {
  edgeIds: readonly string[];
  nodeBounds: Bounds;
  nodeIds: readonly string[];
  signal: AbortSignal;
};

type CodePointRange = {
  start: number;
  end: number;
};

type FontFaceRule = {
  cssText: string;
  source: string;
  sourceURL: string;
  unicodeRanges: readonly CodePointRange[];
  weight: string;
};

type InlinedFontFaceRule = {
  cssText: string;
  unicodeRanges: readonly CodePointRange[];
  weight: string;
};

const fontFaceRulesByStyleSheet = new Map<string, Promise<FontFaceRule[]>>();
const inlinedFontFaceRules = new Map<string, Promise<InlinedFontFaceRule>>();

export class GraphSnapshotMismatchError extends Error {
  constructor() {
    super("The rendered diagram does not match the exported graph");
    this.name = "GraphSnapshotMismatchError";
  }
}

export const createAbortError = () => new DOMException("SVG export was cancelled", "AbortError");

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw createAbortError();
};

const waitForAbort = <T>(promise: Promise<T>, signal: AbortSignal) => {
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const rejectOnAbort = () => {
      signal.removeEventListener("abort", rejectOnAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", rejectOnAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", rejectOnAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", rejectOnAbort);
        reject(error);
      },
    );
  });
};

const getExportBounds = (container: Element, nodeBounds: Bounds) => {
  let left = nodeBounds.x;
  let top = nodeBounds.y;
  let right = nodeBounds.x + nodeBounds.width;
  let bottom = nodeBounds.y + nodeBounds.height;

  for (const edge of container.querySelectorAll<SVGGraphicsElement>(EDGE_QUERY)) {
    const edgeBounds = edge.getBBox();
    left = Math.min(left, edgeBounds.x);
    top = Math.min(top, edgeBounds.y);
    right = Math.max(right, edgeBounds.x + edgeBounds.width);
    bottom = Math.max(bottom, edgeBounds.y + edgeBounds.height);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
};

const getNumberAttribute = (element: Element, name: string) => {
  const value = element.getAttribute(name);
  if (value === null) throw new Error(`Missing ${name} on exported card header background`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${name} on exported card header background`);
  return number;
};

const preserveHeaderCornerRadii = (svgDocument: XMLDocument) => {
  for (const header of svgDocument.querySelectorAll(HEADER_QUERY)) {
    const backgroundLayer = header.querySelector(':scope > [data-stacking-layer="rootBackgroundAndBorders"]');
    const background =
      backgroundLayer?.querySelector<SVGRectElement>(":scope > rect") ??
      header.querySelector<SVGRectElement>(":scope > rect");
    if (!background) throw new Error("Could not find exported card header background");

    // dom-to-svg omits rx/ry when the radius is 0
    if (!background.hasAttribute("rx") || !background.hasAttribute("ry")) continue;
    const x = getNumberAttribute(background, "x");
    const y = getNumberAttribute(background, "y");
    const width = getNumberAttribute(background, "width");
    const height = getNumberAttribute(background, "height");
    const radiusX = getNumberAttribute(background, "rx");
    const radiusY = getNumberAttribute(background, "ry");
    const path = svgDocument.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute(
      "d",
      `M ${x} ${y + height} V ${y + radiusY} A ${radiusX} ${radiusY} 0 0 1 ${x + radiusX} ${y} H ${
        x + width - radiusX
      } A ${radiusX} ${radiusY} 0 0 1 ${x + width} ${y + radiusY} V ${y + height} Z`,
    );
    for (const attribute of background.attributes) {
      if (["height", "rx", "ry", "width", "x", "y"].includes(attribute.name)) continue;
      path.setAttribute(attribute.name, attribute.value);
    }
    background.replaceWith(path);
  }
};

const getImportedStyleSheetURLs = () => {
  const importedStyleSheetURLs = new Set<string>();
  for (const styleSheet of document.styleSheets) {
    try {
      for (const rule of styleSheet.cssRules) {
        if (rule instanceof CSSImportRule) importedStyleSheetURLs.add(rule.href);
      }
    } catch {}
  }
  return importedStyleSheetURLs;
};

const parseUnicodeRange = (unicodeRange: string) =>
  unicodeRange.split(",").flatMap((token): CodePointRange[] => {
    const match = /^u\+([\d?a-f]+)(?:-([\da-f]+))?$/i.exec(token.trim());
    if (!match) return [];
    const [, start, end] = match;
    if (end) return [{ start: Number.parseInt(start, 16), end: Number.parseInt(end, 16) }];
    return [
      {
        start: Number.parseInt(start.replaceAll("?", "0"), 16),
        end: Number.parseInt(start.replaceAll("?", "F"), 16),
      },
    ];
  });

const loadFontFaceRules = (url: string) => {
  const cachedRules = fontFaceRulesByStyleSheet.get(url);
  if (cachedRules) return cachedRules;

  const rules = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load font stylesheet: ${url}`);
    const styleSheetText = await response.text();
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(styleSheetText);
    return [...styleSheet.cssRules]
      .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
      .map((rule): FontFaceRule => {
        const sourceValue = rule.style.getPropertyValue("src");
        const source = /url\(["']?([^"')]+)["']?\)/.exec(sourceValue)?.[1];
        if (!source) throw new Error(`Could not find font source in stylesheet: ${url}`);
        return {
          cssText: rule.cssText,
          source,
          sourceURL: new URL(source, url).href,
          unicodeRanges: parseUnicodeRange(rule.style.getPropertyValue("unicode-range")),
          weight: rule.style.getPropertyValue("font-weight"),
        };
      });
  })();
  fontFaceRulesByStyleSheet.set(url, rules);
  rules.then(undefined, () => {
    if (fontFaceRulesByStyleSheet.get(url) === rules) fontFaceRulesByStyleSheet.delete(url);
  });
  return rules;
};

const loadImportedFontFaceRules = async () => {
  const results = await Promise.allSettled([...getImportedStyleSheetURLs()].map(loadFontFaceRules));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
};

const blobToDataURL = async (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error));
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.readAsDataURL(blob);
  });
};

const inlineFontFaceRule = (rule: FontFaceRule) => {
  const cacheKey = `${rule.sourceURL}\n${rule.cssText}`;
  const cachedRule = inlinedFontFaceRules.get(cacheKey);
  if (cachedRule) return cachedRule;

  const inlinedRule = (async () => {
    const response = await fetch(rule.sourceURL);
    if (!response.ok) throw new Error(`Could not load font: ${rule.sourceURL}`);
    const dataURL = await blobToDataURL(await response.blob());
    return {
      cssText: rule.cssText.replace(rule.source, dataURL),
      unicodeRanges: rule.unicodeRanges,
      weight: rule.weight,
    };
  })();
  inlinedFontFaceRules.set(cacheKey, inlinedRule);
  inlinedRule.then(undefined, () => {
    if (inlinedFontFaceRules.get(cacheKey) === inlinedRule) inlinedFontFaceRules.delete(cacheKey);
  });
  return inlinedRule;
};

const getCodePoints = (text: string) => {
  const codePoints = new Set<number>();
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) codePoints.add(codePoint);
  }
  return codePoints;
};

const coversAnyCodePoint = (ranges: readonly CodePointRange[], codePoints: ReadonlySet<number>) => {
  if (ranges.length === 0) return true;
  for (const codePoint of codePoints) {
    if (ranges.some((range) => codePoint >= range.start && codePoint <= range.end)) return true;
  }
  return false;
};

const graphMatchesSnapshot = (container: Element, { edgeIds, nodeIds }: SVGExportOptions) => {
  const nodes = [...container.querySelectorAll<HTMLElement>(NODE_QUERY)];
  const edges = [...container.querySelectorAll<SVGGraphicsElement>(EDGE_QUERY)];
  if (nodes.length !== nodeIds.length || edges.length !== edgeIds.length) return false;

  const renderedNodeIds = new Set(nodes.map((node) => node.dataset.id));
  const renderedEdgeIds = new Set(
    edges.map((edge) => edge.closest<SVGElement>(".react-flow__edge")?.dataset.id),
  );
  return nodeIds.every((id) => renderedNodeIds.has(id)) && edgeIds.every((id) => renderedEdgeIds.has(id));
};

export const exportReactFlowToSVG = async (options: SVGExportOptions) => {
  const { nodeBounds, signal } = options;
  throwIfAborted(signal);
  const container = document.querySelector<HTMLElement>(CONTAINER_QUERY);
  if (!container) throw new Error(`Could not find container with query: ${CONTAINER_QUERY}`);
  const reactFlow = container.closest<HTMLElement>(".react-flow");
  if (!reactFlow) throw new Error("Could not find React Flow root");
  if (!graphMatchesSnapshot(container, options)) throw new GraphSnapshotMismatchError();

  const bounds = getExportBounds(container, nodeBounds);
  const clone = container.cloneNode(true);
  if (!(clone instanceof HTMLElement)) throw new Error("Could not clone React Flow viewport");
  const reactFlowClassName = reactFlow.className;
  const fontFaceRules = await waitForAbort(loadImportedFontFaceRules(), signal);
  const inlinedRuleResults = await waitForAbort(
    Promise.allSettled(fontFaceRules.map(inlineFontFaceRule)),
    signal,
  );
  const availableFontFaceRules = inlinedRuleResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  throwIfAborted(signal);

  return new Promise<string>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.width = `${bounds.width + PADDING * 2}px`;
    iframe.style.height = `${bounds.height + PADDING * 2}px`;
    iframe.style.position = "absolute";
    iframe.style.top = "150%";
    iframe.style.left = "150%";

    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", rejectOnAbort);
      iframe.remove();
    };
    const resolveExport = (svg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(svg);
    };
    const rejectExport = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const rejectOnAbort = () => rejectExport(createAbortError());

    iframe.addEventListener(
      "load",
      async () => {
        try {
          throwIfAborted(signal);
          const iframeDocument = iframe.contentDocument;
          if (!iframeDocument) throw new Error("Could not get iframe document");
          const iframeWindow = iframeDocument.defaultView;
          if (!iframeWindow) throw new Error("Could not get iframe window");

          const iframeStyle = iframeDocument.createElement("style");
          iframeStyle.innerHTML = `
          ${mainStyle + reactFlowStyle}
          ${availableFontFaceRules.map((rule) => rule.cssText).join("\n")}
          * {
            box-sizing: border-box;
          }
          svg {
            overflow: visible;
          }
        `;
          iframeDocument.body.append(iframeStyle);
          const exportStyleSheet = iframeStyle.sheet;
          if (!exportStyleSheet) throw new Error("Could not get export stylesheet");
          for (let index = exportStyleSheet.cssRules.length - 1; index >= 0; index--) {
            // the export stylesheet belongs to the iframe realm, whose constructors differ from ours
            if (exportStyleSheet.cssRules[index] instanceof iframeWindow.CSSImportRule) {
              exportStyleSheet.deleteRule(index);
            }
          }
          iframeDocument.body.className = reactFlowClassName;

          Object.assign(clone.style, {
            transform: `translate(${PADDING - bounds.x}px, ${PADDING - bounds.y}px)`,
            width: `${bounds.width}px`,
            height: `${bounds.height}px`,
          });
          iframeDocument.body.append(clone);
          await waitForAbort(iframeDocument.fonts.ready, signal);

          const svgDocument = elementToSVG(iframeDocument.documentElement);
          preserveHeaderCornerRadii(svgDocument);
          const textElements = [...svgDocument.querySelectorAll("text")];
          const usedFontWeights = new Set(textElements.map((text) => text.getAttribute("font-weight")));
          const usedCodePoints = getCodePoints(textElements.map((text) => text.textContent).join(""));
          const fontStyle = svgDocument.querySelector("style");
          if (!fontStyle) throw new Error("Could not find generated SVG font style");
          const usedFontFaceRules = availableFontFaceRules.filter(
            (rule) =>
              usedFontWeights.has(rule.weight) && coversAnyCodePoint(rule.unicodeRanges, usedCodePoints),
          );
          fontStyle.textContent += `\n${usedFontFaceRules.map((rule) => rule.cssText).join("\n")}`;

          resolveExport(new XMLSerializer().serializeToString(svgDocument));
        } catch (error) {
          rejectExport(error);
        }
      },
      { once: true },
    );
    signal.addEventListener("abort", rejectOnAbort, { once: true });
    if (signal.aborted) {
      rejectOnAbort();
      return;
    }
    document.body.append(iframe);
  });
};

export const downloadSVG = (svgString: string, filename: string) => {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const a = document.createElement("a");
  a.href = svgUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(svgUrl);
};

export const copySVG = async (svgSource: Promise<string>) => {
  if (typeof ClipboardItem === "undefined") {
    await navigator.clipboard.writeText(await svgSource);
    return;
  }

  const svgBlob = svgSource.then((svgString) => new Blob([svgString], { type: "text/plain" }));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": svgBlob })]);
  } catch (error) {
    await svgSource;
    throw error;
  }
};
