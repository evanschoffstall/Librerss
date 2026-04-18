import { CONFIG, envBooleanOptional, isDevelopment } from "@/lib/config";

interface LogContext {
  [key: string]: unknown;
  email?: string;
  error?: Error | string;
  stack?: string;
  timestamp?: string;
  userId?: number;
}

type LogLevel = "debug" | "error" | "info" | "warn";

export class Logger {
  private readonly dim = "\u001b[2m";
  private readonly levelColors: Record<LogLevel, string> = {
    debug: "\u001b[38;5;141m",
    error: "\u001b[38;5;196m",
    info: "\u001b[38;5;39m",
    warn: "\u001b[38;5;214m",
  };

  private readonly reset = "\u001b[0m";

  private readonly sensitiveKeyPattern =
    /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|credential|private[-_]?key)/i;

  private readonly sensitiveKeys = new Set([
    "proxy-url",
    "proxy_url",
    "proxyaddress",
    "proxyurl",
  ]);

  /**
   * Process the debug.
   * @param message - The message.
   * @param context - The context used to process the debug.
   */
  debug(message: string, context?: LogContext): void {
    if (!isDevelopment() || this.getCurrentLogLevel() !== "verbose") return;
    const sanitized = this.sanitizeContext(context);
    console.info(this.formatMessage("debug", message, sanitized));
  }

  /**
   * Process the error.
   * @param message - The message.
   * @param context - The context used to process the error.
   */
  error(message: string, context?: LogContext): void {
    if (this.getCurrentLogLevel() === "none") return;
    if (!this.shouldEmitToConsole()) return;
    const sanitized = this.sanitizeContext(context);
    console.error(this.formatMessage("error", message, sanitized));
  }

  /**
   * Process the info.
   * @param message - The message.
   * @param context - The context used to process the info.
   */
  info(message: string, context?: LogContext): void {
    const logLevel = this.getCurrentLogLevel();
    if (logLevel === "none" || logLevel === "error" || logLevel === "warn") {
      return;
    }
    if (!this.shouldEmitToConsole()) return;

    const sanitized = this.sanitizeContext(context);
    console.info(this.formatMessage("info", message, sanitized));
  }

  /**
   * Process the warn.
   * @param message - The message.
   * @param context - The context used to process the warn.
   */
  warn(message: string, context?: LogContext): void {
    const logLevel = this.getCurrentLogLevel();
    if (logLevel === "none" || logLevel === "error") return;
    if (!this.shouldEmitToConsole()) return;
    const sanitized = this.sanitizeContext(context);
    console.warn(this.formatMessage("warn", message, sanitized));
  }

  /**
   * Process the format context block.
   * @param contextJson - The context json.
   * @returns The format context block.
   */
  private formatContextBlock(contextJson: string): string {
    const lines = contextJson.split("\n");
    const heading = this.supportsColor()
      ? `${this.dim}└─ context${this.reset}`
      : "└─ context";
    const body = lines
      .map((line) =>
        this.supportsColor()
          ? `${this.dim}   ${line}${this.reset}`
          : `   ${line}`,
      )
      .join("\n");

    return `${heading}\n${body}`;
  }

  /**
   * Process the format message.
   * @param level - The level.
   * @param message - The message.
   * @param context - The context used to process the format message.
   * @returns The format message.
   */
  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = new Date().toISOString();
    const levelLabel = `[${level.toUpperCase()}]`;
    const baseLine = `[${timestamp}] ${levelLabel} ${message}`;
    const contextStr = context
      ? `\n${this.formatContextBlock(JSON.stringify(context, null, 2))}`
      : "";

    if (!this.supportsColor()) {
      return `${baseLine}${contextStr}`;
    }

    const color = this.levelColors[level];
    const coloredLine = `${this.dim}[${timestamp}]${this.reset} ${color}${levelLabel}${this.reset} ${message}`;

    return `${coloredLine}${contextStr}`;
  }

  /**
   * Return the current log level.
   * @returns The current log level.
   */
  private getCurrentLogLevel(): "error" | "info" | "none" | "verbose" | "warn" {
    return CONFIG.LOG_LEVEL;
  }

  /**
   * Return whether is color enabled by env.
   * @returns Whether is color enabled by env.
   */
  private isColorEnabledByEnv(): boolean {
    return envBooleanOptional("LOG_COLORS_ENABLED", true);
  }

  /**
   * Process the redact email.
   * @param email - The email.
   * @returns The redact email.
   */
  private redactEmail(email: string): string {
    const atIdx = email.lastIndexOf("@");
    if (atIdx <= 0) {
      return "***";
    }

    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);
    return `${local.slice(0, 2)}***@${domain}`;
  }

  /**
   * Process the sanitize context.
   * @param context - The context used to process the sanitize context.
   * @returns The sanitize context.
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;

    const sanitized = this.sanitizeValue(context, 0) as LogContext;
    sanitized.timestamp = new Date().toISOString();
    return sanitized;
  }

  /**
   * Process the sanitize error value.
   * @param value - The value.
   * @returns The sanitize error value.
   */
  private sanitizeErrorValue(value: Error): {
    message: string;
    stack?: string;
  } {
    return isDevelopment()
      ? { message: value.message, stack: value.stack }
      : { message: value.message };
  }

  /**
   * Process the sanitize object value.
   * @param value - The value.
   * @param depth - The depth.
   * @returns The sanitize object value.
   */
  private sanitizeObjectValue(
    value: Record<string, unknown>,
    depth: number,
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (
        this.sensitiveKeyPattern.test(key) ||
        this.sensitiveKeys.has(key.toLowerCase())
      ) {
        output[key] = "[redacted]";
        continue;
      }

      if (key.toLowerCase() === "email" && typeof nestedValue === "string") {
        output[key] = this.redactEmail(nestedValue);
        continue;
      }

      output[key] = this.sanitizeValue(nestedValue, depth + 1);
    }

    return output;
  }

  /**
   * Process the sanitize value.
   * @param value - The value.
   * @param depth - The depth.
   * @returns The sanitize value.
   */
  private sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > 6) {
      return "[truncated]";
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return this.sanitizeErrorValue(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeValue(entry, depth + 1));
    }

    if (value && typeof value === "object") {
      return this.sanitizeObjectValue(value as Record<string, unknown>, depth);
    }

    return value;
  }

  /**
   * Return whether should emit to console.
   * @returns Whether should emit to console.
   */
  private shouldEmitToConsole(): boolean {
    if (process.env.NODE_ENV !== "test") {
      return true;
    }

    return process.env.ENABLE_TEST_LOG_OUTPUT === "true";
  }

  /**
   * Process the supports color.
   * @returns Whether supports color.
   */
  private supportsColor(): boolean {
    if (process.env.NODE_ENV === "test") return false;
    if (process.env.NO_COLOR === "1") return false;
    return this.isColorEnabledByEnv();
  }
}

export const logger = new Logger();
