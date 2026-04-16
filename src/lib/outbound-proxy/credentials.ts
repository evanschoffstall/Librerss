import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const CIPHER_ALGORITHM = "aes-256-gcm";
const CIPHER_AUTH_TAG_BYTES = 16;
const CIPHER_IV_BYTES = 12;
const CIPHER_VERSION = "enc-v1";
const MIN_SECRET_LENGTH = 32;
const PROXY_PASSWORD_SECRET_ENV_KEY = "PROXY_CREDENTIAL_ENCRYPTION_KEY";

/**
 * Result of resolving a stored proxy password into a plaintext value the
 * runtime can use for outbound proxy authentication.
 */
export interface ResolvedStoredProxyPassword {
  decryptedPassword: null | string;
  needsWriteback: boolean;
  normalizedStoredPassword: null | string;
}

/**
 * Encrypts a proxy password for at-rest storage in the user record.
 *
 * The encryption key is derived from `PROXY_CREDENTIAL_ENCRYPTION_KEY` when it
 * is configured, otherwise from `DATABASE_URL`. That keeps local and hosted
 * deployments working immediately while still allowing operators to provide a
 * dedicated secret for credential storage.
 */
export function encryptStoredProxyPassword(password: string): string {
  const iv = randomBytes(CIPHER_IV_BYTES);
  const cipher = createCipheriv(
    CIPHER_ALGORITHM,
    getProxyPasswordEncryptionKey(),
    iv,
    {
      authTagLength: CIPHER_AUTH_TAG_BYTES,
    },
  );
  const encryptedPassword = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encryptedPassword.toString("base64url"),
  ].join(":");
}

/**
 * Materializes the stored proxy password and optionally persists an encrypted
 * replacement when the existing value is still plaintext.
 */
export async function materializeStoredProxyPassword(
  storedPassword: null | string,
  persistNormalizedPassword?: (
    normalizedStoredPassword: null | string,
  ) => Promise<void>,
): Promise<null | string> {
  const resolvedPassword = resolveStoredProxyPassword(storedPassword);

  if (resolvedPassword.needsWriteback && persistNormalizedPassword) {
    await persistNormalizedPassword(resolvedPassword.normalizedStoredPassword);
  }

  return resolvedPassword.decryptedPassword;
}

/**
 * Normalizes the stored proxy password into a usable plaintext value.
 *
 * Existing plaintext rows are upgraded to encrypted storage on first use by
 * returning `needsWriteback = true` along with the normalized ciphertext.
 */
export function resolveStoredProxyPassword(
  storedPassword: null | string,
): ResolvedStoredProxyPassword {
  if (storedPassword === null) {
    return {
      decryptedPassword: null,
      needsWriteback: false,
      normalizedStoredPassword: null,
    };
  }

  const trimmedPassword = storedPassword.trim();
  if (trimmedPassword === "") {
    return {
      decryptedPassword: null,
      needsWriteback: true,
      normalizedStoredPassword: null,
    };
  }

  if (!trimmedPassword.startsWith(`${CIPHER_VERSION}:`)) {
    return {
      decryptedPassword: trimmedPassword,
      needsWriteback: true,
      normalizedStoredPassword: encryptStoredProxyPassword(trimmedPassword),
    };
  }

  return {
    decryptedPassword: decryptStoredProxyPassword(trimmedPassword),
    needsWriteback: false,
    normalizedStoredPassword: trimmedPassword,
  };
}

/**
 * Decrypts an encrypted proxy password envelope previously produced by
 * {@link encryptStoredProxyPassword}.
 */
function decryptStoredProxyPassword(encryptedPassword: string): string {
  const [version, ivToken, authTagToken, cipherTextToken, ...rest] =
    encryptedPassword.split(":");

  if (
    version !== CIPHER_VERSION ||
    !ivToken ||
    !authTagToken ||
    !cipherTextToken ||
    rest.length > 0
  ) {
    throw new Error("Stored proxy password has an invalid encrypted format.");
  }

  const decipher = createDecipheriv(
    CIPHER_ALGORITHM,
    getProxyPasswordEncryptionKey(),
    Buffer.from(ivToken, "base64url"),
    {
      authTagLength: CIPHER_AUTH_TAG_BYTES,
    },
  );
  decipher.setAuthTag(Buffer.from(authTagToken, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(cipherTextToken, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Resolves the secret used to derive the AES key for proxy password storage.
 */
function getProxyPasswordEncryptionKey(): Buffer {
  const rawConfiguredSecret =
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY?.trim();
  const configuredSecret =
    rawConfiguredSecret === "" ? undefined : rawConfiguredSecret;
  const defaultSecret = process.env.DATABASE_URL?.trim();
  const encryptionSecret = configuredSecret ?? defaultSecret;

  if (!encryptionSecret || encryptionSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${PROXY_PASSWORD_SECRET_ENV_KEY} must be at least ${MIN_SECRET_LENGTH} characters long, or DATABASE_URL must be present for proxy password encryption.`,
    );
  }

  return createHash("sha256").update(encryptionSecret, "utf8").digest();
}
