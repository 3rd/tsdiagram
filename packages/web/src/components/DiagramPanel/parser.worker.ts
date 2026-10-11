import { parseModels } from "@tsdiagram/core";
import type { Model } from "@tsdiagram/core/model";

export type ParseRequest = { documentId: string; source: string };
export type ParseResponse = { documentId: string; models: Model[] | null; error: string | null };

self.addEventListener("message", (event: MessageEvent<ParseRequest>) => {
  const { documentId, source } = event.data;
  let response: ParseResponse;

  try {
    response = { documentId, models: parseModels(source), error: null };
  } catch (error) {
    response = { documentId, models: null, error: String(error) };
  }

  self.postMessage(response);
});
