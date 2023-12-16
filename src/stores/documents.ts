// import { createStore, useStore } from "statelift";
import { z } from "zod";
import { decompressFromEncodedURIComponent, compressToEncodedURIComponent } from "lz-string";
import { nanoid } from "nanoid";
import isEqual from "lodash/isEqual";
import { proxy, useSnapshot } from "valtio";
import * as examples from "../examples";

const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  lastModified: z.number().default(Date.now()),
});
export type Document = z.infer<typeof documentSchema>;

const documentStateSchema = z.object({
  documents: z.array(documentSchema),
  currentDocumentId: z.string(),
});
export type DocumentsState = z.infer<typeof documentStateSchema>;
export type DocumentsStore = DocumentsState & {
  readonly currentDocument: Document;
  save: () => void;
  create: () => void;
  delete: (id: string) => void;
  setCurrentDocumentId: (id: string) => void;
  setCurrentDocumentTitle: (title: string) => void;
  setCurrentDocumentSource: (source: string) => void;
  sortByLastModified: () => void;
};

const defaultState: DocumentsState = {
  documents: [
    {
      id: "default",
      title: "Welcome",
      source: examples.taskManagement,
      lastModified: Date.now(),
    },
  ],
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
  const monoState = {
    documents: state.documents.filter((d) => d.id === state.currentDocumentId),
    currentDocumentId: state.currentDocumentId,
  };
  const compressed = compressToEncodedURIComponent(serializeState(monoState));
  location.hash = `#/${compressed}`;
};

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

if (urlState && urlState.state.currentDocumentId === "default") {
  urlState.state.currentDocumentId = nanoid();
  urlState.state.documents[0].id = urlState.state.currentDocumentId;
}

const combinedState = localStorageState ?? urlState?.state ?? defaultState;

if (localStorageState && !urlState) {
  saveURLState(localStorageState);
}

// merge url state into local state
let hasIngestedForeignState = false;
if (localStorageState && urlState) {
  const urlDocumentId = urlState.state.currentDocumentId;
  const urlDocument = urlState.state.documents.find((d) => d.id === urlDocumentId);
  const localStorageDocument = localStorageState?.documents.find((d) => d.id === urlDocumentId);

  // if we've seen this document before, update it
  if (urlDocument && localStorageDocument) {
    if (!isEqual(urlDocument, localStorageDocument)) {
      localStorageDocument.title = urlDocument.title;
      localStorageDocument.source = urlDocument.source;
      hasIngestedForeignState = true;
    }
    combinedState.currentDocumentId = urlDocumentId;
  }

  // if it's a new document, ingest it
  if (urlDocument && !localStorageDocument) {
    combinedState.documents.unshift(urlDocument);
    combinedState.currentDocumentId = urlDocumentId;
    hasIngestedForeignState = true;
  }
}

export const documentsStore = proxy<DocumentsStore>({
  ...combinedState,
  get currentDocument() {
    const document = this.documents.find((doc: Document) => doc.id === this.currentDocumentId);
    if (!document) throw new Error("Document not found");
    return document;
  },
  save() {
    saveLocalStorageState(this);
    saveURLState(this);
  },
  create() {
    const id = nanoid();
    documentsStore.documents.unshift({
      id,
      title: "Untitled",
      source: "",
      lastModified: Date.now(),
    });
    documentsStore.currentDocumentId = id;
    documentsStore.sortByLastModified();
    documentsStore.save();
  },
  delete(id: string) {
    if (documentsStore.documents.length === 1) {
      documentsStore.documents.push({
        id: nanoid(),
        title: "Untitled",
        source: "",
        lastModified: Date.now(),
      });
    }
    const isCurrentDocument = documentsStore.currentDocumentId === id;
    documentsStore.documents = documentsStore.documents.filter((d) => d.id !== id);
    if (isCurrentDocument) documentsStore.currentDocumentId = documentsStore.documents[0].id;
    documentsStore.save();
  },
  setCurrentDocumentId(id: string) {
    documentsStore.currentDocumentId = id;
    documentsStore.save();
  },
  setCurrentDocumentTitle(title: string) {
    documentsStore.currentDocument.title = title;
    documentsStore.currentDocument.lastModified = Date.now();
    documentsStore.sortByLastModified();
    documentsStore.save();
  },
  setCurrentDocumentSource(source: string) {
    documentsStore.currentDocument.source = source;
    documentsStore.currentDocument.lastModified = Date.now();
    documentsStore.sortByLastModified();
    documentsStore.save();
  },
  sortByLastModified() {
    documentsStore.documents.sort((a, b) => b.lastModified - a.lastModified);
  },
});

if (hasIngestedForeignState) {
  documentsStore.sortByLastModified();
  documentsStore.save();
}

export const useDocuments = () => useSnapshot(documentsStore);
