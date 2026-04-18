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

interface RawHtmlHeaderContentProps {
  onSelectRawHtml: ArticleCardDialogsProps["onSelectRawHtml"];
  title: string;
}

/**
 * Render the article card dialogs component.
 * @param props - The component props.
 * @returns The rendered article card dialogs component.
 */
export function ArticleCardDialogs(props: ArticleCardDialogsProps) {
  const {
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
  } = props;
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
 * Render the copy link dialog component.
 * @param props - The component props.
 * @returns The rendered copy link dialog component.
 */
function CopyLinkDialog(
  props: Pick<
    ArticleCardDialogsProps,
    | "copyLinkInputRef"
    | "isCopyLinkOpen"
    | "isMobile"
    | "onCopyLinkOpenChange"
    | "onSelectShareLink"
    | "shareUrl"
  >,
) {
  const {
    copyLinkInputRef,
    isCopyLinkOpen,
    isMobile,
    onCopyLinkOpenChange,
    onSelectShareLink,
    shareUrl,
  } = props;
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
 * Render the copy link input block component.
 * @param props - The component props.
 * @returns The rendered copy link input block component.
 */
function CopyLinkInputBlock(
  props: Pick<ArticleCardDialogsProps, "copyLinkInputRef" | "shareUrl">,
) {
  const { copyLinkInputRef, shareUrl } = props;
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
 * Render the copy link select action component.
 * @param props - The component props.
 * @returns The rendered copy link select action component.
 */
function CopyLinkSelectAction(
  props: Pick<ArticleCardDialogsProps, "onSelectShareLink">,
) {
  const { onSelectShareLink } = props;
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
 * Render the raw html content component.
 * @param props - The component props.
 * @returns The rendered raw html content component.
 */
function RawHtmlContent(
  props: Pick<ArticleCardDialogsProps, "normalizedHtml" | "rawHtmlTextAreaRef">,
) {
  const { normalizedHtml, rawHtmlTextAreaRef } = props;
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
 * Render the raw html dialog component.
 * @param props - The component props.
 * @returns The rendered raw html dialog component.
 */
function RawHtmlDialog(
  props: Pick<
    ArticleCardDialogsProps,
    | "isDevelopment"
    | "isMobile"
    | "isRawHtmlOpen"
    | "normalizedHtml"
    | "onRawHtmlOpenChange"
    | "onSelectRawHtml"
    | "rawHtmlTextAreaRef"
  >,
) {
  const {
    isDevelopment,
    isMobile,
    isRawHtmlOpen,
    normalizedHtml,
    onRawHtmlOpenChange,
    onSelectRawHtml,
    rawHtmlTextAreaRef,
  } = props;
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
 * Render the raw html dialog header component.
 * @param props - The component props.
 * @returns The rendered raw html dialog header component.
 */
function RawHtmlDialogHeader(
  props: Pick<ArticleCardDialogsProps, "onSelectRawHtml">,
) {
  const { onSelectRawHtml } = props;
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
 * Render the raw html drawer header component.
 * @param props - The component props.
 * @returns The rendered raw html drawer header component.
 */
function RawHtmlDrawerHeader(
  props: Pick<ArticleCardDialogsProps, "onSelectRawHtml">,
) {
  const { onSelectRawHtml } = props;
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
 * Render the raw html header content component.
 * @param props - The component props.
 * @returns The rendered raw html header content component.
 */
function RawHtmlHeaderContent(props: RawHtmlHeaderContentProps) {
  const { onSelectRawHtml, title } = props;
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
 * Process the stop dialog propagation.
 * @param event - The event.
 */
function stopDialogPropagation(event: React.MouseEvent<HTMLElement>) {
  event.stopPropagation();
}
