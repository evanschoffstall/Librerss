"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Palette } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "theme-notice-dismissed";

/**
 * Detects if Dark Reader or similar visual adjustment extensions are active
 */
function detectVisualAdjustmentExtensions(): boolean {
  // Check for Dark Reader
  if (
    document.documentElement.hasAttribute("data-darkreader-scheme") ||
    document.documentElement.hasAttribute("data-darkreader-mode")
  ) {
    return true;
  }

  // Check for injected Dark Reader styles
  const darkReaderStyles = Array.from(document.styleSheets).some((sheet) => {
    try {
      return (
        sheet.ownerNode instanceof HTMLElement &&
        (sheet.ownerNode.classList.contains("darkreader") ||
          sheet.ownerNode.id.includes("darkreader"))
      );
    } catch {
      return false;
    }
  });

  if (darkReaderStyles) {
    return true;
  }

  // Check for other common extension attributes/classes
  const commonExtensionMarkers = [
    "data-invert",
    "data-night-mode",
    "data-color-scheme-override",
  ];

  return commonExtensionMarkers.some((attr) =>
    document.documentElement.hasAttribute(attr),
  );
}

export function ThemeNoticeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Check if user has already seen the notice
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      return;
    }

    // Small delay to allow extensions to inject their modifications
    const timer = setTimeout(() => {
      const extensionDetected = detectVisualAdjustmentExtensions();
      if (extensionDetected) {
        setOpen(true);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleDismiss();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-3">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-primary/10">
            <Palette className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            Native Theme Support
          </DialogTitle>
          <DialogDescription className="text-center">
            This website leverages carefully crafted beautiful dark and light
            themes. For the best intended experience, please feel free to
            disable any visibility adjustments (such as Dark Reader or similar
            extensions) and utilize our native theme support.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button onClick={handleDismiss} className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
