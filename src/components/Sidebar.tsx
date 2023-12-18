import { Cross2Icon } from "@radix-ui/react-icons";
import { useUserOptions } from "../stores/user-options";
import { documentsStore, useDocuments } from "../stores/documents";
import { memo, useCallback, useState } from "react";
import classNames from "classnames";

type SidebarItemProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
};
const SidebarItem = memo(({ id, title, onClick, onDelete, isActive }: SidebarItemProps) => {
  const [deleteConfirmationState, setDeleteConfirmationState] = useState<"confirm" | "default">("default");

  const handleClick = () => onClick(id);

  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    if (deleteConfirmationState === "default") {
      setDeleteConfirmationState("confirm");
    } else {
      onDelete(id);
    }
  };

  const handleMouseLeave = () => {
    setDeleteConfirmationState("default");
  };

  return (
    <li
      key={id}
      className={classNames(
        "flex justify-between items-center py-1 px-2 rounded focus:outline-none hover:bg-gray-900/20",
        { "bg-gray-500/20": isActive }
      )}
      role="button"
      onClick={handleClick}
    >
      <span className="truncate">{title || "Untitled"}</span>
      <button
        className="flex justify-center items-center px-1.5 h-7 leading-none rounded focus:outline-none hover:bg-gray-900/20"
        onClick={handleDeleteClick}
        onMouseLeave={handleMouseLeave}
      >
        {deleteConfirmationState === "default" && <Cross2Icon />}
        {deleteConfirmationState === "confirm" && <span className="text-xs text-red-500">Sure?</span>}
      </button>
    </li>
  );
});

export const Sidebar = memo(() => {
  const options = useUserOptions();
  const documents = useDocuments();

  const handleItemClick = useCallback((id: string) => {
    documentsStore.state.setCurrentDocumentId(id);
  }, []);

  const handleItemDelete = useCallback((id: string) => {
    documentsStore.state.delete(id);
  }, []);

  const sidebarItems = documents.documents.map((doc) => {
    const isCurrentDocument = documents.currentDocumentId === doc.id;

    return (
      <SidebarItem
        key={doc.id}
        id={doc.id}
        isActive={isCurrentDocument}
        title={doc.title}
        onClick={handleItemClick}
        onDelete={handleItemDelete}
      />
    );
  });

  return (
    <div
      className={classNames("flex flex-col flex-shrink-0 w-64 h-full border-r", {
        "bg-gray-50": options.renderer.theme === "light",
        "bg-stone-900 text-stone-200": options.renderer.theme === "dark",
      })}
    >
      <div className="flex overflow-y-auto flex-col flex-1">
        <ul className="flex flex-col gap-2 p-2 text-sm">{sidebarItems}</ul>
      </div>
    </div>
  );
});
