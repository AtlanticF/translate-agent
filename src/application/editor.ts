import { editAsync } from "@inquirer/external-editor";

// 临时文件和 $VISUAL / $EDITOR 由这个库处理。终端让出和重画仍由调用方的 suspendTerminal 负责。
export function editInFile(initial: string): Promise<string> {
  return editAsync(initial);
}
