// @ts-nocheck - Lexical editor uses non-serializable props which is valid for client components
"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_CRITICAL, SELECTION_CHANGE_COMMAND } from "lexical";
import { useEffect, useState } from "react";

import { ToolbarContext } from "@/components/ui/editor/context/toolbar-context";
import { useEditorModal } from "@/components/ui/editor/editor-hooks/use-modal";

type ToolbarPluginProps = {
  children: any;
};

export function ToolbarPlugin({ children }: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();

  const [activeEditor, setActiveEditor] = useState(editor);
  const [blockType, setBlockType] = useState<string>("paragraph");

  const [modal, showModal] = useEditorModal();

  const $updateToolbar = () => {};

  useEffect(() => {
    return activeEditor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return (
    <ToolbarContext
      activeEditor={activeEditor}
      $updateToolbar={$updateToolbar}
      blockType={blockType}
      setBlockType={setBlockType}
      showModal={showModal}
    >
      {modal}

      {children({ blockType })}
    </ToolbarContext>
  );
}
