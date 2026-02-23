export function calculateOffset(page: number, limit: number): number {
  const safePage = Math.max(1, Math.floor(page || 1));
  const safeLimit = Math.max(1, Math.floor(limit || 1));
  return (safePage - 1) * safeLimit;
}

export function validatePage(page: number): number {
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
}

export function validateLimit(limit: number, max = 20): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 20;
  }
  return Math.min(Math.floor(limit), max);
}

export function createPaginationMeta({
  page,
  limit,
  total,
}: {
  page: number;
  limit: number;
  total: number;
}) {
  const safePage = validatePage(page);
  const safeLimit = validateLimit(limit, Number.MAX_SAFE_INTEGER);
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
}
