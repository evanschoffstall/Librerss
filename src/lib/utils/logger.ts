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
  error?: string;
  stack?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

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

    const sanitized = { ...context };

    // Remove sensitive fields in production
    if (!this.isDevelopment) {
      delete sanitized.password;
      delete sanitized.passwordHash;
      delete sanitized.token;
      delete sanitized.sessionToken;

      // Partially redact email
      if (sanitized.email && typeof sanitized.email === "string") {
        const [local, domain] = sanitized.email.split("@");
        sanitized.email = `${local.substring(0, 2)}***@${domain}`;
      }
    }

    // Always add timestamp
    sanitized.timestamp = new Date().toISOString();

    return sanitized;
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

    // Extract error details if error object is provided
    if (context?.error instanceof Error) {
      sanitized.error = context.error.message;
      if (this.isDevelopment) {
        sanitized.stack = context.error.stack;
      }
    }

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
