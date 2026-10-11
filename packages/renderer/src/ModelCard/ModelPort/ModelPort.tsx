import type { ModelCardPort } from "../ModelCard";

type ModelPortProps = {
  type: ModelCardPort["type"];
  color?: string;
  paneColor?: string;
};

export const ModelPort = ({ type, color = "var(--color-accent)", paneColor }: ModelPortProps) => {
  const paneFillClass = paneColor === undefined ? "fill-pane" : undefined;

  return (
    <svg className="model-node-port" aria-hidden>
      <circle className={paneFillClass} cx="4" cy="4" fill={paneColor} r="3.6" />
      {type === "source" ? (
        <circle
          className={paneFillClass}
          cx="4"
          cy="4"
          fill={paneColor}
          r="2.4"
          stroke={color}
          strokeWidth="1.2"
        />
      ) : (
        <circle cx="4" cy="4" fill={color} r="3" />
      )}
    </svg>
  );
};
