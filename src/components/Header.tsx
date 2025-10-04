import { memo } from "react";
import { ArrowLeftIcon, ArrowRightIcon, FilePlusIcon, GearIcon, Share1Icon } from "@radix-ui/react-icons";
import classNames from "classnames";
import { useStore } from "statelift";
import { documentsStore } from "../stores/documents";
import { useUserOptions } from "../stores/user-options";

type HeaderProps = {
  onPreferencesClick?: () => void;
  onShareClick?: () => void;
};

export const Header = memo(({ onPreferencesClick, onShareClick }: HeaderProps) => {
  const options = useUserOptions();
  const documentTitle = useStore(documentsStore, (state) => state.currentDocument.title);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    documentsStore.state.setCurrentDocumentTitle(e.target.value);
    documentsStore.state.save();
  };

  const handleSidebarButtonClick = () => {
    options.general.sidebarOpen = !options.general.sidebarOpen;
    options.save();
  };

  const handleNewDocumentClick = () => {
    documentsStore.state.create();
  };

  return (
    <header className="flex text-gray-50 bg-blue-900">
      {/* sidebar header */}
      {options.general.sidebarOpen && (
        <div
          className={classNames("flex flex-col p-2 px-4 w-64 h-full flex-shrink-0", {
            "bg-gray-100 text-gray-950": options.renderer.theme === "light",
            "bg-gray-950 text-gray-100": options.renderer.theme === "dark",
          })}
        >
          <div className="flex gap-2 justify-between items-center">
            <span className="font-bold leading-none">Documents</span>
            <button
              className="flex justify-center items-center w-7 h-7 rounded focus:outline-none hover:bg-gray-900/20"
              onClick={handleNewDocumentClick}
            >
              <FilePlusIcon />
            </button>
          </div>
        </div>
      )}

      {/* main wrapper */}
      <div className="flex overflow-hidden flex-1 gap-2 justify-between items-center p-2">
        {/* left */}
        <div className={classNames("flex gap-2 items-center", {})}>
          {/* sidebar button */}
          <button
            className="flex justify-center items-center w-7 h-7 rounded focus:outline-none hover:bg-white/20"
            onClick={handleSidebarButtonClick}
          >
            {options.general.sidebarOpen ? <ArrowLeftIcon /> : <ArrowRightIcon />}
          </button>

          {/* logo */}
          <div className="hidden items-center text-lg font-bold leading-none sm:flex">
            <span className="py-1 px-0.5 mr-0.5 rounded" style={{ background: "#3178c6" }}>
              TS
            </span>
            <span>Diagram</span>
            <iframe
              className="hidden ml-4 opacity-20 sm:block hover:opacity-100"
              height="20"
              sandbox="allow-scripts allow-popups"
              src="https://ghbtns.com/github-btn.html?user=3rd&repo=tsdiagram&type=star&count=true"
              title="GitHub"
              width="100"
            />
          </div>
        </div>

        {/* center - document title */}
        <input
          className="w-full text-sm text-left bg-transparent rounded ring-0 outline-none sm:text-lg sm:text-center hover:text-blue-200 focus:text-white overflow-ellipsis"
          placeholder="Untitled"
          type="text"
          value={documentTitle}
          onChange={handleTitleChange}
        />

        {/* right - actions */}
        <div className="flex gap-2 items-center">
          {/* share */}
          <button
            className="flex gap-1 items-center py-1.5 px-2 text-sm leading-none rounded shadow-sm bg-white/10 hover:bg-white/20"
            onClick={onShareClick}
          >
            <Share1Icon /> Share
          </button>

          {/* preferences */}
          <button
            className="flex gap-1 items-center py-1.5 px-2 text-sm leading-none rounded shadow-sm bg-white/10 hover:bg-white/20"
            onClick={onPreferencesClick}
          >
            <GearIcon /> Preferences
          </button>
        </div>
      </div>
    </header>
  );
});
