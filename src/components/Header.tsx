import { getRectOfNodes, useReactFlow } from "reactflow";
import { memo } from "react";
import { exportReactFlowToSVG } from "../utils/svg-export";

const EXPORT_MARGIN_PX = 30;

type HeaderProps = {
  onPreferencesClick?: () => void;
};

export const Header = memo(({ onPreferencesClick }: HeaderProps) => {
  const { getNodes } = useReactFlow();

  const handleExportClick = () => {
    const nodesBounds = getRectOfNodes(getNodes());
    const width = nodesBounds.width + EXPORT_MARGIN_PX * 2;
    const height = nodesBounds.height + EXPORT_MARGIN_PX * 2;
    exportReactFlowToSVG(width, height);
  };

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
        {/* preferences */}
        <button
          className="py-1 px-2 text-sm rounded shadow-sm bg-white/10 hover:bg-white/20"
          onClick={onPreferencesClick}
        >
          ⚙ Preferences
        </button>
        {/* export */}
        <button
          className="py-1 px-2 text-sm rounded shadow-sm bg-white/10 hover:bg-white/20"
          onClick={handleExportClick}
        >
          📦 Export SVG
        </button>
      </div>
    </header>
  );
});
