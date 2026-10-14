import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
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

  const url = new URL("https://tsdiagram.test/editor?theme=dark");

  if (urlState) {
    url.hash = `#/${compressToEncodedURIComponent(JSON.stringify(urlState))}`;
  }

  vi.stubGlobal("location", url);
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

it("saves shared documents with an absolute URL while preserving the path and query", async () => {
  const sharedDocument = createDocument("shared", "Shared");
  const state = { documents: [sharedDocument], currentDocumentId: sharedDocument.id };
  setPersistenceState({ urlState: state });

  const { flushDocumentURL } = await import("./documents");
  flushDocumentURL();

  const [, , savedURL] = vi.mocked(history.replaceState).mock.calls[0];
  const url = new URL(String(savedURL));
  expect(`${url.origin}${url.pathname}${url.search}`).toBe("https://tsdiagram.test/editor?theme=dark");
  expect(JSON.parse(decompressFromEncodedURIComponent(url.hash.slice(2)))).toEqual(state);
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

it("reuses matching default content across reloads despite a different URL timestamp", async () => {
  const localDocument = createDocument("default", "Welcome", "interface Example {}");
  const existingCopy = { ...localDocument, id: "existing-copy" };
  const otherDocument = createDocument("other", "Other");
  const localState = {
    documents: [otherDocument, localDocument, existingCopy],
    currentDocumentId: otherDocument.id,
  };
  const { storage } = setPersistenceState({
    localState,
    urlState: { documents: [{ ...localDocument, lastModified: 2 }], currentDocumentId: localDocument.id },
  });

  const { documentsStore } = await import("./documents");

  expect(documentsStore.state.documents).toEqual(localState.documents);
  expect(documentsStore.state.currentDocument).toEqual(localDocument);

  const expectedState = { ...localState, currentDocumentId: localDocument.id };
  expect(storage.get("documents")).toBe(JSON.stringify(expectedState));

  const [, , savedURLValue] = vi.mocked(history.replaceState).mock.calls[0];
  const savedURL = new URL(String(savedURLValue));
  expect(JSON.parse(decompressFromEncodedURIComponent(savedURL.hash.slice(2)))).toEqual({
    documents: [localDocument],
    currentDocumentId: localDocument.id,
  });

  vi.resetModules();
  vi.stubGlobal("location", savedURL);

  const { documentsStore: reloadedStore } = await import("./documents");

  expect(reloadedStore.state.documents).toEqual(expectedState.documents);
  expect(reloadedStore.state.currentDocument).toEqual(localDocument);
  expect(storage.get("documents")).toBe(JSON.stringify(expectedState));
});

it.each([
  { title: "Shared title", source: "interface Local {}" },
  { title: "Local", source: "interface Shared {}" },
])("imports differing default content separately: $title / $source", async ({ title, source }) => {
  const localDocument = createDocument("default", "Local", "interface Local {}");
  const sharedDocument = createDocument("default", title, source);
  const { storage } = setPersistenceState({
    localState: { documents: [localDocument], currentDocumentId: localDocument.id },
    urlState: { documents: [sharedDocument], currentDocumentId: sharedDocument.id },
  });

  const { documentsStore } = await import("./documents");
  const currentDocument = documentsStore.state.currentDocument;

  expect(currentDocument.id).not.toBe("default");
  expect(currentDocument).toEqual({ ...sharedDocument, id: currentDocument.id });
  expect(documentsStore.state.documents).toEqual([currentDocument, localDocument]);
  expect(storage.get("documents")).toBe(
    JSON.stringify({ documents: [currentDocument, localDocument], currentDocumentId: currentDocument.id })
  );
});

it("rekeys the selected default URL document when the local workspace has no default record", async () => {
  const localDocument = createDocument("local", "Local");
  const unselectedDocument = createDocument("unselected", "Unselected");
  const sharedDocument = createDocument("default", "Shared default");
  setPersistenceState({
    localState: { documents: [localDocument], currentDocumentId: localDocument.id },
    urlState: { documents: [unselectedDocument, sharedDocument], currentDocumentId: sharedDocument.id },
  });

  const { documentsStore } = await import("./documents");
  const currentDocument = documentsStore.state.currentDocument;

  expect(currentDocument.id).not.toBe("default");
  expect(currentDocument).toEqual({ ...sharedDocument, id: currentDocument.id });
  expect(documentsStore.state.documents).toEqual([currentDocument, localDocument]);
});
