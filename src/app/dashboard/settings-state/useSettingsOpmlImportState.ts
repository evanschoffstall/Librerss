"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { type OpmlFeedImportEntry, parseOpmlFeedImport } from "@/lib/utils";

/**
 * Describes the options for use settings opml import state.
 */
interface UseSettingsOpmlImportStateOptions {
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
}

/**
 * Manage the settings opml import state.
 * @param options - The options used to manage the settings opml import state.
 * @returns The settings opml import state state and callbacks.
 */
export function useSettingsOpmlImportState(
  options: UseSettingsOpmlImportStateOptions,
) {
  const { onImportOpml } = options;
  const [isImportingOpml, setIsImportingOpml] = useState(false);
  const opmlInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Process the handle opml file change.
   * @param event - The event.
   */
  const handleOpmlFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setIsImportingOpml(true);
    try {
      const content = await file.text();
      const entries = parseOpmlFeedImport(content);
      if (entries.length === 0) {
        toast.error("No valid feeds found in this OPML file.");
        return;
      }

      await onImportOpml(entries);
    } catch (error) {
      console.error("OPML import parse error:", error);
      toast.error("Unable to import this OPML file.");
    } finally {
      setIsImportingOpml(false);
    }
  };

  return {
    handleOpmlFileChange,
    isImportingOpml,
    opmlInputRef,
  };
}
