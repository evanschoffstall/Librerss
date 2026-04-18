"use client";

import { Palette } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "theme-notice-dismissed";

/**
 * Render the theme notice dialog component.
 * @returns The rendered theme notice dialog component.
 */
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

    return () => {
      clearTimeout(timer);
    };
  }, []);

  /**
   * Process the handle dismiss.
   */
  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleDismiss();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-3">
          <div className="mx-auto flex items-center justify-center">
            <div className="relative flex size-12 items-center justify-center">
              <div
                aria-hidden="true"
                className="
                  absolute size-18 rounded-full border border-border/15
                "
              />
              <div
                className="
                  relative flex size-12 items-center justify-center rounded-full
                  border border-border/40 bg-card/60 shadow-sm backdrop-blur-sm
                "
              >
                <Palette className="size-5 text-primary" />
              </div>
            </div>
          </div>
          <DialogTitle className="text-center">
            Native Theme Support
          </DialogTitle>
          <DialogDescription className="text-center">
            LibreRSS ships carefully crafted dark and light themes. Disable Dark
            Reader or similar extensions for the best experience.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button
            className="
              w-full
              sm:w-auto
            "
            onClick={handleDismiss}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Process the detect visual adjustment extensions.
 * @returns Whether detect visual adjustment extensions.
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
