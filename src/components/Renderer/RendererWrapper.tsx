import { Renderer } from "./Renderer";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useMemo } from "react";
import { ModelParser } from "../../lib/parser/ModelParser";

export type RendererWrapperProps = {
  source: string;
};

export const RendererWrapper = ({ source }: RendererWrapperProps) => {
  const isMobile = useIsMobile();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parser = useMemo(() => new ModelParser(source), []);

  const models = useMemo(() => {
    parser.setSource(source);
    return parser.getModels();
  }, [parser, source]);

  return <Renderer disableMiniMap={isMobile} models={models} />;
};
