import { Fragment, useRef } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { optionsStore, useUserOptions } from "../stores/user-options";
import { themes } from "../themes";
import { useIsMobile } from "../hooks/useIsMobile";

export type PreferencesProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const Preferences = ({ isOpen, onClose }: PreferencesProps) => {
  const cancelButtonRef = useRef(null);
  const options = useUserOptions();
  const isMobile = useIsMobile();

  const handleEditorThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    optionsStore.editor.theme = event.target.value as keyof typeof themes;
    options.save();
  };

  const handleRendererThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    optionsStore.renderer.theme = event.target.value as "dark" | "light";
    options.save();
  };

  const handleMinimapChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    optionsStore.renderer.enableMinimap = event.target.checked;
    options.save();
  };

  const handlePanelSplitDirectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    optionsStore.panels.splitDirection = event.target.value as "horizontal" | "vertical";
    options.save();
  };

  const handleEditingModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    optionsStore.editor.editingMode = event.target.value as "default" | "vim";
    options.save();
  };

  return (
    <Transition.Root as={Fragment} show={isOpen}>
      <Dialog as="div" className="relative z-50" initialFocus={cancelButtonRef} onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="overflow-y-auto fixed inset-0 z-10 w-screen">
          <div className="flex justify-center items-end p-4 min-h-full text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="flex overflow-hidden flex-col w-full text-left bg-white rounded shadow-xl max-w-[512px]">
                <Dialog.Title
                  as="h3"
                  className="py-3 px-3 text-base font-semibold leading-6 text-white bg-blue-800"
                >
                  Preferences
                </Dialog.Title>

                <div className="flex flex-col gap-4 py-4 px-3">
                  {/* panel split direction */}
                  {!isMobile && (
                    <div className="flex flex-col gap-1">
                      <label
                        className="text-sm font-medium leading-6 text-gray-900"
                        htmlFor="panel-split-direction"
                      >
                        Panel split direction
                      </label>
                      <select
                        className="block py-1.5 px-2 w-full rounded border-0 ring-1 ring-inset ring-gray-300 sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-indigo-600 placeholder:text-gray-400"
                        id="panel-split-direction"
                        value={options.panels.splitDirection}
                        onChange={handlePanelSplitDirectionChange}
                      >
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                      </select>
                    </div>
                  )}

                  {/* editing mode */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium leading-6 text-gray-900" htmlFor="editing-mode">
                      Editing mode
                    </label>
                    <select
                      className="block py-1.5 pr-10 pl-3 mt-2 w-full text-gray-900 rounded-md border-0 ring-1 ring-inset ring-gray-300 sm:text-sm sm:leading-6 focus:ring-2 focus:ring-indigo-600"
                      id="editing-mode"
                      value={options.editor.editingMode}
                      onChange={handleEditingModeChange}
                    >
                      <option value="default">Default</option>
                      <option value="vim">Vim</option>
                    </select>
                  </div>

                  {/* theme */}
                  <div className="flex gap-2">
                    {/* editor theme */}
                    <div>
                      <label
                        className="block text-sm font-medium leading-6 text-gray-900"
                        htmlFor="editor-theme"
                      >
                        Editor theme
                      </label>
                      <select
                        className="block py-1.5 pr-10 pl-3 mt-2 w-full text-gray-900 rounded-md border-0 ring-1 ring-inset ring-gray-300 sm:text-sm sm:leading-6 focus:ring-2 focus:ring-indigo-600"
                        id="editor-theme"
                        value={options.editor.theme}
                        onChange={handleEditorThemeChange}
                      >
                        {Object.keys(themes).map((theme) => (
                          <option key={theme} value={theme}>
                            {themes[theme as keyof typeof themes].name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* renderer theme */}
                    <div>
                      <label
                        className="block text-sm font-medium leading-6 text-gray-900"
                        htmlFor="renderer-theme"
                      >
                        Renderer theme
                      </label>
                      <select
                        className="block py-1.5 pr-10 pl-3 mt-2 w-full text-gray-900 rounded-md border-0 ring-1 ring-inset ring-gray-300 sm:text-sm sm:leading-6 focus:ring-2 focus:ring-indigo-600"
                        id="renderer-theme"
                        value={options.renderer.theme}
                        onChange={handleRendererThemeChange}
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>
                  </div>

                  {/* enable / disable minimap */}
                  {!isMobile && (
                    <div className="flex gap-1">
                      <input
                        checked={options.renderer.enableMinimap}
                        id="enable-minimap"
                        type="checkbox"
                        onChange={handleMinimapChange}
                      />
                      <label
                        className="font-medium leading-6 text-gray-900 select-none"
                        htmlFor="enable-minimap"
                      >
                        Enable Minimap
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-center p-3 sm:flex-row-reverse sm:justify-start">
                  <button
                    ref={cancelButtonRef}
                    className="flex flex-1 gap-2 justify-center items-center py-3 px-2 text-sm leading-none text-white rounded shadow-sm sm:flex-grow-0 bg-gray-700/90 hover:bg-gray-700/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    type="button"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
