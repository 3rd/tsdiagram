import type { MouseEventHandler } from "react";
import classNames from "classnames";
import { MODEL_CARD_CLASSES } from "../ModelCard.styles";

type ModelBadgeProps = {
  name: string;
  isHovered?: boolean;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
};

export const ModelBadge = ({ name, isHovered = false, onMouseEnter, onMouseLeave }: ModelBadgeProps) => (
  <span
    className={classNames(
      "cursor-default rounded-sm px-[5px] py-px text-micro font-medium",
      isHovered ? "bg-selection-hover" : "bg-inset",
      MODEL_CARD_CLASSES.field.modelTypeColor
    )}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    {name}
  </span>
);
