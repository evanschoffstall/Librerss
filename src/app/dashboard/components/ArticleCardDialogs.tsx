import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

interface ArticleCardDialogsProps {
  copyLinkInputRef: React.RefObject<HTMLInputElement | null>;
  isCopyLinkOpen: boolean;
  isDevelopment: boolean;
  isMobile: boolean;
  isRawHtmlOpen: boolean;
  normalizedHtml: string;
  onCopyLinkOpenChange: (open: boolean) => void;
  onRawHtmlOpenChange: (open: boolean) => void;
  onSelectRawHtml: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSelectShareLink: (event: React.MouseEvent<HTMLButtonElement>) => void;
  rawHtmlTextAreaRef: React.RefObject<HTMLTextAreaElement | null>;
  shareUrl: string;
}

export function ArticleCardDialogs({
  copyLinkInputRef,
  isCopyLinkOpen,
  isDevelopment,
  isMobile,
  isRawHtmlOpen,
  normalizedHtml,
  onCopyLinkOpenChange,
  onRawHtmlOpenChange,
  onSelectRawHtml,
  onSelectShareLink,
  rawHtmlTextAreaRef,
  shareUrl,
}: ArticleCardDialogsProps) {
  const copyLinkInputBlock = (
    <div className="rounded-md border bg-muted/30 p-2">
      <Input
        aria-label="Article link"
        className="
          h-8 border-0 bg-transparent px-2 font-mono text-xs shadow-none
        "
        onClick={(event) => {
          event.stopPropagation();
        }}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        readOnly
        ref={copyLinkInputRef}
        value={shareUrl}
      />
    </div>
  );

  const copyLinkSelectAction = (
    <div className="flex justify-end">
      <Button onClick={onSelectShareLink} size="sm" type="button" variant="outline">
        Select
      </Button>
    </div>
  );

  return (
    <>
      {isDevelopment && isRawHtmlOpen ? (
        isMobile ? (
          <Drawer onOpenChange={onRawHtmlOpenChange} open={isRawHtmlOpen}>
            <DrawerContent
              className="max-h-[85dvh]"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DrawerHeader className="space-y-2 text-left">
                <div
                  className="
                    flex w-full items-start justify-between gap-3 text-left
                  "
                >
                  <div className="min-w-0 flex-1 text-left">
                    <DrawerTitle>Raw Article HTML</DrawerTitle>
                    <DrawerDescription>
                      Development-only view of the current article content payload.
                    </DrawerDescription>
                  </div>
                  <Button
                    onClick={onSelectRawHtml}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Select
                  </Button>
                </div>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <div className="rounded-md border bg-muted/40 p-3">
                  <textarea
                    aria-label="Raw article HTML"
                    className="
                      h-[60dvh] min-h-48 w-full resize-none border-0
                      bg-transparent p-0 font-mono text-xs/5 text-foreground/90
                      shadow-none outline-none
                    "
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onFocus={(event) => {
                      event.currentTarget.select();
                    }}
                    readOnly
                    ref={rawHtmlTextAreaRef}
                    value={normalizedHtml}
                  />
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Dialog onOpenChange={onRawHtmlOpenChange} open={isRawHtmlOpen}>
            <DialogContent
              className="max-w-3xl"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DialogHeader className="space-y-2 text-left">
                <div
                  className="
                    flex w-full items-start justify-between gap-3 text-left
                  "
                >
                  <div className="min-w-0 flex-1 text-left">
                    <DialogTitle>Raw Article HTML</DialogTitle>
                    <DialogDescription>
                      Development-only view of the current article content payload.
                    </DialogDescription>
                  </div>
                  <Button
                    onClick={onSelectRawHtml}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Select
                  </Button>
                </div>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 p-3">
                <textarea
                  aria-label="Raw article HTML"
                  className="
                    h-[65vh] min-h-56 w-full resize-none border-0 bg-transparent
                    p-0 font-mono text-xs/5 text-foreground/90 shadow-none
                    outline-none
                  "
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onFocus={(event) => {
                    event.currentTarget.select();
                  }}
                  readOnly
                  ref={rawHtmlTextAreaRef}
                  value={normalizedHtml}
                />
              </div>
            </DialogContent>
          </Dialog>
        )
      ) : null}

      {isCopyLinkOpen ? (
        isMobile ? (
        <Drawer onOpenChange={onCopyLinkOpenChange} open={isCopyLinkOpen}>
          <DrawerContent
            className="max-h-[45dvh]"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <DrawerHeader>
              <DrawerTitle>Copy Link</DrawerTitle>
              <DrawerDescription>
                Link is selected automatically for direct copying.
              </DrawerDescription>
            </DrawerHeader>
            <div className="space-y-3 px-4 pb-6">
              {copyLinkInputBlock}
              {copyLinkSelectAction}
            </div>
          </DrawerContent>
        </Drawer>
        ) : (
        <Dialog onOpenChange={onCopyLinkOpenChange} open={isCopyLinkOpen}>
          <DialogContent
            className="max-w-md"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <DialogHeader>
              <DialogTitle>Copy Link</DialogTitle>
              <DialogDescription>
                Link is selected automatically for direct copying.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {copyLinkInputBlock}
              {copyLinkSelectAction}
            </div>
          </DialogContent>
        </Dialog>
        )
      ) : null}
    </>
  );
}