import { expect, test } from "vitest";
import {
  commandToSubmit,
  commandsForInput,
  lookupCommand,
  nextCommandIndex,
} from "./commands.js";

test("lists every command when the input starts with a slash", () => {
  expect(commandsForInput("/").map((command) => command.name)).toEqual([
    "exit",
    "compact",
    "memory",
  ]);
  expect(commandsForInput("translate")).toEqual([]);
});

test("accepts only the known commands without arguments", () => {
  expect(lookupCommand("/exit")?.name).toBe("exit");
  expect(lookupCommand("/compact")?.name).toBe("compact");
  expect(lookupCommand("/memory")?.name).toBe("memory");
  expect(lookupCommand("/nope")).toBeUndefined();
  expect(lookupCommand("/exit now")).toBeUndefined();
  expect(lookupCommand("exit")).toBeUndefined();
});

test("submits the highlighted command for a slash prefix", () => {
  expect(commandToSubmit("/", 1)).toBe("/compact");
  expect(commandToSubmit("/c", 0)).toBe("/compact");
  expect(commandToSubmit("/m", 0)).toBe("/memory");
  expect(commandToSubmit("/exit", 1)).toBe("/exit");
  expect(commandToSubmit("/nope", 0)).toBe("/nope");
  expect(nextCommandIndex(0, "up", 2)).toBe(1);
  expect(nextCommandIndex(1, "down", 2)).toBe(0);
});
