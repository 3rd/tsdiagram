import { compressToEncodedURIComponent } from "lz-string";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Document, DocumentsState } from "./documents";

const createDocument = (id: string, title = id, source = `interface ${id} {}`): Document => ({
  id,
  title,
  source,
  lastModified: 1,
});

const setPersistenceState = ({
  localState,
  urlState,
}: {
  localState?: DocumentsState;
  urlState?: DocumentsState;
}) => {
  const storage = new Map<string, string>();
  let pagehideListener: () => void = () => {
    throw new Error("pagehide listener was not registered");
  };
  if (localState) storage.set("documents", JSON.stringify(localState));

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("location", {
    hash: urlState ? `#/${compressToEncodedURIComponent(JSON.stringify(urlState))}` : "",
  });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("window", {
    addEventListener: (event: string, listener: () => void) => {
      if (event === "pagehide") pagehideListener = listener;
    },
  });
  vi.stubGlobal("document", { addEventListener: vi.fn(), visibilityState: "visible" });

  return { storage, dispatchPagehide: () => pagehideListener() };
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("falls back to the default document for a URL state with an empty document list", async () => {
  setPersistenceState({ urlState: { documents: [], currentDocumentId: "default" } });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toHaveLength(1);
  expect(documentsStore.state.currentDocument.title).toBe("Welcome");
});

it("falls back to the default document for local state with an empty document list", async () => {
  setPersistenceState({ localState: { documents: [], currentDocumentId: "default" } });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toHaveLength(1);
  expect(documentsStore.state.currentDocument.title).toBe("Welcome");
});

it("keeps valid local documents when the URL document list is empty", async () => {
  const localDocument = createDocument("local", "Local");
  setPersistenceState({
    localState: { documents: [localDocument], currentDocumentId: localDocument.id },
    urlState: { documents: [], currentDocumentId: "missing" },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toEqual([localDocument]);
  expect(documentsStore.state.currentDocument).toEqual(localDocument);
});

it("selects and persists the first local document when the saved current document is missing", async () => {
  const firstDocument = createDocument("first", "First");
  const secondDocument = createDocument("second", "Second");
  const { storage, dispatchPagehide } = setPersistenceState({
    localState: { documents: [firstDocument, secondDocument], currentDocumentId: "missing" },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toEqual([firstDocument, secondDocument]);
  expect(documentsStore.state.currentDocument).toEqual(firstDocument);

  dispatchPagehide();

  const persistedState = storage.get("documents") ?? "";
  expect(persistedState).not.toBe("");
  expect(JSON.parse(persistedState)).toEqual({
    documents: [firstDocument, secondDocument],
    currentDocumentId: firstDocument.id,
  });
});

it("ingests the first URL document when its saved current document is missing", async () => {
  const localDocument = createDocument("local", "Local");
  const sharedDocument = createDocument("shared", "Shared");
  setPersistenceState({
    localState: { documents: [localDocument], currentDocumentId: localDocument.id },
    urlState: { documents: [sharedDocument], currentDocumentId: "missing" },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toEqual([sharedDocument, localDocument]);
  expect(documentsStore.state.currentDocument).toEqual(sharedDocument);
});

it("uses a valid URL document when local storage is empty", async () => {
  const sharedDocument = createDocument("shared", "Shared");
  setPersistenceState({
    urlState: { documents: [sharedDocument], currentDocumentId: sharedDocument.id },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toEqual([sharedDocument]);
  expect(documentsStore.state.currentDocument).toEqual(sharedDocument);
});

it("updates an existing local document from a valid URL state", async () => {
  const localDocument = createDocument("shared", "Old title", "interface Old {}");
  const sharedDocument = createDocument("shared", "New title", "interface New {}");
  setPersistenceState({
    localState: { documents: [localDocument], currentDocumentId: localDocument.id },
    urlState: { documents: [sharedDocument], currentDocumentId: sharedDocument.id },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.currentDocument.title).toBe(sharedDocument.title);
  expect(documentsStore.state.currentDocument.source).toBe(sharedDocument.source);
});

it("assigns a fresh id to a valid shared default document", async () => {
  const sharedDocument = createDocument("default", "Shared default");
  setPersistenceState({
    urlState: { documents: [sharedDocument], currentDocumentId: sharedDocument.id },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.currentDocumentId).not.toBe("default");
  expect(documentsStore.state.currentDocument.id).toBe(documentsStore.state.currentDocumentId);
});
