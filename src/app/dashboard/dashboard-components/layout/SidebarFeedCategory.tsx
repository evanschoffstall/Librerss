import type { FeedCategoryButtonProps } from "@/app/dashboard/dashboard-components";

import { FeedCategoryButton } from "@/app/dashboard/dashboard-components";

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
