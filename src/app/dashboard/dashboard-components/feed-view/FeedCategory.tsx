import {
  FeedCategoryButton,
  FeedCategoryButtonProps,
} from "@/app/dashboard/dashboard-components";

type FeedCategoryProps = Omit<FeedCategoryButtonProps, "fallbackIconClassName">;

export function FeedCategory(props: FeedCategoryProps) {
  return <FeedCategoryButton {...props} fallbackIconClassName="size-2.5" />;
}
