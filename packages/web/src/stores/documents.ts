import isEqual from "lodash/isEqual";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { nanoid } from "nanoid";
import { createStore, useStore } from "statelift";
import { z } from "zod";
import * as examples from "../examples";

const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  lastModified: z.number().default(Date.now()),
});
export type Document = z.infer<typeof documentSchema>;

const documentStateSchema = z.object({
  documents: z.array(documentSchema).min(1),
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

const parseDocumentState = (data: unknown) => {
  const state = documentStateSchema.parse(data);
  if (state.documents.some((document) => document.id === state.currentDocumentId)) return state;

  return { ...state, currentDocumentId: state.documents[0].id };
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
  history.replaceState(null, "", `#/${compressed}`);
};

const SAVE_LOCAL_STORAGE_DELAY_MS = 300;
const SAVE_URL_DELAY_MS = 500;

let localStorageSaveTimer: ReturnType<typeof setTimeout> | null = null;
let urlSaveTimer: ReturnType<typeof setTimeout> | null = null;

const cancelScheduledURLSave = () => {
  if (urlSaveTimer !== null) {
    clearTimeout(urlSaveTimer);
    urlSaveTimer = null;
  }
};

const cancelScheduledSaves = () => {
  if (localStorageSaveTimer !== null) {
    clearTimeout(localStorageSaveTimer);
    localStorageSaveTimer = null;
  }
  cancelScheduledURLSave();
};

const scheduleSave = () => {
  if (localStorageSaveTimer !== null) clearTimeout(localStorageSaveTimer);
  localStorageSaveTimer = setTimeout(() => {
    localStorageSaveTimer = null;
    saveLocalStorageState(documentsStore.state);
  }, SAVE_LOCAL_STORAGE_DELAY_MS);

  if (urlSaveTimer !== null) clearTimeout(urlSaveTimer);
  urlSaveTimer = setTimeout(() => {
    urlSaveTimer = null;
    saveURLState(documentsStore.state);
  }, SAVE_URL_DELAY_MS);
};

const saveImmediately = (state: DocumentsState) => {
  cancelScheduledSaves();
  saveLocalStorageState(state);
  saveURLState(state);
};

export const flushDocumentURL = () => {
  cancelScheduledURLSave();
  saveURLState(documentsStore.state);
};

const localStorageState = (() => {
  try {
    const data = JSON.parse(localStorage.getItem("documents") ?? "");
    return parseDocumentState(data);
  } catch {}
  return null;
})();

const urlState = (() => {
  try {
    if (location.hash.startsWith("#/")) {
      const encoded = location.hash.slice(2);
      const decompressed = decompressFromEncodedURIComponent(encoded);
      const parsed = JSON.parse(decompressed);
      return { string: decompressed, state: parseDocumentState(parsed) };
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

let hasIngestedForeignState = false;
if (localStorageState && urlState) {
  const urlDocumentId = urlState.state.currentDocumentId;
  const urlDocument = urlState.state.documents.find((d) => d.id === urlDocumentId);
  const localStorageDocument = localStorageState?.documents.find((d) => d.id === urlDocumentId);

  if (urlDocument && localStorageDocument) {
    if (!isEqual(urlDocument, localStorageDocument)) {
      localStorageDocument.title = urlDocument.title;
      localStorageDocument.source = urlDocument.source;
      hasIngestedForeignState = true;
    }
    combinedState.currentDocumentId = urlDocumentId;
  }

  if (urlDocument && !localStorageDocument) {
    combinedState.documents.unshift(urlDocument);
    combinedState.currentDocumentId = urlDocumentId;
    hasIngestedForeignState = true;
  }
}

export const documentsStore = createStore<DocumentsStore>((root) => ({
  ...combinedState,
  get currentDocument() {
    const document = root.documents.find((doc) => doc.id === root.currentDocumentId);
    if (!document) throw new Error("Document not found");
    return document;
  },
  save() {
    scheduleSave();
  },
  create() {
    const id = nanoid();
    this.documents.unshift({
      id,
      title: "Untitled",
      source: "",
      lastModified: Date.now(),
    });
    this.currentDocumentId = id;
    this.sortByLastModified();
    saveImmediately(this);
  },
  delete(id: string) {
    if (this.documents.length === 1) {
      this.documents.push({
        id: nanoid(),
        title: "Untitled",
        source: "",
        lastModified: Date.now(),
      });
    }
    const isCurrentDocument = this.currentDocumentId === id;
    if (isCurrentDocument) {
      for (const document of this.documents) {
        if (document.id !== id) {
          this.currentDocumentId = document.id;
          break;
        }
      }
    }
    this.documents = this.documents.filter((d) => d.id !== id);
    saveImmediately(this);
  },
  setCurrentDocumentId(id: string) {
    this.currentDocumentId = id;
    saveImmediately(this);
  },
  setCurrentDocumentTitle(title: string) {
    this.currentDocument.title = title;
    this.currentDocument.lastModified = Date.now();
    this.sortByLastModified();
    this.save();
  },
  setCurrentDocumentSource(source: string) {
    this.currentDocument.source = source;
    this.currentDocument.lastModified = Date.now();
    this.sortByLastModified();
    this.save();
  },
  sortByLastModified() {
    this.documents.sort((a, b) => b.lastModified - a.lastModified);
  },
}));

if (hasIngestedForeignState) {
  documentsStore.state.sortByLastModified();
  saveImmediately(documentsStore.state);
}

window.addEventListener("beforeunload", () => saveImmediately(documentsStore.state));
window.addEventListener("pagehide", () => saveImmediately(documentsStore.state));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveImmediately(documentsStore.state);
});

export const useDocuments = () => useStore(documentsStore);
