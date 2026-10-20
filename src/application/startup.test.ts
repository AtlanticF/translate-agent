import { expect, test } from "vitest";
import { ModelUnavailableError } from "../ai/probe.js";
import { startup } from "./startup.js";

test("renders only after the models answer", async () => {
  const order: string[] = [];

  await startup(
    () => {
      order.push("render");
    },
    {
      loadEnv() {
        order.push("load");
      },
      async check() {
        order.push("check");
      },
    },
  );

  expect(order).toEqual(["load", "check", "render"]);
});

test("prints a red warning and exits when a model is unavailable", async () => {
  let rendered = false;
  let written = "";

  await expect(
    startup(
      () => {
        rendered = true;
      },
      {
        loadEnv() {},
        async check() {
          throw new ModelUnavailableError(["google/gemini-2.5-flash"]);
        },
        write(text) {
          written = text;
        },
        exit() {
          throw new Error("exit");
        },
      },
    ),
  ).rejects.toThrow("exit");

  expect(rendered).toBe(false);
  expect(written).toContain("\x1b[31m");
  expect(written).toContain("模型不可用：google/gemini-2.5-flash");
  expect(written).not.toContain("exit");
});
