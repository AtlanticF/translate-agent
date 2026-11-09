import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { MemoryItem, MemoryStorage } from "../../src/memory/memory";
import { userMemories } from "./session-schema";

type MemoryDatabase = BaseSQLiteDatabase<
  "sync" | "async",
  unknown,
  { userMemories: typeof userMemories }
>;

export type UserMemoryStore = MemoryStorage & {
  // 管理界面只提供删除；新增和修改由 Agent 在审核反馈后自动维护。
  remove(index: number): Promise<MemoryItem[]>;
};

// legacy：用户第一次访问时，用旧的 memory.json 内容静默初始化，之后只读写数据库。
export function createUserMemoryStore(
  db: MemoryDatabase,
  userId: string,
  legacy: () => Promise<MemoryItem[]> = async () => [],
): UserMemoryStore {
  async function load(): Promise<MemoryItem[]> {
    const row = await db.select().from(userMemories).where(eq(userMemories.userId, userId)).get();
    if (row) {
      return row.items;
    }
    const items = await legacy().catch(() => []);
    await db
      .insert(userMemories)
      .values({ userId, items, updatedAt: new Date() })
      .onConflictDoNothing();
    return items;
  }

  async function save(items: MemoryItem[]): Promise<void> {
    const values = { userId, items, updatedAt: new Date() };
    await db
      .insert(userMemories)
      .values(values)
      .onConflictDoUpdate({ target: userMemories.userId, set: values });
  }

  return {
    load,
    save,
    async remove(index) {
      const items = (await load())
        .filter((item) => item.index !== index)
        .map((item, position) => ({ ...item, index: position }));
      await save(items);
      return items;
    },
  };
}
