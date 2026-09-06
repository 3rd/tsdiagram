import { createContext, useContext } from "react";
import { EMPTY_PORT_COLORS } from "./edge-colors";

export const PortColorsContext = createContext<ReadonlyMap<string, string>>(EMPTY_PORT_COLORS);

export const usePortColor = (portId: string) => useContext(PortColorsContext).get(portId);
