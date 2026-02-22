export const GOOGLE_LOGIN_PREFIX = "googlelogin auth=";
export const MAX_STREAM_ITEMS = 250;
export const DEFAULT_STREAM_ITEMS = 50;
export const NETNEWSWIRE_MAX_STREAM_ITEMS = 250;

export type TagMutation = {
  target: "a" | "r";
  tag: string;
  patch: {
    isRead?: boolean;
    isStarred?: boolean;
  };
};

export const TAG_MUTATIONS: TagMutation[] = [
  {
    target: "a",
    tag: "user/-/state/com.google/read",
    patch: { isRead: true },
  },
  {
    target: "r",
    tag: "user/-/state/com.google/read",
    patch: { isRead: false },
  },
  {
    target: "a",
    tag: "user/-/state/com.google/starred",
    patch: { isStarred: true },
  },
  {
    target: "r",
    tag: "user/-/state/com.google/starred",
    patch: { isStarred: false },
  },
];
