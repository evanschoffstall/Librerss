export function calculateNextPage(page: number): number {
  return page + 1;
}

export function hasMorePages(
  totalItems: number,
  loadedItems: number,
  _currentPage: number,
): boolean {
  return loadedItems < totalItems;
}
