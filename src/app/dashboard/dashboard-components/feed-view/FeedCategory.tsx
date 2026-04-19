import type { FeedCategoryButtonProps } from "@/app/dashboard/dashboard-components";

import { FeedCategoryButton } from "@/app/dashboard/dashboard-components";

type FeedCategoryProps = Omit<FeedCategoryButtonProps, "fallbackIconClassName">;

/**
 * Render the feed category component.
 * @param props - The component props.
 * @returns The rendered feed category component.
 */
export function FeedCategory(props: FeedCategoryProps) {
  return <FeedCategoryButton {...props} fallbackIconClassName="size-2.5" />;
}
