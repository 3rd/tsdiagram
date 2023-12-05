import { useMediaQuery } from "./useMediaQuery";

export const useIsMobile = () => useMediaQuery("(max-width: 768px)");
