import { useCallback, useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { Header } from "./components/Header";
import { Panels } from "./components/Panels";
import { Editor } from "./components/Editor";
import { RendererWrapper } from "./components/Renderer";
import { Preferences } from "./components/Preferences";
import { useDocuments } from "./stores/documents";
import { useUserOptions } from "./stores/user-options";
import type { themes } from "./themes";
import "./App.css";

function App() {
  const [showPreferences, setShowPreferences] = useState(false);
  const documents = useDocuments();
  const options = useUserOptions();

  const handleSourceChange = useCallback(
    (value: string | undefined) => {
      documents.currentDocument.source = value ?? "";
      documents.save();
    },
    [documents]
  );

  const handlePreferencesClick = useCallback(() => {
    setShowPreferences((value) => !value);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex overflow-hidden flex-col w-full h-full">
        <Header onPreferencesClick={handlePreferencesClick} />
        <main className="flex flex-1">
          <Panels
            editorChildren={
              <Editor
                source={documents.currentDocument.source}
                theme={options.editor.theme as keyof typeof themes}
                onChange={handleSourceChange}
              />
            }
            options={options}
            rendererChildren={<RendererWrapper source={documents.currentDocument.source} />}
          />
        </main>
        <Preferences isOpen={showPreferences} onClose={handlePreferencesClick} />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
