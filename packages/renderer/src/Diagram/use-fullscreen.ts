import { useEffect, useState } from "react";

export const useFullscreen = (ref: React.RefObject<HTMLElement | null>) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === ref.current);
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [ref]);

  const enterFullscreen = () => {
    if (!ref.current) return;
    ref.current.requestFullscreen();
  };

  const exitFullscreen = () => {
    if (!ref.current) return;
    document.exitFullscreen();
  };

  const toggleFullscreen = () => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  };

  return { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen };
};
