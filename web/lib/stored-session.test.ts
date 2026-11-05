import { expect, test } from "vitest";
import { readStoredSessionId, writeStoredSessionId } from "./stored-session";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    values,
    getItem(key: string) {
      return values[key] ?? null;
    },
    setItem(key: string, value: string) {
      values[key] = value;
    },
    removeItem(key: string) {
      delete values[key];
    },
  };
}

test("prefers the session in the url", () => {
  const storage = memoryStorage({ "translate-agent.session": "stored" });
  expect(readStoredSessionId({ search: "?session=from-url" }, storage)).toBe("from-url");
});

test("falls back to the last opened session", () => {
  const storage = memoryStorage({ "translate-agent.session": "stored" });
  expect(readStoredSessionId({ search: "" }, storage)).toBe("stored");
  expect(readStoredSessionId({ search: "" }, memoryStorage())).toBeUndefined();
});

test("writes the open session into the url and storage", () => {
  const storage = memoryStorage();
  const next = writeStoredSessionId(
    "session-1",
    { pathname: "/", search: "?x=1", hash: "#top" },
    storage,
  );
  expect(next).toBe("/?x=1&session=session-1#top");
  expect(storage.values["translate-agent.session"]).toBe("session-1");
});

test("clears the remembered session", () => {
  const storage = memoryStorage({ "translate-agent.session": "session-1" });
  const next = writeStoredSessionId(
    undefined,
    { pathname: "/", search: "?session=session-1", hash: "" },
    storage,
  );
  expect(next).toBe("/");
  expect(storage.values["translate-agent.session"]).toBeUndefined();
});
