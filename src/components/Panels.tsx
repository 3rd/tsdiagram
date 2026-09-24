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
          "panel-separator bg-canvas focus-visible:-outline-offset-2",
          isVertical ? "h-1.5" : "w-1.5"
        )}
      />,
      <Panel key="panel-renderer" id="renderer">
        {rendererChildren}
      </Panel>,
    ];
    return members;
  }, [isMobile, isVertical, editorChildren, rendererChildren]);

  return (
    <Group
      className={classNames("[view-transition-name:main]", { "panels-vertical": isVertical })}
      defaultLayout={defaultLayout}
      orientation={direction}
      onLayoutChanged={onLayoutChanged}
    >
      {panelGroupMembers}
    </Group>
  );
};
