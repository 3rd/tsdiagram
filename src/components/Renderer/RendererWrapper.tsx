import { useMemo } from "react";
import { Renderer } from "./Renderer";
import { useIsMobile } from "../../hooks/useIsMobile";
import { ModelParser } from "../../lib/parser/ModelParser";
import { documentsStore } from "../../stores/documents";
import { useDebounced } from "../../hooks/useDebounced";
import { useStore } from "statelift";

export const RendererWrapper = () => {
  const documentSource = useStore(documentsStore, (state) => state.currentDocument.source);
  const isMobile = useIsMobile();

  const debouncedSource = useDebounced(documentSource, 16);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parser = useMemo(() => new ModelParser(debouncedSource), []);

  const models = useMemo(() => {
    parser.setSource(debouncedSource);
    return parser.getModels();
  }, [parser, debouncedSource]);

  return <Renderer disableMiniMap={isMobile} models={models} />;
};
