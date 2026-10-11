export const downloadSVG = (svgString: string, filename: string) => {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const anchor = document.createElement("a");
  anchor.href = svgUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(svgUrl);
};

export const copySVG = async (svgSource: Promise<string>) => {
  if (typeof ClipboardItem === "undefined") {
    await navigator.clipboard.writeText(await svgSource);
    return;
  }

  const svgBlob = svgSource.then((svgString) => new Blob([svgString], { type: "text/plain" }));

  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": svgBlob })]);
  } catch (error) {
    await svgSource;
    throw error;
  }
};
