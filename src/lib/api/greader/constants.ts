import { CONFIG } from "@/lib/config";
import { READ_STATE, STARRED_STATE } from "@/lib/core/stream-ids";

export const GOOGLE_LOGIN_PREFIX = "googlelogin auth=";
export const MAX_STREAM_ITEMS = CONFIG.GREADER_MAX_STREAM_ITEMS;
export const DEFAULT_STREAM_ITEMS = CONFIG.GREADER_DEFAULT_STREAM_ITEMS;
export const NETNEWSWIRE_MAX_STREAM_ITEMS =
  CONFIG.GREADER_NETNEWSWIRE_MAX_ITEMS;

interface TagMutation {
  patch: {
    isRead?: boolean;
    isStarred?: boolean;
  };
  tag: string;
  target: "a" | "r";
}

export const TAG_MUTATIONS: TagMutation[] = [
  {
    patch: { isRead: true },
    tag: READ_STATE,
    target: "a",
  },
  {
    patch: { isRead: false },
    tag: READ_STATE,
    target: "r",
  },
  {
    patch: { isStarred: true },
    tag: STARRED_STATE,
    target: "a",
  },
  {
    patch: { isStarred: false },
    tag: STARRED_STATE,
    target: "r",
  },
];
