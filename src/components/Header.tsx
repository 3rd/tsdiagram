import { memo } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FilePlusIcon,
  GearIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
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

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const supportsViewTransitionTypes = () =>
  typeof ViewTransition !== "undefined" && "types" in ViewTransition.prototype;

const animateLayoutChange = (update: () => void) => {
  const canAnimateLayout = supportsViewTransitionTypes() && !prefersReducedMotion();
  if (!canAnimateLayout) {
    update();
    return;
  }

  document.startViewTransition({ update: () => flushSync(update), types: ["layout"] });
};

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
    animateLayoutChange(() => {
      optionsStore.state.general.sidebarOpen = !optionsStore.state.general.sidebarOpen;
      optionsStore.state.save();
    });
  };

  const handleNewDocumentClick = () => {
    documentsStore.state.create();
  };

  return (
    <header className="relative z-10 box-content flex h-9 shrink-0 border-b border-header-border bg-header text-header-fg">
      {options.general.sidebarOpen && (
        <div className="-mb-px flex h-[calc(--spacing(9)+1px)] w-64 shrink-0 items-center [view-transition-name:sidebar-header] border-r border-b border-border bg-pane px-2.5 text-text">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-title font-strong">Documents</span>
            <button
              aria-label="Create new document"
              className="flex size-7 items-center justify-center rounded-control text-text-muted transition-[color,background-color] duration-(--duration-hover) ease-out hover:bg-control-hover hover:text-text active:duration-(--duration-instant)"
              onClick={handleNewDocumentClick}
            >
              <FilePlusIcon />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 px-2 [view-transition-name:toolbar]">
        <div className="flex items-center gap-1.5">
          <button
            aria-label={options.general.sidebarOpen ? "Hide document sidebar" : "Show document sidebar"}
            className="flex size-7 items-center justify-center rounded-control text-header-fg-muted transition-[color,background-color] duration-(--duration-hover) ease-out hover:bg-header-control-hover hover:text-header-fg focus-visible:outline-header-fg active:duration-(--duration-instant)"
            onClick={handleSidebarButtonClick}
          >
            {options.general.sidebarOpen ? <ArrowLeftIcon /> : <ArrowRightIcon />}
          </button>

          <div className="hidden items-center sm:flex">
            <div className="relative group">
              <div className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control px-1.5 text-body font-strong transition-[background-color] duration-(--duration-hover) ease-out hover:bg-header-control">
                <span className="flex h-5 items-center rounded-sm bg-brand px-1 text-brand-fg">
                  <span className="[text-box:trim-both_cap_alphabetic]">TS</span>
                </span>
                <span className="[text-box:trim-both_cap_alphabetic]">Diagram</span>
                <ChevronDownIcon className="size-3.5 -translate-y-px text-header-fg-muted" />
              </div>

              <div className="invisible absolute top-full left-0 z-50 w-64 -translate-y-[3px] pt-1.5 opacity-0 transition-[opacity,transform,visibility] duration-(--duration-quick) ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="flex flex-col gap-0.5 rounded-lg border border-border-strong bg-raised p-1 text-text shadow-(--shadow-popover)">
                  {RELATED_SITES.map((site) => (
                    <a
                      key={site.name}
                      className="flex items-center gap-2 rounded-[5px] px-2 py-1.5 transition-[background-color] duration-(--duration-hover) ease-out hover:bg-selection"
                      href={site.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex gap-1.5 items-center">
                          <span className="text-ui font-medium text-text">{site.name}</span>
                          <ExternalLinkIcon className="size-3 text-text-faint" />
                        </div>
                        <p className="text-ui text-text-faint">{site.description}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <iframe
              className="ml-3 opacity-40 scheme-light transition-opacity duration-(--duration-hover) ease-out hover:opacity-100"
              height="20"
              sandbox="allow-scripts allow-popups"
              src="https://ghbtns.com/github-btn.html?user=3rd&repo=tsdiagram&type=star&count=true"
              title="GitHub"
              width="100"
            />
          </div>
        </div>

        <input
          className="h-7 min-w-0 flex-1 truncate rounded-control bg-transparent px-2 text-left text-body font-medium text-header-fg outline-none transition-[background-color] duration-(--duration-hover) ease-out placeholder:text-header-fg-muted hover:bg-header-control focus:bg-header-control-hover sm:text-center"
          placeholder="Untitled"
          type="text"
          value={documentTitle}
          onChange={handleTitleChange}
        />

        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Share"
            className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control border border-header-border bg-header-control px-[9px] text-ui font-medium text-header-fg transition-[background-color] duration-(--duration-hover) ease-out hover:bg-header-control-hover focus-visible:outline-header-fg active:duration-(--duration-instant) [&_svg]:size-3.5"
            onClick={handleShareClick}
          >
            <Share1Icon /> <span className="hidden sm:inline">Share</span>
          </button>

          <button
            aria-label="Preferences"
            className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control border border-header-border bg-header-control px-[9px] text-ui font-medium text-header-fg transition-[background-color] duration-(--duration-hover) ease-out hover:bg-header-control-hover focus-visible:outline-header-fg active:duration-(--duration-instant) [&_svg]:size-3.5"
            onClick={onPreferencesClick}
          >
            <GearIcon /> <span className="hidden sm:inline">Preferences</span>
          </button>
        </div>
      </div>
    </header>
  );
});
