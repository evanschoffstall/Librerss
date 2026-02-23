type EmailPasswordCredentials = {
  email: string;
  password: string;
};

type EmailPasswordFieldOptions = {
  emailKeys?: readonly string[];
  passwordKeys?: readonly string[];
};

const DEFAULT_EMAIL_KEYS = ["email", "Email", "username"] as const;
const DEFAULT_PASSWORD_KEYS = ["password", "Passwd", "passwd"] as const;

export function normalizeEmailInput(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveKeys(options?: EmailPasswordFieldOptions): {
  emailKeys: readonly string[];
  passwordKeys: readonly string[];
} {
  return {
    emailKeys: options?.emailKeys ?? DEFAULT_EMAIL_KEYS,
    passwordKeys: options?.passwordKeys ?? DEFAULT_PASSWORD_KEYS,
  };
}

type DataSource =
  | { type: "object"; data: Record<string, unknown> }
  | { type: "params"; data: URLSearchParams }
  | { type: "form"; data: FormData };

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

function firstValueFromObject(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string {
  return firstValue({ type: "object", data: payload }, keys);
}

function firstValueFromSearchParams(
  searchParams: URLSearchParams,
  keys: readonly string[],
): string {
  return firstValue({ type: "params", data: searchParams }, keys);
}

function firstValueFromFormData(
  formData: FormData,
  keys: readonly string[],
): string {
  return firstValue({ type: "form", data: formData }, keys);
}

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

export function parseEmailPasswordFromRecord(
  payload: Record<string, unknown>,
  options?: EmailPasswordFieldOptions,
): EmailPasswordCredentials | null {
  const { emailKeys, passwordKeys } = resolveKeys(options);
  const email = firstValueFromObject(payload, emailKeys);
  const password = firstValueFromObject(payload, passwordKeys);

  return finalizeCredentials(email, password);
}

export function parseEmailPasswordFromSearchParams(
  searchParams: URLSearchParams,
  options?: EmailPasswordFieldOptions,
): EmailPasswordCredentials | null {
  const { emailKeys, passwordKeys } = resolveKeys(options);
  const email = firstValueFromSearchParams(searchParams, emailKeys);
  const password = firstValueFromSearchParams(searchParams, passwordKeys);

  return finalizeCredentials(email, password);
}

export function parseEmailPasswordFromFormData(
  formData: FormData,
  options?: EmailPasswordFieldOptions,
): EmailPasswordCredentials | null {
  const { emailKeys, passwordKeys } = resolveKeys(options);
  const email = firstValueFromFormData(formData, emailKeys);
  const password = firstValueFromFormData(formData, passwordKeys);

  return finalizeCredentials(email, password);
}
