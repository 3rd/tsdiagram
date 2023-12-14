import { useMediaQuery } from "./useMediaQuery";

export const useFullscreen = (ref: React.RefObject<HTMLElement>) => {
  const isFullscreen = useMediaQuery("(display-mode: fullscreen)");

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
