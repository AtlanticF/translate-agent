import { renderToString } from "ink";
import { expect, test } from "vitest";
import { App, placeholder } from "./entry.js";

test("shows a fixed placeholder", () => {
  expect(renderToString(<App />)).toContain(placeholder);
});
