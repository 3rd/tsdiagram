import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { DiagramState } from "./diagram-state";

const CanvasContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export const useDiagramCanvas = () => {
  const canvasRef = useContext(CanvasContext);
  if (canvasRef === null) {
    throw new Error("Diagram must be rendered inside DiagramProvider.");
  }

  return canvasRef;
};

export type DiagramProviderProps = {
  children: ReactNode;
};

export const DiagramProvider = ({ children }: DiagramProviderProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  return (
    <DiagramState.Provider>
      <CanvasContext.Provider value={canvasRef}>
        <ReactFlowProvider>{children}</ReactFlowProvider>
      </CanvasContext.Provider>
    </DiagramState.Provider>
  );
};
