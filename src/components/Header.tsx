import { getRectOfNodes, getTransformForBounds, useReactFlow } from "reactflow";
import { toPng } from "html-to-image";

const imageWidth = 1024;
const imageHeight = 768;

const downloadImage = (dataUrl: string) => {
  const a = document.createElement("a");
  a.setAttribute("download", "diagram.png");
  a.setAttribute("href", dataUrl);
  a.click();
};

export const Header = () => {
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
    <header className="flex justify-between items-center p-2 border-b border-stone-700 bg-stone-800">
      {/* logo */}
      <div className="flex items-center">
        <span className="text-xl font-bold">🌳</span>
        <span className="ml-2 text-lg font-bold"> CodeDesigner</span>
      </div>
      {/* actions */}
      <div className="flex gap-2 items-center">
        <button className="py-1 px-2 rounded-sm bg-stone-700 hover:bg-stone-600" onClick={handleExportClick}>
          📦 Export
        </button>
      </div>
    </header>
  );
};
