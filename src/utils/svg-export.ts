import { elementToSVG } from "dom-to-svg";
import mainStyle from "../index.css?inline";
import reactFlowStyle from "../reactflow.css?inline";

const CONTAINER_QUERY = ".react-flow__viewport";
const PADDING = 18;

export const exportReactFlowToSVG = async (width: number, height: number) => {
  const container = document.querySelector(CONTAINER_QUERY);
  if (!container) throw new Error(`Could not find container with query: ${CONTAINER_QUERY}`);

  const iframe = document.createElement("iframe");
  iframe.style.width = `${width + PADDING}px`;
  iframe.style.height = `${height + PADDING}px`;
  iframe.style.position = "absolute";
  iframe.style.top = "150%";
  iframe.style.left = "150%";
  document.body.append(iframe);

  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument) throw new Error("Could not get iframe document");

  const iframeStyle = iframeDocument.createElement("style");
  iframeStyle.innerHTML = `
    ${mainStyle + reactFlowStyle}
    * {
      box-sizing: border-box;
    }
    svg > g {
      transform: translate(${PADDING}px, 0px);
    }
    .react-flow__nodes {
      transform: translate(${PADDING}px, 0px);
    }
  `;
  iframeDocument.body.append(iframeStyle);

  const clone = container.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    transform: "none",
    width: `${width}px`,
    height: `${height}px`,
  });
  iframeDocument.body.append(clone);

  const svgDocument = elementToSVG(iframeDocument.documentElement);
  const svgString = new XMLSerializer().serializeToString(svgDocument);

  iframe.remove();

  return svgString;
};

export const downloadSVG = async (svgString: string, filename: string) => {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const a = document.createElement("a");
  a.href = svgUrl;
  a.download = filename;
  a.click();
};

export const copySVG = async (svgString: string) => {
  await navigator.clipboard.writeText(svgString);
};
