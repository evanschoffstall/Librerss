import type { distillArticle } from "@/lib/distill";
import type { fetchHtml, parseAndValidateArticleUrl } from "@/lib/extract";
import type { logger } from "@/lib/logger";
import type { cleanSanitizedHtml, sanitizeRawContent } from "@/lib/sanitize";
import type { toErrorMessage } from "@/lib/utils";

import type { requireMutableAuthenticatedUser } from "./guards";

export interface ExtractPostDeps {
  cleanSanitizedHtmlFn?: typeof cleanSanitizedHtml;
  errorFn?: typeof logger.error;
  extractFromHtmlFn?: typeof distillArticle;
  fetchHtmlFn?: typeof fetchHtml;
  parseAndValidateArticleUrlFn?: typeof parseAndValidateArticleUrl;
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
  resolveUserProxyFn?: (userId: number) => Promise<ExtractResolvedUserProxy>;
  sanitizeRawContentFn?: typeof sanitizeRawContent;
  shouldUseExtractCacheFn?: () => boolean;
  toErrorMessageFn?: typeof toErrorMessage;
  warnFn?: typeof logger.warn;
}

export interface ExtractResolvedUserProxy {
  allowInsecureTls: boolean;
  proxyUrl: string | undefined;
}
