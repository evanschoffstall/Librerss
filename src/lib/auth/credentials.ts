interface EmailPasswordCredentials {
  email: string;
  password: string;
}

interface EmailPasswordFieldOptions {
  emailKeys?: readonly string[];
  passwordKeys?: readonly string[];
}

const DEFAULT_EMAIL_KEYS = ["email", "Email", "username"] as const;
const DEFAULT_PASSWORD_KEYS = ["password", "Passwd", "passwd"] as const;

type DataSource =
  | { data: FormData; type: "form" }
  | { data: Record<string, unknown>; type: "object" }
  | { data: URLSearchParams; type: "params" };

/**
 * @param value
 */
export function normalizeEmailInput(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * @param formData
 * @param options
 */
export function parseEmailPasswordFromFormData(
  formData: FormData,
  options?: EmailPasswordFieldOptions,
): EmailPasswordCredentials | null {
  const { emailKeys, passwordKeys } = resolveKeys(options);
  const email = firstValueFromFormData(formData, emailKeys);
  const password = firstValueFromFormData(formData, passwordKeys);

  return finalizeCredentials(email, password);
}

/**
 * @param payload
 * @param options
 */
export function parseEmailPasswordFromRecord(
  payload: Record<string, unknown>,
  options?: EmailPasswordFieldOptions,
): EmailPasswordCredentials | null {
  const { emailKeys, passwordKeys } = resolveKeys(options);
  const email = firstValueFromObject(payload, emailKeys);
  const password = firstValueFromObject(payload, passwordKeys);

  return finalizeCredentials(email, password);
}

/**
 * @param searchParams
 * @param options
 */
export function parseEmailPasswordFromSearchParams(
  searchParams: URLSearchParams,
  options?: EmailPasswordFieldOptions,
): EmailPasswordCredentials | null {
  const { emailKeys, passwordKeys } = resolveKeys(options);
  const email = firstValueFromSearchParams(searchParams, emailKeys);
  const password = firstValueFromSearchParams(searchParams, passwordKeys);

  return finalizeCredentials(email, password);
}

/**
 * @param email
 * @param password
 */
function finalizeCredentials(
  email: string,
  password: string,
): EmailPasswordCredentials | null {
  const normalizedEmail = normalizeEmailInput(email);
  if (!normalizedEmail || !password) {
    return null;
  }

  return {
    email: normalizedEmail,
    password,
  };
}

/**
 * @param source
 * @param keys
 */
function firstValue(source: DataSource, keys: readonly string[]): string {
  for (const key of keys) {
    let value: unknown;

    if (source.type === "object") {
      value = source.data[key];
    } else {
      value = source.data.get(key);
    }

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

/**
 * @param formData
 * @param keys
 */
function firstValueFromFormData(
  formData: FormData,
  keys: readonly string[],
): string {
  return firstValue({ data: formData, type: "form" }, keys);
}

/**
 * @param payload
 * @param keys
 */
function firstValueFromObject(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string {
  return firstValue({ data: payload, type: "object" }, keys);
}

/**
 * @param searchParams
 * @param keys
 */
function firstValueFromSearchParams(
  searchParams: URLSearchParams,
  keys: readonly string[],
): string {
  return firstValue({ data: searchParams, type: "params" }, keys);
}

/**
 * @param options
 */
function resolveKeys(options?: EmailPasswordFieldOptions): {
  emailKeys: readonly string[];
  passwordKeys: readonly string[];
} {
  return {
    emailKeys: options?.emailKeys ?? DEFAULT_EMAIL_KEYS,
    passwordKeys: options?.passwordKeys ?? DEFAULT_PASSWORD_KEYS,
  };
}
