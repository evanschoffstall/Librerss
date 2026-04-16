import { isVerboseLoggingEnabled } from "@/lib/api/http";
import { distillArticle } from "@/lib/distill";
import {
  fetchHtml,
  isExtractCacheEnabled,
  parseAndValidateArticleUrl,
} from "@/lib/extract";
import { logger } from "@/lib/logger";
import { cleanSanitizedHtml, sanitizeRawContent } from "@/lib/sanitize";
import { toErrorMessage } from "@/lib/utils";

import type { ExtractPostDeps } from "./post-contracts";

import { requireMutableAuthenticatedUser } from "./guards";
import {
  resolveRouteHandlerDeps,
  type RouteHandlerContext,
} from "./route-context";

interface ExtractRuntimeDeps {
  cleanContent: typeof cleanSanitizedHtml;
  errorLog: typeof logger.error;
  extractArticle: typeof distillArticle;
  fetchArticleHtml: typeof fetchHtml;
  parseArticleUrl: typeof parseAndValidateArticleUrl;
  requireAuth: typeof requireMutableAuthenticatedUser;
  resolveUserProxy: NonNullable<ExtractPostDeps["resolveUserProxyFn"]>;
  sanitizeContent: typeof sanitizeRawContent;
  shouldUseCache: () => boolean;
  toMessage: typeof toErrorMessage;
  verboseLoggingEnabled: boolean;
  warn: typeof logger.warn;
}

/** Resolves the effective runtime dependencies for article extraction route handling. */
export function createExtractRuntimeDeps(
  depsOrContext: ExtractPostDeps | RouteHandlerContext,
): ExtractRuntimeDeps {
  const deps = resolveRouteHandlerDeps<ExtractPostDeps>(depsOrContext);

  return {
    ...resolveRuntimeParsingDeps(deps),
    ...resolveRuntimeContentDeps(deps),
    ...resolveRuntimeLoggerBindings(deps),
    requireAuth:
      deps.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser,
    resolveUserProxy:
      deps.resolveUserProxyFn ??
      (() =>
        Promise.resolve({
          allowInsecureTls: false,
          proxyUrl: undefined,
        })),
    shouldUseCache: deps.shouldUseExtractCacheFn ?? isExtractCacheEnabled,
    toMessage: deps.toErrorMessageFn ?? toErrorMessage,
    verboseLoggingEnabled: isVerboseLoggingEnabled(),
  };
}

function resolveRuntimeContentDeps(deps: ExtractPostDeps) {
  return {
    cleanContent: deps.cleanSanitizedHtmlFn ?? cleanSanitizedHtml,
    extractArticle: deps.extractFromHtmlFn ?? distillArticle,
    sanitizeContent: deps.sanitizeRawContentFn ?? sanitizeRawContent,
  };
}

function resolveRuntimeLoggerBindings(deps: ExtractPostDeps) {
  return {
    errorLog: deps.errorFn ?? logger.error.bind(logger),
    warn: deps.warnFn ?? logger.warn.bind(logger),
  };
}

function resolveRuntimeParsingDeps(deps: ExtractPostDeps) {
  return {
    fetchArticleHtml: deps.fetchHtmlFn ?? fetchHtml,
    parseArticleUrl:
      deps.parseAndValidateArticleUrlFn ?? parseAndValidateArticleUrl,
  };
}
