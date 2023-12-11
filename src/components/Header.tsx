import { memo } from "react";
import { Share1Icon, GearIcon } from "@radix-ui/react-icons";

type HeaderProps = {
  onPreferencesClick?: () => void;
  onShareClick?: () => void;
};

export const Header = memo(({ onPreferencesClick, onShareClick }: HeaderProps) => {
  return (
    <header className="flex justify-between items-center p-2 text-gray-50 bg-blue-900">
      {/* logo */}
      <div className="flex items-center text-lg font-bold leading-none">
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
      {/* actions */}
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
    </header>
  );
});
