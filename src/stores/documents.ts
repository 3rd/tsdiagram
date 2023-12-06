import { createStore, useStore } from "statelift";
import { z } from "zod";
import { decompressFromEncodedURIComponent, compressToEncodedURIComponent } from "lz-string";
import * as examples from "../examples";

const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
});
type Document = z.infer<typeof documentSchema>;

const documentStateSchema = z.object({
  documents: z.array(documentSchema),
  currentDocumentId: z.string(),
});
export type DocumentsState = z.infer<typeof documentStateSchema>;
export type DocumentsStore = DocumentsState & {
  readonly currentDocument: Document;
  save: () => void;
};

const defaultState: DocumentsState = {
  documents: [{ id: "default", title: "Default", source: examples.taskManagement }],
  currentDocumentId: "default",
};

const serializeState = (state: DocumentsState) => {
  return JSON.stringify({
    documents: state.documents,
    currentDocumentId: state.currentDocumentId,
  });
};

const saveLocalStorageState = (state: DocumentsState) => {
  localStorage.setItem("documents", serializeState(state));
};

const saveURLState = (state: DocumentsState) => {
  const compressed = compressToEncodedURIComponent(serializeState(state));
  location.hash = `#/${compressed}`;
};

const localStorageStateString = localStorage.getItem("documents");
const localStorageState = (() => {
  try {
    const data = JSON.parse(localStorage.getItem("documents") ?? "");
    return documentStateSchema.parse(data);
  } catch {}
  return null;
})();

const urlState = (() => {
  try {
    if (location.hash.startsWith("#/")) {
      const encoded = location.hash.slice(2);
      const decompressed = decompressFromEncodedURIComponent(encoded);
      const parsed = JSON.parse(decompressed);
      return { string: decompressed, state: documentStateSchema.parse(parsed) };
    }
  } catch {}
  return null;
})();

if (localStorageState && !urlState) {
  saveURLState(localStorageState);
}

const hasLoadedForeignUrlState = Boolean(
  urlState && localStorageStateString && urlState.string !== localStorageStateString
);

export const documentsStore = createStore<DocumentsStore>({
  ...(urlState?.state ?? localStorageState ?? defaultState),
  get currentDocument() {
    const document = this.documents.find((doc: Document) => doc.id === this.currentDocumentId);
    if (!document) throw new Error("Document not found");
    return document;
  },
  save() {
    if (!hasLoadedForeignUrlState) saveLocalStorageState(this);
    saveURLState(this);
  },
});
export const useDocuments = () => useStore(documentsStore);
