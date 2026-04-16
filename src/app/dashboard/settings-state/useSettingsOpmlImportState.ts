"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { type OpmlFeedImportEntry, parseOpmlFeedImport } from "@/lib/utils";

interface UseSettingsOpmlImportStateOptions {
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
}

/** Owns OPML file parsing and import lifecycle state for the settings surface. */
export function useSettingsOpmlImportState({
  onImportOpml,
}: UseSettingsOpmlImportStateOptions) {
  const [isImportingOpml, setIsImportingOpml] = useState(false);
  const opmlInputRef = useRef<HTMLInputElement | null>(null);

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
