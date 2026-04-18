import {
  FeedCategoryButton,
  FeedCategoryButtonProps,
} from "@/app/dashboard/dashboard-components";

type SidebarFeedCategoryProps = Omit<
  FeedCategoryButtonProps,
  "fallbackIconClassName"
>;

/**
 * @param props
 */
export function SidebarFeedCategory(props: SidebarFeedCategoryProps) {
  return <FeedCategoryButton {...props} fallbackIconClassName="size-2" />;
}
