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

/**
 * @param root0
 * @param root0.copyLinkInputRef
 * @param root0.isCopyLinkOpen
 * @param root0.isDevelopment
 * @param root0.isMobile
 * @param root0.isRawHtmlOpen
 * @param root0.normalizedHtml
 * @param root0.onCopyLinkOpenChange
 * @param root0.onRawHtmlOpenChange
 * @param root0.onSelectRawHtml
 * @param root0.onSelectShareLink
 * @param root0.rawHtmlTextAreaRef
 * @param root0.shareUrl
 */
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
  return (
    <>
      <RawHtmlDialog
        isDevelopment={isDevelopment}
        isMobile={isMobile}
        isRawHtmlOpen={isRawHtmlOpen}
        normalizedHtml={normalizedHtml}
        onRawHtmlOpenChange={onRawHtmlOpenChange}
        onSelectRawHtml={onSelectRawHtml}
        rawHtmlTextAreaRef={rawHtmlTextAreaRef}
      />
      <CopyLinkDialog
        copyLinkInputRef={copyLinkInputRef}
        isCopyLinkOpen={isCopyLinkOpen}
        isMobile={isMobile}
        onCopyLinkOpenChange={onCopyLinkOpenChange}
        onSelectShareLink={onSelectShareLink}
        shareUrl={shareUrl}
      />
    </>
  );
}

/**
 * @param root0
 * @param root0.copyLinkInputRef
 * @param root0.isCopyLinkOpen
 * @param root0.isMobile
 * @param root0.onCopyLinkOpenChange
 * @param root0.onSelectShareLink
 * @param root0.shareUrl
 */
function CopyLinkDialog({
  copyLinkInputRef,
  isCopyLinkOpen,
  isMobile,
  onCopyLinkOpenChange,
  onSelectShareLink,
  shareUrl,
}: Pick<
  ArticleCardDialogsProps,
  | "copyLinkInputRef"
  | "isCopyLinkOpen"
  | "isMobile"
  | "onCopyLinkOpenChange"
  | "onSelectShareLink"
  | "shareUrl"
>) {
  if (!isCopyLinkOpen) {
    return null;
  }

  const dialogBody = (
    <>
      <CopyLinkInputBlock
        copyLinkInputRef={copyLinkInputRef}
        shareUrl={shareUrl}
      />
      <CopyLinkSelectAction onSelectShareLink={onSelectShareLink} />
    </>
  );

  return isMobile ? (
    <Drawer onOpenChange={onCopyLinkOpenChange} open={isCopyLinkOpen}>
      <DrawerContent className="max-h-[45dvh]" onClick={stopDialogPropagation}>
        <DrawerHeader>
          <DrawerTitle>Copy Link</DrawerTitle>
          <DrawerDescription>
            Link is selected automatically for direct copying.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 px-4 pb-6">{dialogBody}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog onOpenChange={onCopyLinkOpenChange} open={isCopyLinkOpen}>
      <DialogContent className="max-w-md" onClick={stopDialogPropagation}>
        <DialogHeader>
          <DialogTitle>Copy Link</DialogTitle>
          <DialogDescription>
            Link is selected automatically for direct copying.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">{dialogBody}</div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param root0
 * @param root0.copyLinkInputRef
 * @param root0.shareUrl
 */
function CopyLinkInputBlock({
  copyLinkInputRef,
  shareUrl,
}: Pick<ArticleCardDialogsProps, "copyLinkInputRef" | "shareUrl">) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <Input
        aria-label="Article link"
        className="
          h-8 border-0 bg-transparent px-2 font-mono text-xs shadow-none
        "
        onClick={stopDialogPropagation}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        readOnly
        ref={copyLinkInputRef}
        value={shareUrl}
      />
    </div>
  );
}

/**
 * @param root0
 * @param root0.onSelectShareLink
 */
function CopyLinkSelectAction({
  onSelectShareLink,
}: Pick<ArticleCardDialogsProps, "onSelectShareLink">) {
  return (
    <div className="flex justify-end">
      <Button
        onClick={onSelectShareLink}
        size="sm"
        type="button"
        variant="outline"
      >
        Select
      </Button>
    </div>
  );
}

/**
 * @param root0
 * @param root0.normalizedHtml
 * @param root0.rawHtmlTextAreaRef
 */
function RawHtmlContent({
  normalizedHtml,
  rawHtmlTextAreaRef,
}: Pick<ArticleCardDialogsProps, "normalizedHtml" | "rawHtmlTextAreaRef">) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <textarea
        aria-label="Raw article HTML"
        className="
          h-[65vh] min-h-56 w-full resize-none border-0 bg-transparent p-0
          font-mono text-xs/5 text-foreground/90 shadow-none outline-none
        "
        onClick={stopDialogPropagation}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        readOnly
        ref={rawHtmlTextAreaRef}
        value={normalizedHtml}
      />
    </div>
  );
}

/**
 * @param root0
 * @param root0.isDevelopment
 * @param root0.isMobile
 * @param root0.isRawHtmlOpen
 * @param root0.normalizedHtml
 * @param root0.onRawHtmlOpenChange
 * @param root0.onSelectRawHtml
 * @param root0.rawHtmlTextAreaRef
 */
function RawHtmlDialog({
  isDevelopment,
  isMobile,
  isRawHtmlOpen,
  normalizedHtml,
  onRawHtmlOpenChange,
  onSelectRawHtml,
  rawHtmlTextAreaRef,
}: Pick<
  ArticleCardDialogsProps,
  | "isDevelopment"
  | "isMobile"
  | "isRawHtmlOpen"
  | "normalizedHtml"
  | "onRawHtmlOpenChange"
  | "onSelectRawHtml"
  | "rawHtmlTextAreaRef"
>) {
  if (!isDevelopment || !isRawHtmlOpen) {
    return null;
  }

  const rawHtmlBody = (
    <RawHtmlContent
      normalizedHtml={normalizedHtml}
      rawHtmlTextAreaRef={rawHtmlTextAreaRef}
    />
  );

  return isMobile ? (
    <Drawer onOpenChange={onRawHtmlOpenChange} open={isRawHtmlOpen}>
      <DrawerContent className="max-h-[85dvh]" onClick={stopDialogPropagation}>
        <RawHtmlDrawerHeader onSelectRawHtml={onSelectRawHtml} />
        <div className="px-4 pb-6">{rawHtmlBody}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog onOpenChange={onRawHtmlOpenChange} open={isRawHtmlOpen}>
      <DialogContent className="max-w-3xl" onClick={stopDialogPropagation}>
        <RawHtmlDialogHeader onSelectRawHtml={onSelectRawHtml} />
        {rawHtmlBody}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param root0
 * @param root0.onSelectRawHtml
 */
function RawHtmlDialogHeader({
  onSelectRawHtml,
}: Pick<ArticleCardDialogsProps, "onSelectRawHtml">) {
  return (
    <DialogHeader className="space-y-2 text-left">
      <RawHtmlHeaderContent
        onSelectRawHtml={onSelectRawHtml}
        title="Raw Article HTML"
      />
    </DialogHeader>
  );
}

/**
 * @param root0
 * @param root0.onSelectRawHtml
 */
function RawHtmlDrawerHeader({
  onSelectRawHtml,
}: Pick<ArticleCardDialogsProps, "onSelectRawHtml">) {
  return (
    <DrawerHeader className="space-y-2 text-left">
      <RawHtmlHeaderContent
        onSelectRawHtml={onSelectRawHtml}
        title="Raw Article HTML"
      />
    </DrawerHeader>
  );
}

/**
 * @param root0
 * @param root0.onSelectRawHtml
 * @param root0.title
 */
function RawHtmlHeaderContent({
  onSelectRawHtml,
  title,
}: {
  onSelectRawHtml: ArticleCardDialogsProps["onSelectRawHtml"];
  title: string;
}) {
  return (
    <div className="flex w-full flex-col gap-3 pr-12 text-left">
      <div className="min-w-0 text-left">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Development-only view of the current article content payload.
        </DialogDescription>
      </div>
      <Button
        className="self-start"
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
  );
}

/**
 * @param event
 */
function stopDialogPropagation(event: React.MouseEvent<HTMLElement>) {
  event.stopPropagation();
}
