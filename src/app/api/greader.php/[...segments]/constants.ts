import { CONFIG } from "@/lib/config";

export const GOOGLE_LOGIN_PREFIX = "googlelogin auth=";
export const MAX_STREAM_ITEMS = CONFIG.GREADER_MAX_STREAM_ITEMS;
export const DEFAULT_STREAM_ITEMS = CONFIG.GREADER_DEFAULT_STREAM_ITEMS;
export const NETNEWSWIRE_MAX_STREAM_ITEMS =
  CONFIG.GREADER_NETNEWSWIRE_MAX_ITEMS;

import {
  FEED_STREAM_PREFIX,
  READING_LIST_STREAM,
  READ_STATE,
  STARRED_STATE,
  USER_LABEL_PREFIX,
  parseUserLabel,
} from "@/lib/core/stream-ids";
export {
  FEED_STREAM_PREFIX,
  READING_LIST_STREAM,
  READ_STATE,
  STARRED_STATE,
  USER_LABEL_PREFIX,
  parseUserLabel,
};

type TagMutation = {
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
    tag: READ_STATE,
    patch: { isRead: true },
  },
  {
    target: "r",
    tag: READ_STATE,
    patch: { isRead: false },
  },
  {
    target: "a",
    tag: STARRED_STATE,
    patch: { isStarred: true },
  },
  {
    target: "r",
    tag: STARRED_STATE,
    patch: { isStarred: false },
  },
];
