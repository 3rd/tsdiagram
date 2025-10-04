import { Fragment, useRef, useState } from "react";
import { useEffect } from "react";
import { useCallback } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { CopyIcon, DownloadIcon, Link2Icon } from "@radix-ui/react-icons";
import { getNodesBounds, getTransformForBounds, useReactFlow } from "reactflow";
import { copySVG, downloadSVG, exportReactFlowToSVG } from "../utils/svg-export";

export type ShareProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const Share = ({ isOpen, onClose }: ShareProps) => {
  const cancelButtonRef = useRef(null);
  const [hasCopiedLink, setHasCopiedLink] = useState(false);
  const [hasCopiedSVG, setHasCopiedSVG] = useState(false);
  const { getNodes } = useReactFlow();

  const shareLink = window.location.href;

  const getSVGSource = useCallback(async () => {
    const nodesBounds = getNodesBounds(getNodes());
    const width = nodesBounds.width;
    const height = nodesBounds.height;
    const transform = getTransformForBounds(nodesBounds, width, height, 0.5, 2);
    const cssTransform = `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`;
    return exportReactFlowToSVG(width, height, cssTransform);
  }, [getNodes]);

  const [previewImageURL, setPreviewImageURL] = useState<string | null>(null);
  const needsPreviewBuild = useRef(true);
  useEffect(() => {
    if (!isOpen) {
      needsPreviewBuild.current = true;
      return;
    }

    const buildPreviewImage = async () => {
      const svgSource = await getSVGSource();
      setPreviewImageURL(URL.createObjectURL(new Blob([svgSource], { type: "image/svg+xml" })));
      needsPreviewBuild.current = false;
    };
    buildPreviewImage();
  }, [getSVGSource, isOpen]);

  const handleExportSVGToFile = async () => {
    const svgSource = await getSVGSource();
    downloadSVG(svgSource, "diagram.svg");
  };

  const handleCopySVG = async () => {
    const svgSource = await getSVGSource();
    await copySVG(svgSource);
    setHasCopiedSVG(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setHasCopiedLink(true);
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
                  Share
                </Dialog.Title>

                {previewImageURL && (
                  <div className="flex justify-center bg-gray-50 checkered">
                    <img alt="diagram" className="h-[20vh]" src={previewImageURL} />
                  </div>
                )}

                <div className="flex flex-col gap-4 py-4 px-3">
                  {/* share link */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium leading-6 text-gray-900">
                      Share a link to this diagram:
                    </label>
                    <div className="flex rounded-md shadow-sm">
                      <div className="flex relative flex-grow items-stretch focus-within:z-10">
                        <input
                          className="block py-1.5 px-2 w-full rounded-none rounded-l-md border-0 ring-1 ring-inset ring-gray-300 sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-indigo-600 placeholder:text-gray-400"
                          id="email"
                          name="email"
                          placeholder="John Smith"
                          type="email"
                          value={shareLink}
                          readOnly
                        />
                      </div>
                      <button
                        className="inline-flex relative gap-x-1.5 items-center py-2 px-3 -ml-px text-sm font-semibold text-gray-900 rounded-r-md ring-1 ring-inset ring-gray-300"
                        type="button"
                        onClick={handleCopyLink}
                      >
                        <Link2Icon />
                        {hasCopiedLink ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* export svg */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium leading-6 text-gray-900">Export as SVG:</label>
                    <div className="flex gap-2">
                      {/* copy to clipboard */}
                      <button
                        className="flex flex-1 gap-2 justify-center items-center py-3 px-2 text-sm leading-none text-white rounded shadow-sm bg-blue-700/90 hover:bg-blue-700/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        type="button"
                        onClick={handleCopySVG}
                      >
                        <CopyIcon />
                        {hasCopiedSVG ? "Copied" : "Copy to clipboard"}
                      </button>

                      {/* download .svg */}
                      <button
                        className="flex flex-1 gap-2 justify-center items-center py-3 px-2 text-sm leading-none text-white rounded shadow-sm bg-blue-700/90 hover:bg-blue-700/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        type="button"
                        onClick={handleExportSVGToFile}
                      >
                        <DownloadIcon />
                        Download .svg
                      </button>
                    </div>
                  </div>
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
