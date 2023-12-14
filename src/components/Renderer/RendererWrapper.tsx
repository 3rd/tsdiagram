import { useMemo } from "react";
import { Renderer } from "./Renderer";
import { useIsMobile } from "../../hooks/useIsMobile";
import { ModelParser } from "../../lib/parser/ModelParser";
import { useDocuments } from "../../stores/documents";
import { useDebounced } from "../../hooks/useDebounced";

export const RendererWrapper = () => {
  const documents = useDocuments();
  const isMobile = useIsMobile();

  const source = useMemo(() => documents.currentDocument.source, [documents.currentDocument.source]);
  const debouncedSource = useDebounced(source, 16);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parser = useMemo(() => new ModelParser(source), []);

  const models = useMemo(() => {
    parser.setSource(debouncedSource);
    return parser.getModels();
  }, [parser, debouncedSource]);

  return <Renderer disableMiniMap={isMobile} models={models} />;
};
