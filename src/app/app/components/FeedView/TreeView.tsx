import type { CategoryTreeNode } from "@/src/types";
import { Tree } from "primereact/tree";
import React from "react";

interface CategoryTreeProps {
  categories: CategoryTreeNode[];
  expandedKeys: Record<string, boolean>;
}

const CategoryTree: React.FC<CategoryTreeProps> = ({
  categories,
  expandedKeys
}) => {
  return (
    <Tree
      value={categories}
      expandedKeys={expandedKeys}
      className="mb-4 flex-grow"
    />
  );
};

export default CategoryTree;
