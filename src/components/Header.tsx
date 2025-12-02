import { memo } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FilePlusIcon,
  GearIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import classNames from "classnames";
import { useStore } from "statelift";
import { documentsStore } from "../stores/documents";
import { optionsStore, useUserOptions } from "../stores/user-options";

const RELATED_SITES = [
  {
    name: "BenchJS",
    description: "Benchmark JavaScript online",
    href: "https://benchjs.com",
  },
  {
    name: "SneakyDomains",
    description: "Find amazing domain names",
    href: "https://sneakydomains.com",
  },
] as const;

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
    optionsStore.state.general.sidebarOpen = !optionsStore.state.general.sidebarOpen;
    optionsStore.state.save();
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
      <div className="flex flex-1 gap-2 justify-between items-center p-2">
        {/* left */}
        <div className={classNames("flex gap-2 items-center", {})}>
          {/* sidebar button */}
          <button
            className="flex justify-center items-center w-7 h-7 rounded focus:outline-none hover:bg-white/20"
            onClick={handleSidebarButtonClick}
          >
            {options.general.sidebarOpen ? <ArrowLeftIcon /> : <ArrowRightIcon />}
          </button>

          {/* logo with site switcher */}
          <div className="hidden items-center sm:flex">
            <div className="relative group">
              <div className="flex gap-1 items-center py-1 px-1.5 text-lg font-bold leading-none rounded transition-colors cursor-pointer hover:bg-white/10">
                <span className="py-1 px-0.5 mr-0.5 rounded" style={{ background: "#3178c6" }}>
                  TS
                </span>
                <span>Diagram</span>
                <ChevronDownIcon className="w-4 h-4 opacity-60" />
              </div>

              {/* dropdown menu - on hover */}
              <div className="absolute left-0 top-full invisible z-50 pt-2 w-64 opacity-0 transition-all duration-150 ease-out origin-top-left scale-95 group-hover:visible group-hover:opacity-100 group-hover:scale-100">
                <div className="overflow-hidden rounded-lg divide-y ring-1 shadow-xl bg-blue-950 ring-white/10 divide-white/10">
                  {RELATED_SITES.map((site) => (
                    <a
                      key={site.name}
                      className="flex gap-2 items-center py-2.5 px-3 transition-colors hover:bg-white/10"
                      href={site.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex gap-1.5 items-center">
                          <span className="font-medium text-white">{site.name}</span>
                          <ExternalLinkIcon className="w-3 h-3 text-blue-300" />
                        </div>
                        <p className="mt-0.5 text-xs text-blue-200">{site.description}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* github link */}
            <iframe
              className="ml-4 opacity-20 transition-opacity hover:opacity-100"
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
