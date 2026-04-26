/**
 * Describes the email password credentials.
 */
interface EmailPasswordCredentials {
  email: string;
  password: string;
}

/**
 * Describes the options for email password field.
 */
interface EmailPasswordFieldOptions {
  emailKeys?: readonly string[];
  passwordKeys?: readonly string[];
}

const DEFAULT_EMAIL_KEYS = ["email", "Email", "username"] as const;
const DEFAULT_PASSWORD_KEYS = ["password", "Passwd", "passwd"] as const;

/**
 * Defines the data source type.
 */
type DataSource =
  | { data: FormData; type: "form" }
  | { data: Record<string, unknown>; type: "object" }
  | { data: URLSearchParams; type: "params" };

/**
 * Normalize the email input.
 * @param value - The value.
 * @returns The email input.
 */
export function normalizeEmailInput(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Parse the email password from form data.
 * @param formData - The form data.
 * @param options - The options used to parse the email password from form data.
 * @returns The email password from form data.
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
 * Parse the email password from record.
 * @param payload - The payload.
 * @param options - The options used to parse the email password from record.
 * @returns The email password from record.
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
 * Parse the email password from search params.
 * @param searchParams - The search params.
 * @param options - The options used to parse the email password from search params.
 * @returns The email password from search params.
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
 * Process the finalize credentials.
 * @param email - The email.
 * @param password - The password.
 * @returns The finalize credentials.
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
 * Process the first value.
 * @param source - The source.
 * @param keys - The keys.
 * @returns The first value.
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
 * Process the first value from form data.
 * @param formData - The form data.
 * @param keys - The keys.
 * @returns The first value from form data.
 */
function firstValueFromFormData(
  formData: FormData,
  keys: readonly string[],
): string {
  return firstValue({ data: formData, type: "form" }, keys);
}

/**
 * Process the first value from object.
 * @param payload - The payload.
 * @param keys - The keys.
 * @returns The first value from object.
 */
function firstValueFromObject(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string {
  return firstValue({ data: payload, type: "object" }, keys);
}

/**
 * Process the first value from search params.
 * @param searchParams - The search params.
 * @param keys - The keys.
 * @returns The first value from search params.
 */
function firstValueFromSearchParams(
  searchParams: URLSearchParams,
  keys: readonly string[],
): string {
  return firstValue({ data: searchParams, type: "params" }, keys);
}

/**
 * Resolve the keys.
 * @param options - The options used to resolve the keys.
 * @returns The keys.
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
