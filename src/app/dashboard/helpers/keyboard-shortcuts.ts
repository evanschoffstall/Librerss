export function getShortcutLabel(shortcut: string[]): string {
  return shortcut.join("+");
}

export function isShortcutMatch(
  event: KeyboardEvent,
  shortcut: string[],
): boolean {
  const modifiers = new Set(
    shortcut.slice(0, -1).map((key) => key.toLowerCase()),
  );
  const targetKey = shortcut.at(-1)?.toLowerCase();

  return (
    Boolean(targetKey) &&
    event.key.toLowerCase() === targetKey &&
    event.ctrlKey === modifiers.has("ctrl") &&
    event.metaKey === modifiers.has("meta") &&
    event.shiftKey === modifiers.has("shift") &&
    event.altKey === modifiers.has("alt")
  );
}
