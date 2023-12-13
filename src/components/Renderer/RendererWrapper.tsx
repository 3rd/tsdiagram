import { Renderer } from "./Renderer";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useMemo } from "react";
import { ModelParser } from "../../lib/parser/ModelParser";
import { useDocuments } from "../../stores/documents";

export const RendererWrapper = () => {
  const documents = useDocuments();
  const isMobile = useIsMobile();

  const source = useMemo(() => documents.currentDocument.source, [documents.currentDocument.source]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parser = useMemo(() => new ModelParser(source), []);

  const models = useMemo(() => {
    parser.setSource(source);
    return parser.getModels();
  }, [parser, source]);

  return <Renderer disableMiniMap={isMobile} models={models} />;
};
