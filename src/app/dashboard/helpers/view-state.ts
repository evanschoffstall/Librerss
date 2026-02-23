export type DashboardView = "article-list" | "settings";

export function createDefaultViewState() {
  return {
    view: "article-list" as DashboardView,
    selectedFeedId: null as number | null,
    selectedArticle: null as number | null,
  };
}

export function isArticleListView(state: { view?: string }) {
  return state.view === "article-list";
}
