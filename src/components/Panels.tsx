import { useMemo } from "react";
import classNames from "classnames";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { UserOptions } from "../store";
import { useIsMobile } from "../hooks/useIsMobile";

const defaultCodePanelSizePercentage = 50;
const mobileCodePanelSizePercentage = 60;

type PanelsProps = {
  editorChildren: React.ReactNode;
  rendererChildren: React.ReactNode;
  options: UserOptions;
};

export const Panels = ({ editorChildren, rendererChildren, options }: PanelsProps) => {
  const isMobile = useIsMobile();

  const panelGroupMembers = useMemo(() => {
    const members = [
      <Panel
        key="panel-editor"
        defaultSizePercentage={isMobile ? mobileCodePanelSizePercentage : defaultCodePanelSizePercentage}
        id="editor"
      >
        {editorChildren}
      </Panel>,
      <PanelResizeHandle
        key="panel-resize-handle"
        className={classNames(
          "w-1.5",
          { "bg-gray-600": options.renderer.theme === "dark" },
          { "bg-gray-200": options.renderer.theme === "light" }
        )}
      />,
      <Panel key="panel-renderer" id="renderer">
        {rendererChildren}
      </Panel>,
    ];
    if (isMobile) members.reverse();
    return members;
  }, [isMobile, editorChildren, options.renderer.theme, rendererChildren]);

  return (
    <PanelGroup autoSaveId="example" direction={isMobile ? "vertical" : "horizontal"}>
      {panelGroupMembers}
    </PanelGroup>
  );
};
