const queryKey = "session";
const storageKey = "translate-agent.session";

type SessionLocation = {
  pathname: string;
  search: string;
  hash: string;
};

type SessionStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

// 地址栏优先，其次是上次打开的会话。刷新或重新进入页面时用来回到同一条会话。
export function readStoredSessionId(
  location: Pick<SessionLocation, "search">,
  storage: Pick<SessionStorageLike, "getItem">,
): string | undefined {
  const fromUrl = new URLSearchParams(location.search).get(queryKey);
  if (fromUrl) {
    return fromUrl;
  }
  const stored = storage.getItem(storageKey);
  return stored && stored.length > 0 ? stored : undefined;
}

// 返回应写回地址栏的 path + search + hash。
export function writeStoredSessionId(
  id: string | undefined,
  location: SessionLocation,
  storage: Pick<SessionStorageLike, "setItem" | "removeItem">,
): string {
  const params = new URLSearchParams(location.search);
  if (id) {
    params.set(queryKey, id);
    storage.setItem(storageKey, id);
  } else {
    params.delete(queryKey);
    storage.removeItem(storageKey);
  }
  const search = params.toString();
  return location.pathname + (search ? `?${search}` : "") + location.hash;
}
