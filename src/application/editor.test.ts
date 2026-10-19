import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LaunchEditorError } from "@inquirer/external-editor";
import { afterEach, expect, test } from "vitest";
import { editInFile } from "./editor.js";

const previousVisual = process.env.VISUAL;
const previousEditor = process.env.EDITOR;

afterEach(() => {
  restoreEnv("VISUAL", previousVisual);
  restoreEnv("EDITOR", previousEditor);
});

test("returns the text saved by the editor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "editor-test-"));
  const scriptPath = join(directory, "editor.js");
  await writeFile(
    scriptPath,
    `
      const { readFileSync, writeFileSync } = require("node:fs");
      const filePath = process.argv[2];
      const text = readFileSync(filePath, "utf8");
      writeFileSync(filePath, text.toUpperCase());
    `,
  );
  delete process.env.VISUAL;
  process.env.EDITOR = `${process.execPath} ${scriptPath}`;

  await expect(editInFile("hello")).resolves.toBe("HELLO");
});

test("rejects when the editor cannot be launched", async () => {
  delete process.env.VISUAL;
  process.env.EDITOR = join(tmpdir(), "missing-editor");

  await expect(editInFile("hello")).rejects.toBeInstanceOf(LaunchEditorError);
});

function restoreEnv(name: "VISUAL" | "EDITOR", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
