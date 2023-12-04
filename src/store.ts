import { createStore, useStore } from "statelift";
import { z } from "zod";
import * as examples from "./examples";
import { themes } from "./themes";

const userOptionsSchema = z.object({
  editor: z.object({
    theme: z.enum(Object.keys(themes) as [string, ...string[]]),
  }),
  renderer: z.object({
    direction: z.enum(["horizontal", "vertical"]),
    autoFitView: z.boolean(),
    theme: z.enum(["light", "dark"]),
  }),
});

export type UserOptions = z.infer<typeof userOptionsSchema> & {
  load: () => void;
  save: () => void;
};
export const optionsStore = createStore<UserOptions>({
  editor: {
    theme: "vsLight",
  },
  renderer: {
    direction: "horizontal",
    autoFitView: true,
    theme: "light",
  },
  load() {
    try {
      const data = JSON.parse(localStorage.getItem("options") ?? "");
      const parsedData = userOptionsSchema.parse(data);
      this.editor = parsedData.editor;
      this.renderer = parsedData.renderer;
    } catch {}
  },
  save() {
    localStorage.setItem("options", JSON.stringify({ editor: this.editor, renderer: this.renderer }));
  },
});
optionsStore.state.load();
export const useOptions = () => useStore(optionsStore);

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
export type DocumentsState = z.infer<typeof documentStateSchema> & {
  readonly currentDocument: Document;
  load: () => void;
  save: () => void;
};

export const documentsStore = createStore<DocumentsState>({
  documents: [{ id: "default", title: "Default", source: examples.taskManagement }],
  currentDocumentId: "default",
  get currentDocument() {
    const document = this.documents.find((doc: Document) => doc.id === this.currentDocumentId);
    if (!document) throw new Error("Document not found");
    return document;
  },
  load() {
    try {
      const data = JSON.parse(localStorage.getItem("documents") ?? "");
      const parsedData = documentStateSchema.parse(data);
      this.documents = parsedData.documents;
      this.currentDocumentId = parsedData.currentDocumentId;
    } catch {}
  },
  save() {
    localStorage.setItem(
      "documents",
      JSON.stringify({
        documents: this.documents,
        currentDocumentId: this.currentDocumentId,
      })
    );
  },
});
documentsStore.state.load();
export const useDocuments = () => useStore(documentsStore);
