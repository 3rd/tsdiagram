import { Model } from "./model-types";
import { ModelParser } from "./ModelParser";

export type ParseRequest = { documentId: string; source: string };
export type ParseResponse = { documentId: string; models: Model[] | null; error: string | null };

const parser = new ModelParser("");

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: ParseResponse) => void;
};

workerScope.onmessage = (event) => {
  const { documentId, source } = event.data;
  try {
    parser.setSource(source);
    workerScope.postMessage({ documentId, models: parser.getModels(), error: null });
  } catch (error) {
    workerScope.postMessage({ documentId, models: null, error: String(error) });
  }
};
