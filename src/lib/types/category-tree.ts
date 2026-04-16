/**
 * Canonical dashboard/feed tree node shared across import/export helpers and
 * dashboard state.
 */
export interface CategoryTreeNode {
  children?: CategoryTreeNode[];
  data?: {
    category?: string;
    enabled?: boolean;
    extractionDisabled?: boolean;
    proxyEnabled?: boolean;
    sourceId?: number;
    url: string;
  };
  key: string;
  label: string;
}
