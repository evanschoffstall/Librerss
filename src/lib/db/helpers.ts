const PASSWORD_PATTERN = /(password\s*=\s*)([^\s]+)/gi;

export function sanitizeDbError(error: Error): Error {
  const sanitizedMessage = error.message.replace(
    PASSWORD_PATTERN,
    "$1[REDACTED]",
  );
  return new Error(sanitizedMessage);
}

function hasDbErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === code;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return hasDbErrorCode(error, "23505");
}

export function isForeignKeyError(error: unknown): boolean {
  return hasDbErrorCode(error, "23503");
}
