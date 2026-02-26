/**
 * Structured logging utility
 * Prevents sensitive data leakage and provides better debugging
 */

import { CONFIG } from "../config";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  [key: string]: unknown;
  userId?: number;
  email?: string;
  timestamp?: string;
  error?: Error | string;
  stack?: string;
}

export class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";
  private readonly sensitiveKeyPattern =
    /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|credential|private[-_]?key)/i;

  private readonly reset = "\u001b[0m";

  private readonly levelIcons: Record<LogLevel, string> = {
    info: "ℹ",
    warn: "⚠",
    error: "✖",
    debug: "◆",
  };

  private readonly levelColors: Record<LogLevel, string> = {
    info: "\u001b[38;5;39m",
    warn: "\u001b[38;5;214m",
    error: "\u001b[38;5;196m",
    debug: "\u001b[38;5;141m",
  };

  private readonly dim = "\u001b[2m";

  private isColorEnabledByEnv(): boolean {
    const value = process.env.LOG_COLORS_ENABLED?.trim().toLowerCase();
    if (!value) return true;

    if (["0", "false", "no", "off"].includes(value)) {
      return false;
    }

    return true;
  }

  private supportsColor(): boolean {
    if (process.env.NODE_ENV === "test") return false;
    if (process.env.NO_COLOR === "1") return false;
    return this.isColorEnabledByEnv();
  }

  private getCurrentLogLevel(): "none" | "error" | "warn" | "info" | "verbose" {
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

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = new Date().toISOString();
    const levelLabel = `[${level.toUpperCase()}]`;
    const icon = this.levelIcons[level];
    const baseLine = `[${timestamp}] ${levelLabel} ${message} ${icon}`;

    const contextStr = context
      ? `\n${this.formatContextBlock(JSON.stringify(context, null, 2))}`
      : "";

    if (!this.supportsColor()) {
      return `${baseLine}${contextStr}`;
    }

    const color = this.levelColors[level];
    const coloredLine = `${this.dim}[${timestamp}]${this.reset} ${color}${levelLabel}${this.reset} ${message} ${icon}`;

    return `${coloredLine}${contextStr}`;
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
      return this.isDevelopment
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
        if (this.sensitiveKeyPattern.test(key)) {
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

  private redactEmail(email: string): string {
    const atIdx = email.lastIndexOf("@");
    if (atIdx <= 0) {
      return "***";
    }

    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);
    return `${local.slice(0, 2)}***@${domain}`;
  }

  info(message: string, context?: LogContext): void {
    const logLevel = this.getCurrentLogLevel();
    if (logLevel === "none" || logLevel === "error") return;
    const sanitized = this.sanitizeContext(context);
    console.log(this.formatMessage("info", message, sanitized));
  }

  warn(message: string, context?: LogContext): void {
    const logLevel = this.getCurrentLogLevel();
    if (logLevel === "none" || logLevel === "error") return;
    const sanitized = this.sanitizeContext(context);
    console.warn(this.formatMessage("warn", message, sanitized));
  }

  error(message: string, context?: LogContext): void {
    const sanitized = this.sanitizeContext(context);

    console.error(this.formatMessage("error", message, sanitized));
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const sanitized = this.sanitizeContext(context);
      console.debug(this.formatMessage("debug", message, sanitized));
    }
  }
}

// Export singleton instance
export const logger = new Logger();
