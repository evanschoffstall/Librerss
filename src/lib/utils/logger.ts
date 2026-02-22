/**
 * Structured logging utility
 * Prevents sensitive data leakage and provides better debugging
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  [key: string]: unknown;
  userId?: number;
  email?: string;
  timestamp?: string;
  error?: Error | string;
  stack?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";
  private readonly sensitiveKeyPattern =
    /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|credential|private[-_]?key)/i;

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? JSON.stringify(context, null, 2) : "";

    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr ? `\n${contextStr}` : ""}`;
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
    const sanitized = this.sanitizeContext(context);
    console.log(this.formatMessage("info", message, sanitized));
  }

  warn(message: string, context?: LogContext): void {
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
