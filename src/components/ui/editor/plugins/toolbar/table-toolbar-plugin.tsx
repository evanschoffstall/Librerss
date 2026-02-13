"use client";

import { TableIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToolbarContext } from "@/components/ui/editor/context/toolbar-context";
import { InsertTableDialog } from "@/components/ui/editor/plugins/table-plugin";

export function TableToolbarPlugin() {
  const { activeEditor, showModal } = useToolbarContext();

  return (
    <Button
      onClick={() =>
        showModal("Insert Table", (onClose) => (
          <InsertTableDialog activeEditor={activeEditor} onClose={onClose} />
        ))
      }
      size={"icon"}
      variant={"outline"}
      className=""
    >
      <TableIcon className="size-4" />
    </Button>
  );
}
