import { memo, useEffect, useId, useMemo, useRef } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import type { Model } from "@tsdiagram/core/model";
import { useDiagramStore, useIsBadgeHubHovered, useNodeDecoration } from "../DiagramProvider/diagram-state";
import { getModelCardPorts, ModelBadge, ModelCard, ModelPort, type ModelCardPort } from "../ModelCard";
import { usePortColor } from "./port-colors";

type ModelNodeProps = {
  id: string;
  data: { model: Model; badgeHubIds: ReadonlySet<string> };
};

type InteractivePortProps = ModelCardPort;

const InteractivePort = ({ id, type }: InteractivePortProps) => {
  const color = usePortColor(id);
  return (
    <Handle id={id} position={type === "source" ? Position.Right : Position.Left} type={type}>
      <ModelPort color={color} type={type} />
    </Handle>
  );
};

type HubBadgePillProps = {
  refModel: Model;
};

const HubBadgePill = ({ refModel }: HubBadgePillProps) => {
  const graphStore = useDiagramStore();
  const pillId = useId();
  const isHovered = useIsBadgeHubHovered(refModel.id);

  useEffect(() => {
    return () => {
      graphStore.state.clearHoveredBadgeHub(pillId);
    };
  }, [graphStore, pillId]);

  const handleMouseEnter = () => {
    graphStore.state.setHoveredBadgeHub(refModel.id, pillId);
  };

  const handleMouseLeave = () => {
    graphStore.state.clearHoveredBadgeHub(pillId);
  };

  return (
    <ModelBadge
      name={refModel.name}
      isHovered={isHovered}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
};

const renderHubBadge = (refModel: Model) => <HubBadgePill key={refModel.id} refModel={refModel} />;
const renderInteractivePort = (port: ModelCardPort) => <InteractivePort {...port} />;

const ModelNodeContent = ({ id, data }: ModelNodeProps) => {
  const { model, badgeHubIds } = data;
  const decoration = useNodeDecoration(model);
  const renderedHandleKey = useMemo(() => {
    const { hasSourceHandle, hasTargetHandle, fieldSourceHandleRows } = getModelCardPorts(model, badgeHubIds);
    const keys = [hasTargetHandle ? "target" : "", hasSourceHandle ? "source" : ""];
    return JSON.stringify([keys, [...fieldSourceHandleRows]]);
  }, [badgeHubIds, model]);

  const updateNodeInternals = useUpdateNodeInternals();
  const mountedHandleKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (mountedHandleKeyRef.current !== null && mountedHandleKeyRef.current !== renderedHandleKey) {
      updateNodeInternals(id);
    }

    mountedHandleKeyRef.current = renderedHandleKey;
  }, [id, renderedHandleKey, updateNodeInternals]);

  return (
    <ModelCard
      model={model}
      badgeHubIds={badgeHubIds}
      decoration={decoration}
      renderBadge={renderHubBadge}
      renderPort={renderInteractivePort}
    />
  );
};

export const ModelNode = memo(
  ModelNodeContent,
  (previous, next) => previous.id === next.id && previous.data === next.data
);
ModelNode.displayName = "ModelNode";
