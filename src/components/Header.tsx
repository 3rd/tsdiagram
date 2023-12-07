import { getRectOfNodes, getTransformForBounds, useReactFlow } from "reactflow";
import { toPng } from "html-to-image";
import { memo } from "react";

const imageWidth = 1024;
const imageHeight = 768;

const downloadImage = (dataUrl: string) => {
  const a = document.createElement("a");
  a.setAttribute("download", "diagram.png");
  a.setAttribute("href", dataUrl);
  a.click();
};

type HeaderProps = {
  onPreferencesClick?: () => void;
};

export const Header = memo(({ onPreferencesClick }: HeaderProps) => {
  const { getNodes } = useReactFlow();

  // https://reactflow.dev/examples/misc/download-image
  const handleExportClick = () => {
    const nodesBounds = getRectOfNodes(getNodes());
    const transform = getTransformForBounds(nodesBounds, imageWidth + 2, imageHeight, 0.5, 2);

    toPng(document.querySelector(".react-flow__viewport") as HTMLElement, {
      backgroundColor: "#fff",
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
      },
    }).then(downloadImage);
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
          📦 Export PNG
        </button>
      </div>
    </header>
  );
});
