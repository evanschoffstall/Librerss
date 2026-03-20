/**
 * Structured logging utility
 * Prevents sensitive data leakage and provides better debugging
 */

import { CONFIG, isDevelopment } from "@/lib/config";

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

  // Exact-match redaction for proxy keys that may contain credentials in the value
  private readonly sensitiveKeys = new Set([
    "proxy-url",
    "proxy_url",
    "proxyaddress",
    "proxyurl",
  ]);

  debug(message: string, context?: LogContext): void {
    if (!isDevelopment() || this.getCurrentLogLevel() !== "verbose") return;
    const sanitized = this.sanitizeContext(context);
    console.debug(this.formatMessage("debug", message, sanitized));
  }

  error(message: string, context?: LogContext): void {
    if (this.getCurrentLogLevel() === "none") return;
    const sanitized = this.sanitizeContext(context);
    console.error(this.formatMessage("error", message, sanitized));
  }

  // Level hierarchy: none < error < warn < info < verbose
  info(message: string, context?: LogContext): void {
    const logLevel = this.getCurrentLogLevel();
    if (logLevel === "none" || logLevel === "error" || logLevel === "warn")
      return;
    const sanitized = this.sanitizeContext(context);
    console.log(this.formatMessage("info", message, sanitized));
  }

  warn(message: string, context?: LogContext): void {
    const logLevel = this.getCurrentLogLevel();
    if (logLevel === "none" || logLevel === "error") return;
    const sanitized = this.sanitizeContext(context);
    console.warn(this.formatMessage("warn", message, sanitized));
  }

  private formatContextBlock(contextJson: string): string {
    const lines = contextJson.split("\n");
    const heading = this.supportsColor()
      ? `${this.dim}└─ context${this.reset}`
      : "└─ context";
    const body = lines
      .map((line) => {
        if (this.supportsColor()) {
          return `${this.dim}   ${line}${this.reset}`;
        }
        return `   ${line}`;
      })
      .join("\n");

    return `${heading}\n${body}`;
  }

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

  private getCurrentLogLevel(): "error" | "info" | "none" | "verbose" | "warn" {
    const level = process.env.LOG_LEVEL?.toLowerCase();
    if (
      level === "none" ||
      level === "error" ||
      level === "warn" ||
      level === "info" ||
      level === "verbose"
    ) {
      return level;
    }

    return CONFIG.LOG_LEVEL;
  }

  private isColorEnabledByEnv(): boolean {
    const value = process.env.LOG_COLORS_ENABLED?.trim().toLowerCase();
    if (!value) return true;

    if (["0", "false", "no", "off"].includes(value)) {
      return false;
    }

    return true;
  }

  private redactEmail(email: string): string {
    const atIdx = email.lastIndexOf("@");
    if (atIdx <= 0) {
      return "***";
    }

    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);
    return `${local.slice(0, 2)}***@${domain}`;
  }

  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;

    const sanitized = this.sanitizeValue(context, 0) as LogContext;

    // Always add timestamp
    sanitized.timestamp = new Date().toISOString();

    return sanitized;
  }

  private sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > 6) {
      return "[truncated]";
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return isDevelopment()
        ? { message: value.message, stack: value.stack }
        : { message: value.message };
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeValue(entry, depth + 1));
    }

    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
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

    return value;
  }

  private supportsColor(): boolean {
    if (process.env.NODE_ENV === "test") return false;
    if (process.env.NO_COLOR === "1") return false;
    return this.isColorEnabledByEnv();
  }
}

// Export singleton instance
export const logger = new Logger();
