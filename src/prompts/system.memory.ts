export type CopilotStatus = "approve" | "reject" | "refined";

export type CopilotRequest = {
  src_string: string;
  translate_string: string;
  file_id: string;
};

export type CopilotResponse =
  | { status: "approve" }
  | { status: "reject"; reason: string }
  | { status: "refined"; refined_translated_string: string };

export function SYSTEM_MEMORY({
  req,
  res,
  currentMemory,
}: {
  req: CopilotRequest;
  res: CopilotResponse;
  currentMemory: string;
}): string {
  return `你维护一份翻译 memory。memory 是对象列表，每一项有 index、text、tags。
根据一次已经审核过的翻译，决定对 memory 做哪些操作。
只返回 JSON，不要返回其他文字：
{"ops":[{"action":"add"|"update"|"delete","index":0,"text":"","tags":[]}]}

操作含义：
- add：新增一条。index 由调用方按当前列表长度填写，这里给出的 index 可以忽略。
- update：按 index 替换 text 和 tags。
- delete：按 index 删除。
没有需要变更的内容时，返回 {"ops":[]}。

当前 memory：
${currentMemory}

待审核的翻译请求：
- file_id: ${req.file_id}
- src_string: ${req.src_string}
- translate_string: ${req.translate_string}

${formatReview(res)}`;
}

function formatReview(res: CopilotResponse): string {
  switch (res.status) {
    case "approve":
      return "用户审核结果：approve。用户接受了 translate_string。";
    case "reject":
      return `用户审核结果：reject。用户拒绝了 translate_string。原因：${res.reason}`;
    case "refined":
      return `用户审核结果：refined。用户把译文修正为：${res.refined_translated_string}`;
  }
}
