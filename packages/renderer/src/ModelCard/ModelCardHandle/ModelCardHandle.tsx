import type { JSX, ReactNode } from "react";
import classNames from "classnames";
import type { ModelCardPort } from "../ModelCard";
import { ModelPort } from "../ModelPort";

const DEFAULT_MODEL_PORTS: Record<ModelCardPort["type"], JSX.Element> = {
  source: <ModelPort type="source" />,
  target: <ModelPort type="target" />,
};

type ModelCardHandleProps = ModelCardPort & {
  children?: ReactNode;
};

export const ModelCardHandle = ({ id, type, children = DEFAULT_MODEL_PORTS[type] }: ModelCardHandleProps) => (
  <div
    className={classNames(
      "react-flow__handle",
      type === "source" ? "react-flow__handle-right" : "react-flow__handle-left"
    )}
    data-port-id={id}
    data-port-type={type}
  >
    {children}
  </div>
);
