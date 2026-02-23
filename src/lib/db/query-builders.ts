type BuildArticleQueryInput = {
  userId: number;
  filters?: {
    unreadOnly?: boolean;
    starredOnly?: boolean;
  };
};

type BuildFeedQueryInput = {
  userId: number;
};

export function buildArticleQuery(input: BuildArticleQueryInput) {
  return {
    scope: "articles",
    userId: input.userId,
    filters: {
      unreadOnly: Boolean(input.filters?.unreadOnly),
      starredOnly: Boolean(input.filters?.starredOnly),
    },
  };
}

export function buildFeedQuery(input: BuildFeedQueryInput) {
  return {
    scope: "feeds",
    userId: input.userId,
  };
}
