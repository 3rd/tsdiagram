import { useCallback, useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { Header } from "./components/Header";
import { Panels } from "./components/Panels";
import { Editor } from "./components/Editor";
import { RendererWrapper } from "./components/Renderer";
import { Preferences } from "./components/Preferences";
import { Share } from "./components/Share";
import { useUserOptions } from "./stores/user-options";
import type { themes } from "./themes";
import "./App.css";

function App() {
  const [showPreferences, setShowPreferences] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const options = useUserOptions();

  const handlePreferencesClick = useCallback(() => {
    setShowPreferences((value) => !value);
  }, []);

  const handleShareClick = useCallback(() => {
    setShowShare((value) => !value);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex overflow-hidden flex-col w-full h-full">
        <Header onPreferencesClick={handlePreferencesClick} onShareClick={handleShareClick} />
        <main className="flex flex-1">
          <Panels
            editorChildren={
              <Editor
                editingMode={options.editor.editingMode}
                theme={options.editor.theme as keyof typeof themes}
              />
            }
            options={options}
            rendererChildren={<RendererWrapper />}
          />
        </main>
        <Preferences isOpen={showPreferences} onClose={handlePreferencesClick} />
        <Share isOpen={showShare} onClose={handleShareClick} />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
