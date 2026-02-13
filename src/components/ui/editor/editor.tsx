"use client";

import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { SerializedEditorState } from "lexical";

import { editorTheme } from "@/components/ui/editor/themes/editor-theme";
import { TooltipProvider } from "@/components/ui/tooltip";

import { nodes } from "./nodes";
import { Plugins } from "./plugins";

const editorConfig: InitialConfigType = {
  namespace: "Editor",
  theme: editorTheme,
  nodes,
  onError: (error: Error) => { },
};

// Type the props properly to avoid Next.js serialization warnings
type EditorProps = {
  editorState?: any;
  editorSerializedState?: SerializedEditorState;
  onChange?: any;
  onSerializedChange?: any;
  className?: string;
};

export function Editor({
  editorState,
  editorSerializedState,
  onChange,
  onSerializedChange,
  className,
}: EditorProps) {
  return (
    <div
      className={`bg-transparent overflow-hidden rounded-lg border shadow ${className || ""}`}
    >
      <LexicalComposer
        key={className}
        initialConfig={{
          ...editorConfig,
          ...(editorState ? { editorState } : {}),
          ...(editorSerializedState
            ? { editorState: JSON.stringify(editorSerializedState) }
            : {}),
        }}
      >
        <TooltipProvider>
          <Plugins className={className} />

          <OnChangePlugin
            ignoreSelectionChange={true}
            onChange={(editorState) => {
              onChange?.(editorState);
              onSerializedChange?.(editorState.toJSON());
            }}
          />
        </TooltipProvider>
      </LexicalComposer>
    </div>
  );
}
