import { memo, useCallback, useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import classNames from "classnames";
import { documentsStore, useDocuments } from "../stores/documents";

type SidebarItemProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
};
const SidebarItem = memo(({ id, title, onClick, onDelete, isActive }: SidebarItemProps) => {
  const [deleteConfirmationState, setDeleteConfirmationState] = useState<"confirm" | "default">("default");
  const displayTitle = title || "Untitled";
  const deleteButtonLabel =
    deleteConfirmationState === "default" ? `Delete ${displayTitle}` : `Confirm deletion of ${displayTitle}`;

  const handleClick = () => onClick(id);

  const handleDeleteClick = () => {
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
        "flex h-7 items-center rounded-control transition-[background-color] duration-(--duration-hover) ease-out",
        isActive ? "bg-selection hover:bg-selection-hover" : "hover:bg-control-hover"
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center self-stretch rounded-control px-2 text-left font-medium focus-visible:-outline-offset-2"
        onClick={handleClick}
      >
        <span className="truncate">{displayTitle}</span>
      </button>
      <button
        aria-label={deleteButtonLabel}
        className="mr-0.5 flex h-6 min-w-6 items-center justify-center rounded-control px-1 text-text-faint transition-[color,background-color] duration-(--duration-hover) ease-out hover:bg-control-hover hover:text-text focus-visible:-outline-offset-2 active:duration-(--duration-instant)"
        onClick={handleDeleteClick}
        onMouseLeave={handleMouseLeave}
      >
        {deleteConfirmationState === "default" && <Cross2Icon />}
        {deleteConfirmationState === "confirm" && (
          <span className="text-ui font-medium text-error">Delete?</span>
        )}
      </button>
    </li>
  );
});

export const Sidebar = memo(() => {
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
    <div className="flex h-full w-64 shrink-0 flex-col [view-transition-name:sidebar] border-r border-border bg-pane text-text">
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        <ul className="flex flex-col gap-0.5 p-1.5 text-body">{sidebarItems}</ul>
      </div>
    </div>
  );
});
