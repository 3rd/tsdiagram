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
import { documentsStore, flushDocumentURL } from "../stores/documents";
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
  };

  const handleShareClick = () => {
    flushDocumentURL();
    onShareClick?.();
  };

  const handleSidebarButtonClick = () => {
    optionsStore.state.general.sidebarOpen = !optionsStore.state.general.sidebarOpen;
    optionsStore.state.save();
  };

  const handleNewDocumentClick = () => {
    documentsStore.state.create();
  };

  return (
    <header className="flex h-10 shrink-0 bg-blue-900 text-gray-50 shadow-sm">
      {options.general.sidebarOpen && (
        <div
          className={classNames("flex h-10 w-64 shrink-0 items-center px-2.5", {
            "bg-white text-gray-950": options.renderer.theme === "light",
            "bg-gray-950 text-gray-100": options.renderer.theme === "dark",
          })}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-sm font-semibold leading-none">Documents</span>
            <button
              aria-label="Create new document"
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-gray-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={handleNewDocumentClick}
            >
              <FilePlusIcon />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 px-2">
        <div className="flex items-center gap-1.5">
          <button
            aria-label={options.general.sidebarOpen ? "Hide document sidebar" : "Show document sidebar"}
            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={handleSidebarButtonClick}
          >
            {options.general.sidebarOpen ?
              <ArrowLeftIcon />
            : <ArrowRightIcon />}
          </button>

          <div className="hidden items-center sm:flex">
            <div className="relative group">
              <div className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-base font-bold leading-none transition-colors hover:bg-white/10">
                <span className="mr-0.5 rounded-sm px-1 py-0.5" style={{ background: "#3178c6" }}>
                  TS
                </span>
                <span>Diagram</span>
                <ChevronDownIcon className="size-3.5 opacity-60" />
              </div>

              <div className="absolute left-0 top-full invisible z-50 pt-2 w-64 opacity-0 transition-all duration-150 ease-out origin-top-left scale-95 group-hover:visible group-hover:opacity-100 group-hover:scale-100">
                <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-blue-950 shadow-xl">
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

            <iframe
              className="ml-3 opacity-40 transition-opacity hover:opacity-100"
              height="20"
              sandbox="allow-scripts allow-popups"
              src="https://ghbtns.com/github-btn.html?user=3rd&repo=tsdiagram&type=star&count=true"
              title="GitHub"
              width="100"
            />
          </div>
        </div>

        <input
          className="h-7 min-w-0 flex-1 truncate rounded-md bg-transparent px-2 text-left text-sm font-medium outline-none transition-colors hover:text-blue-200 focus:bg-white/10 focus:text-white sm:text-center"
          placeholder="Untitled"
          type="text"
          value={documentTitle}
          onChange={handleTitleChange}
        />

        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Share"
            className="flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 text-sm font-medium leading-none shadow-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={handleShareClick}
          >
            <Share1Icon /> <span className="hidden sm:inline">Share</span>
          </button>

          <button
            aria-label="Preferences"
            className="flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 text-sm font-medium leading-none shadow-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={onPreferencesClick}
          >
            <GearIcon /> <span className="hidden sm:inline">Preferences</span>
          </button>
        </div>
      </div>
    </header>
  );
});
