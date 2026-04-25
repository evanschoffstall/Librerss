/**
 * Apply the feed-surface sizing contract to the host node and its immediate wrappers.
 * @param hostNode - The resolved feed surface host node.
 */
export function applyFeedSurfaceLayoutToHost(hostNode: HTMLDivElement | null) {
  if (!hostNode) {
    return;
  }

  applyFeedSurfaceLayout(hostNode);
  applyFeedSurfaceLayout(hostNode.parentElement);
  applyFeedSurfaceLayout(hostNode.parentElement?.parentElement ?? null);
}

/**
 * Apply the flex-column sizing contract required by the feed surface host chain.
 * @param element - The current host element to normalize, when one exists.
 */
function applyFeedSurfaceLayout(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  element.style.display = "flex";
  element.style.flexDirection = "column";
  element.style.height = "100%";
  element.style.minHeight = "0";
}
