import { createStore, useStore } from "statelift";
import { z } from "zod";
import { decompressFromEncodedURIComponent, compressToEncodedURIComponent } from "lz-string";
import { nanoid } from "nanoid";
import isEqual from "lodash/isEqual";

const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  lastModified: z.number().default(Date.now()),
});
export type Document = z.infer<typeof documentSchema>;

const documentStateSchema = z.object({
  isLoading: z.boolean().default(true),
  documents: z.array(documentSchema),
  currentDocumentId: z.string(),
});
export type DocumentsState = z.infer<typeof documentStateSchema>;
export type DocumentsStore = DocumentsState & {
  readonly currentDocument: Document;
  load: () => void;
  loadTsDocumentForApi: (api: string) => void;
  save: () => void;
  create: () => void;
  delete: (id: string) => void;
  setCurrentDocumentId: (id: string) => void;
  setCurrentDocumentTitle: (title: string) => void;
  setCurrentDocumentSource: (source: string) => void;
  sortByLastModified: () => void;
};

const defaultState = {
  documents: [
    {
      id: "default",
      title: "Untitled",
      source: "",
      lastModified: Date.now(),
    },
  ],
  currentDocumentId: "default",
  isLoading: false,
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

const loadTsDocument = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const text = await response.text();
  return text;
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
let loadDefaultDocumentsFromPublic = false;
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
} else {
  loadDefaultDocumentsFromPublic = true;
}

export const documentsStore = createStore<DocumentsStore>({
  ...combinedState,
  get currentDocument() {
    const document = this.documents.find((doc: Document) => doc.id === this.currentDocumentId);
    if (!document) throw new Error("Document not found");
    return document;
  },
  loadTsDocumentForApi(api: string) {
    loadTsDocument("/schemas/" + api + ".ts").then((source) => {
      const id = api;
      this.documents.unshift({
        id,
        title: api,
        source: source,
        lastModified: Date.now(),
      });
      this.currentDocumentId = id;
      this.isLoading = false;
      this.delete("default");
      this.save();
    });
  },
  load() {
    this.loadTsDocumentForApi("api-venues");
    this.loadTsDocumentForApi("api-clients");
    this.loadTsDocumentForApi("api-bookings");
    this.loadTsDocumentForApi("api-buyers");
  },
  save() {
    saveLocalStorageState(this);
    saveURLState(this);
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
    this.save();
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
    this.save();
  },
  setCurrentDocumentId(id: string) {
    this.currentDocumentId = id;
    this.save();
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
});

if (hasIngestedForeignState) {
  documentsStore.state.sortByLastModified();
  documentsStore.state.save();
} else if (loadDefaultDocumentsFromPublic) {
  documentsStore.state.load();
}

export const useDocuments = () => useStore(documentsStore);
