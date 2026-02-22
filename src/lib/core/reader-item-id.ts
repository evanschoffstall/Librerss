export const READER_ITEM_ID_PREFIX = "tag:google.com,2005:reader/item/";

export function toReaderItemId(articleId: number): string {
  return `${READER_ITEM_ID_PREFIX}${articleId.toString(16)}`;
}

export function parseReaderItemId(rawId: string): number | null {
  const trimmed = rawId.trim();
  if (!trimmed) {
    return null;
  }

  const lastSegment = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;

  if (/^[0-9a-f]+$/i.test(lastSegment)) {
    const hexValue = Number.parseInt(lastSegment, 16);
    if (Number.isInteger(hexValue) && hexValue > 0) {
      return hexValue;
    }
  }

  const decimalValue = Number.parseInt(lastSegment, 10);
  if (Number.isInteger(decimalValue) && decimalValue > 0) {
    return decimalValue;
  }

  return null;
}
