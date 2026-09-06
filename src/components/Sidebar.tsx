import { memo, useCallback, useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import classNames from "classnames";
import { documentsStore, useDocuments } from "../stores/documents";
import { useUserOptions } from "../stores/user-options";

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
      className={classNames("flex items-center rounded-lg transition-colors hover:bg-gray-500/10", {
        "bg-gray-500/20": isActive,
      })}
    >
      <button
        className="flex min-w-0 flex-1 items-center self-stretch rounded-lg px-2 text-left font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
        onClick={handleClick}
      >
        <span className="truncate">{displayTitle}</span>
      </button>
      <button
        aria-label={deleteButtonLabel}
        className="my-1 mr-1 flex size-7 items-center justify-center rounded-md leading-none opacity-60 transition-colors hover:bg-gray-500/15 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
        onClick={handleDeleteClick}
        onMouseLeave={handleMouseLeave}
      >
        {deleteConfirmationState === "default" && <Cross2Icon />}
        {deleteConfirmationState === "confirm" && (
          <span className="text-xs font-medium text-red-600">Sure?</span>
        )}
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
      className={classNames("flex h-full w-64 shrink-0 flex-col border-r", {
        "border-gray-200 bg-white text-gray-800": options.renderer.theme === "light",
        "border-gray-800 bg-gray-950 text-gray-200": options.renderer.theme === "dark",
      })}
    >
      <div className="flex overflow-y-auto flex-col flex-1">
        <ul className="flex flex-col gap-1 p-2 text-sm">{sidebarItems}</ul>
      </div>
    </div>
  );
});
