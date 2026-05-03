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
 * Describes a decrypted proxy password and whether it used the primary key.
 */
interface DecryptedStoredProxyPassword {
  password: string;
  usedPrimaryKey: boolean;
}

/**
 * Describes a candidate secret that can decrypt stored proxy passwords.
 */
interface ProxyPasswordSecretCandidate {
  key: Buffer;
  source: "configured" | "database-url";
}

/**
 * Process the encrypt stored proxy password.
 * @param password - The password.
 * @returns The encrypt stored proxy password.
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
 * Process the materialize stored proxy password.
 * @param storedPassword - The stored password.
 * @param persistNormalizedPassword - The callback that persist normalized password.
 * @returns The materialize stored proxy password.
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
 * Resolve the stored proxy password.
 * @param storedPassword - The stored password.
 * @returns The stored proxy password.
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

  const decryptedPassword = decryptStoredProxyPassword(trimmedPassword);

  return {
    decryptedPassword: decryptedPassword.password,
    needsWriteback: !decryptedPassword.usedPrimaryKey,
    normalizedStoredPassword: decryptedPassword.usedPrimaryKey
      ? trimmedPassword
      : encryptStoredProxyPassword(decryptedPassword.password),
  };
}

/**
 * Process the decrypt stored proxy password.
 * @param encryptedPassword - The encrypted password.
 * @returns The decrypt stored proxy password.
 */
function decryptStoredProxyPassword(
  encryptedPassword: string,
): DecryptedStoredProxyPassword {
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

  const iv = Buffer.from(ivToken, "base64url");
  const authTag = Buffer.from(authTagToken, "base64url");
  const cipherText = Buffer.from(cipherTextToken, "base64url");
  const candidateKeys = getProxyPasswordDecryptionKeys();

  for (const [index, candidateKey] of candidateKeys.entries()) {
    try {
      const decipher = createDecipheriv(
        CIPHER_ALGORITHM,
        candidateKey.key,
        iv,
        {
          authTagLength: CIPHER_AUTH_TAG_BYTES,
        },
      );
      decipher.setAuthTag(authTag);

      return {
        password: Buffer.concat([
          decipher.update(cipherText),
          decipher.final(),
        ]).toString("utf8"),
        usedPrimaryKey: index === 0,
      };
    } catch (error) {
      if (index === candidateKeys.length - 1) {
        throw error;
      }
    }
  }

  throw new Error("Stored proxy password could not be decrypted.");
}

/**
 * Return the proxy password decryption keys.
 * @returns Candidate keys in primary-to-legacy order.
 */
function getProxyPasswordDecryptionKeys(): readonly ProxyPasswordSecretCandidate[] {
  return getProxyPasswordSecretCandidates();
}

/**
 * Return the proxy password encryption key.
 * @returns The proxy password encryption key.
 */
function getProxyPasswordEncryptionKey(): Buffer {
  return getProxyPasswordSecretCandidates()[0].key;
}

/**
 * Return configured and legacy proxy password secrets.
 * @returns Candidate secrets in primary-to-legacy order.
 */
function getProxyPasswordSecretCandidates(): readonly ProxyPasswordSecretCandidate[] {
  const rawConfiguredSecret =
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY?.trim();
  const configuredSecret =
    rawConfiguredSecret === "" ? undefined : rawConfiguredSecret;
  const defaultSecret = process.env.DATABASE_URL?.trim();
  const candidateSecrets = [
    configuredSecret && {
      source: "configured" as const,
      value: configuredSecret,
    },
    defaultSecret && {
      source: "database-url" as const,
      value: defaultSecret,
    },
  ].filter(
    (
      candidate,
    ): candidate is {
      source: ProxyPasswordSecretCandidate["source"];
      value: string;
    } => Boolean(candidate),
  );
  const uniqueCandidateSecrets = candidateSecrets.filter(
    (candidate, index, candidates) =>
      candidates.findIndex((other) => other.value === candidate.value) ===
      index,
  );

  const validCandidateSecrets = uniqueCandidateSecrets.filter(
    (candidate) => candidate.value.length >= MIN_SECRET_LENGTH,
  );

  if (validCandidateSecrets.length === 0) {
    throw new Error(
      `${PROXY_PASSWORD_SECRET_ENV_KEY} must be at least ${MIN_SECRET_LENGTH} characters long, or DATABASE_URL must be present for proxy password encryption.`,
    );
  }

  return validCandidateSecrets.map((candidate) => ({
    key: createHash("sha256").update(candidate.value, "utf8").digest(),
    source: candidate.source,
  }));
}
