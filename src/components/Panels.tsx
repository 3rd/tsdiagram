import { useMemo } from "react";
import classNames from "classnames";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { useIsMobile } from "../hooks/useIsMobile";
import { useUserOptions } from "../stores/user-options";

const defaultCodePanelSizePercentage = "50%";
const mobileCodePanelSizePercentage = "60%";

type PanelsProps = {
  editorChildren: React.ReactNode;
  rendererChildren: React.ReactNode;
};

export const Panels = ({ editorChildren, rendererChildren }: PanelsProps) => {
  const options = useUserOptions();
  const isMobile = useIsMobile();

  const direction = isMobile ? "vertical" : options.panels.splitDirection;
  const isVertical = direction === "vertical";

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "example" });

  const panelGroupMembers = useMemo(() => {
    const members = [
      <Panel
        key="panel-editor"
        defaultSize={isMobile ? mobileCodePanelSizePercentage : defaultCodePanelSizePercentage}
        id="editor"
      >
        {editorChildren}
      </Panel>,
      <Separator
        key="panel-resize-handle"
        className={classNames(
          "transition-colors hover:bg-blue-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600",
          isVertical ? "h-1.5" : "w-1.5",
          { "bg-gray-700": options.renderer.theme === "dark" },
          { "bg-gray-100": options.renderer.theme === "light" }
        )}
      />,
      <Panel key="panel-renderer" id="renderer">
        {rendererChildren}
      </Panel>,
    ];
    return members;
  }, [isMobile, isVertical, editorChildren, options.renderer.theme, rendererChildren]);

  return (
    <Group
      className={isVertical ? "panels-vertical" : undefined}
      defaultLayout={defaultLayout}
      orientation={direction}
      onLayoutChanged={onLayoutChanged}
    >
      {panelGroupMembers}
    </Group>
  );
};
