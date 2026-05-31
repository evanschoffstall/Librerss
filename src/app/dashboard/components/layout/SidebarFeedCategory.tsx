import type { FeedCategoryButtonProps } from "@/app/dashboard/components/feed-category-button";

import { FeedCategoryButton } from "@/app/dashboard/components/feed-category-button";

/**
 * Describes the props for the sidebar feed category component.
 */
type SidebarFeedCategoryProps = Omit<
  FeedCategoryButtonProps,
  "fallbackIconClassName"
>;

/**
 * Render the sidebar feed category component.
 * @param props - The component props.
 * @returns The rendered sidebar feed category component.
 */
export function SidebarFeedCategory(props: SidebarFeedCategoryProps) {
  return <FeedCategoryButton {...props} fallbackIconClassName="size-2" />;
}
