import { pathToFileURL } from "node:url";
import { render, Text } from "ink";
import type { ReactElement } from "react";

export const placeholder = "translate-agent";

export function App(): ReactElement {
  return <Text>{placeholder}</Text>;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  render(<App />);
}
