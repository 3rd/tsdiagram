import { Fragment, useRef } from "react";
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { useIsMobile } from "../hooks/useIsMobile";
import { optionsStore, useUserOptions } from "../stores/user-options";

export type PreferencesProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const Preferences = ({ isOpen, onClose }: PreferencesProps) => {
  const cancelButtonRef = useRef(null);
  const options = useUserOptions();
  const isMobile = useIsMobile();

  const handleDarkThemeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const isDark = event.target.checked;
    optionsStore.state.renderer.theme = isDark ? "dark" : "light";
    optionsStore.state.save();
  };

  const handleMinimapChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    optionsStore.state.renderer.enableMinimap = event.target.checked;
    optionsStore.state.save();
  };

  const handleBadgeHubsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // re-enable auto-fit so the relayout this triggers is brought into view
    optionsStore.state.renderer.autoFitView = true;
    optionsStore.state.renderer.badgeHubs = event.target.checked;
    optionsStore.state.save();
  };

  const handleCompactLayoutChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // re-enable auto-fit so the relayout this triggers is brought into view
    optionsStore.state.renderer.autoFitView = true;
    optionsStore.state.renderer.compactLayout = event.target.checked;
    optionsStore.state.save();
  };

  const handleColorizeEdgesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    optionsStore.state.renderer.colorizeEdges = event.target.checked;
    optionsStore.state.save();
  };

  const handlePanelSplitDirectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    optionsStore.state.panels.splitDirection = event.target.value as "horizontal" | "vertical";
    optionsStore.state.save();
  };

  const handleEditingModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    optionsStore.state.editor.editingMode = event.target.value as "default" | "vim";
    optionsStore.state.save();
  };

  return (
    <Transition as={Fragment} show={isOpen}>
      <Dialog as="div" className="relative z-50" initialFocus={cancelButtonRef} onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-fade duration-(--duration-fade)"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-fade duration-(--duration-quick)"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="dialog-backdrop" />
        </TransitionChild>

        <div className="overflow-y-auto fixed inset-0 z-10 w-screen">
          <div className="flex justify-center items-end p-4 min-h-full text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-(--duration-enter)"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-1 sm:scale-98"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-out duration-(--duration-quick)"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-1 sm:scale-98"
            >
              <DialogPanel className="dialog-panel">
                <DialogTitle as="h3" className="dialog-title">
                  Preferences
                </DialogTitle>

                <div className="dialog-body">
                  {!isMobile && (
                    <div className="field-group">
                      <label className="field-label" htmlFor="panel-split-direction">
                        Panel split direction
                      </label>
                      <select
                        className="field-control"
                        id="panel-split-direction"
                        value={options.panels.splitDirection}
                        onChange={handlePanelSplitDirectionChange}
                      >
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                      </select>
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label" htmlFor="editing-mode">
                      Editing mode
                    </label>
                    <select
                      className="field-control"
                      id="editing-mode"
                      value={options.editor.editingMode}
                      onChange={handleEditingModeChange}
                    >
                      <option value="default">Default</option>
                      <option value="vim">Vim</option>
                    </select>
                  </div>

                  <div className="check-row">
                    <input
                      checked={options.renderer.theme === "dark"}
                      className="switch-input"
                      id="dark-theme"
                      role="switch"
                      type="checkbox"
                      onChange={handleDarkThemeChange}
                    />
                    <label className="check-label" htmlFor="dark-theme">
                      Dark theme
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-dashed border-border pt-4">
                    {!isMobile && (
                      <div className="check-row">
                        <input
                          checked={options.renderer.enableMinimap}
                          className="check-input"
                          id="enable-minimap"
                          type="checkbox"
                          onChange={handleMinimapChange}
                        />
                        <label className="check-label" htmlFor="enable-minimap">
                          Show minimap
                        </label>
                      </div>
                    )}

                    <div className="check-row">
                      <input
                        checked={options.renderer.badgeHubs}
                        className="check-input"
                        id="badge-hubs"
                        type="checkbox"
                        onChange={handleBadgeHubsChange}
                      />
                      <label className="check-label" htmlFor="badge-hubs">
                        Collapse hub types into badges
                      </label>
                    </div>

                    <div className="check-row">
                      <input
                        checked={options.renderer.compactLayout}
                        className="check-input"
                        id="compact-layout"
                        type="checkbox"
                        onChange={handleCompactLayoutChange}
                      />
                      <label className="check-label" htmlFor="compact-layout">
                        Compact layout
                      </label>
                    </div>

                    <div className="check-row">
                      <input
                        checked={options.renderer.colorizeEdges}
                        className="check-input"
                        id="colorize-edges"
                        type="checkbox"
                        onChange={handleColorizeEdgesChange}
                      />
                      <label className="check-label" htmlFor="colorize-edges">
                        Colorize edges
                      </label>
                    </div>
                  </div>
                </div>

                <div className="dialog-footer">
                  <button
                    ref={cancelButtonRef}
                    className="button-secondary w-full sm:w-auto"
                    type="button"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
