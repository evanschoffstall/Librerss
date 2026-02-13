"use client"

import { LexicalEditor } from "lexical"
import { createContext, JSX, useContext } from "react"

const Context = createContext<{
  activeEditor: LexicalEditor
  $updateToolbar: () => void
  blockType: string
  setBlockType: (blockType: string) => void
  showModal: (
    title: string,
    showModal: (onClose: () => void) => JSX.Element
  ) => void
}>({
  activeEditor: {} as LexicalEditor,
  $updateToolbar: () => { },
  blockType: "paragraph",
  setBlockType: () => { },
  showModal: () => { },
})

type ToolbarContextProps = {
  activeEditor: any
  $updateToolbar: any
  blockType: string
  setBlockType: any
  showModal: any
  children: React.ReactNode
}

export function ToolbarContext({
  activeEditor,
  $updateToolbar,
  blockType,
  setBlockType,
  showModal,
  children,
}: ToolbarContextProps) {
  return (
    <Context.Provider
      value={{
        activeEditor,
        $updateToolbar,
        blockType,
        setBlockType,
        showModal,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useToolbarContext() {
  return useContext(Context)
}
