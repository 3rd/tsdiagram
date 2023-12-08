import { elementToSVG } from "dom-to-svg";
import mainStyle from "../index.css?inline";
import reactFlowStyle from "../reactflow.css?inline";

const CONTAINER_QUERY = ".react-flow__viewport";

export const exportReactFlowToSVG = async (width: number, height: number) => {
  const container = document.querySelector(CONTAINER_QUERY);
  if (!container) throw new Error(`Could not find container with query: ${CONTAINER_QUERY}`);

  const iframe = document.createElement("iframe");
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.position = "absolute";
  iframe.style.top = "150%";
  iframe.style.left = "150%";
  document.body.append(iframe);

  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument) throw new Error("Could not get iframe document");

  const iframeStyle = iframeDocument.createElement("style");
  iframeStyle.innerHTML = mainStyle + reactFlowStyle;
  iframeDocument.body.append(iframeStyle);

  const clone = container.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  iframeDocument.body.append(clone);

  const svgDocument = elementToSVG(iframeDocument.documentElement);
  const svgString = new XMLSerializer().serializeToString(svgDocument);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const a = document.createElement("a");
  a.href = svgUrl;
  a.download = "diagram.svg";
  a.click();
};
