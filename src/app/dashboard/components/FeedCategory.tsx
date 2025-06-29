import { type CategoryTreeNode } from "@/src/lib";

interface FeedCategoryProps {
  category: CategoryTreeNode;
  isActive: boolean;
  onClick: () => void;
}

export const FeedCategory = ({ category, isActive, onClick }: FeedCategoryProps) => (
  <div
    onClick={onClick}
    className={`feed-category group ${isActive ? 'feed-category-active' : 'feed-category-hover'}`}
  >
    <div className="flex items-center space-x-3">
      <div className={`feed-category-indicator ${isActive
        ? 'feed-category-indicator-active'
        : 'feed-category-indicator-inactive group-hover:bg-white'
        }`} />
      <span className={`feed-category-label ${isActive
        ? 'feed-category-label-active'
        : 'feed-category-label-inactive group-hover:text-blue-200'
        }`}>
        {category.label}
      </span>
    </div>
  </div>
);
