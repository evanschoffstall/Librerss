import {
  FeedCategoryButton,
  FeedCategoryButtonProps,
} from "@/app/dashboard/dashboard-components";

type FeedCategoryProps = Omit<FeedCategoryButtonProps, "fallbackIconClassName">;

/**
 * @param props
 */
export function FeedCategory(props: FeedCategoryProps) {
  return <FeedCategoryButton {...props} fallbackIconClassName="size-2.5" />;
}
