import { randomUUID } from "node:crypto";
import type { Model } from "@tsdiagram/core/model";
import { fromJsx } from "takumi-js/helpers/jsx";
import type { Node } from "takumi-js/helpers";
import type { MeasuredNode, Renderer } from "takumi-js/node";
import type { DiagramOptions } from "../diagram-options";
import { ModelCard, ModelCardHandle, ModelPort, type ModelCardPort } from "../ModelCard";
import { getDiagramThemeClass } from "./assets";

type CreateModelCardOptions = {
  model: Model;
  badgeHubIds: ReadonlySet<string>;
  portColors: ReadonlyMap<string, string>;
  paneColor: string;
  accentColor: string;
  theme: DiagramOptions["theme"];
};

const applyTableAlignment = (node: Node): Node => {
  if (node.type !== "container") return node;

  return {
    ...node,
    ...(node.tagName === "td" && node.attributes?.align === "right"
      ? { style: { ...node.style, textAlign: "right" } }
      : {}),
    children: node.children?.map(applyTableAlignment),
  };
};

export const createModelCardNode = async ({
  model,
  badgeHubIds,
  portColors,
  paneColor,
  accentColor,
  theme,
}: CreateModelCardOptions) => {
  const renderPort = ({ id, type }: ModelCardPort) => (
    <ModelCardHandle id={id} type={type}>
      <ModelPort type={type} color={portColors.get(id) ?? accentColor} paneColor={paneColor} />
    </ModelCardHandle>
  );

  const { node, css } = await fromJsx(
    <div className={getDiagramThemeClass(theme)} style={{ display: "inline-block" }}>
      <ModelCard model={model} badgeHubIds={badgeHubIds} renderPort={renderPort} />
    </div>
  );

  return { node: applyTableAlignment(node), css };
};

const markModelPorts = (node: Node, markers: Map<string, ModelCardPort>): Node => {
  if (node.type !== "container") return node;

  const id = node.attributes?.["data-port-id"];
  const type = node.attributes?.["data-port-type"];
  if (id !== undefined && (type === "source" || type === "target")) {
    const marker = randomUUID();
    markers.set(marker, { id, type });

    return {
      ...node,
      style: { ...node.style, fontSize: 1, lineHeight: "1px", whiteSpace: "pre" },
      children: [{ type: "text", text: marker }],
    };
  }

  return { ...node, children: node.children?.map((child) => markModelPorts(child, markers)) };
};

type MeasuredPort = {
  x: number;
  y: number;
  type: ModelCardPort["type"];
};

const collectMeasuredPorts = (
  node: MeasuredNode,
  markers: ReadonlyMap<string, ModelCardPort>,
  ports: Map<string, MeasuredPort>
) => {
  const markedPort = markers.get(node.runs.map((run) => run.text).join(""));
  if (markedPort !== undefined) {
    const x = markedPort.type === "source" ? node.width : 0;
    const y = node.height / 2;
    const [a, b, c, d, e, f] = node.transform;
    ports.set(markedPort.id, { type: markedPort.type, x: a * x + c * y + e, y: b * x + d * y + f });
  }

  for (const child of node.children) {
    collectMeasuredPorts(child, markers, ports);
  }
};

type MeasureModelCardOptions = {
  renderer: Renderer;
  node: Node;
  css: string[];
};

export const measureModelCard = async ({ renderer, node, css }: MeasureModelCardOptions) => {
  const markers = new Map<string, ModelCardPort>();
  const measured = await renderer.measure(markModelPorts(node, markers), { css });

  const ports = new Map<string, MeasuredPort>();
  collectMeasuredPorts(measured, markers, ports);
  if (ports.size !== markers.size) {
    throw new Error("Could not measure all diagram ports");
  }

  return { width: measured.width, height: measured.height, ports };
};
