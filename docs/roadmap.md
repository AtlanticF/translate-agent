# 前期路线图

进度以 GitHub milestone 和 issue 为准。这份文档只说明范围和约定。

## 状态约定

application 持有 `messages`。`getMessages()` 随时返回这份列表。agent core 不保存消息，也不自己循环。

`next(messages)` 只读消息，返回一个决策：

1. 有尚未执行的 tool call → `execute_tool`
2. 有尚未完成的 `review_request` → `request_review`
3. 最后一条需要模型接话 → `call_model`
4. 其余 → `done`

application 执行这个决策，并且是唯一写入 messages 的地方。`call_model` 和 `execute_tool` 完成后继续循环。`request_review` 和 `done` 时循环停下。

领域消息和发给模型的 `ModelMessage` 是两种对象。调用前再做映射。

| 领域消息 | 作用 |
| --- | --- |
| `user` | 用户输入，映射为模型的 user 消息 |
| `assistant` | 模型回复，可带 `toolCalls` |
| `tool` | 某次 tool call 的结果，用 `toolCallId` 对应 |
| `memory` | 当前记忆。派生时取最新一条 |
| `review_request` | 待用户审核的文本 |
| `review_result` | `accept`、`reject`，或带修改稿的 `revise` |

`memory` 和 `review_*` 不单独变成聊天消息。memory 文本接在 system prompt 后面，放进系统消息。

`buildMemoryPrompt({ reviewRequest, reviewResult, currentMemory })` 的规则：

- 没有请求，或还没有结果：保持 `currentMemory`
- `accept`：把 `reviewRequest` 追加到 `currentMemory` 后面，中间空一行
- `revise`：把修改稿追加到 `currentMemory` 后面，中间空一行
- `reject`：保持 `currentMemory`

## 文件位置

```
src/messages/types.ts
src/messages/derive.ts
src/agent/decision.ts
src/agent/next.ts
src/application/store.ts
src/application/loop.ts
src/application/entry.tsx
src/ai/env.ts
src/ai/to-model-messages.ts
src/ai/call-model.ts
src/tools/registry.ts
src/tools/bash
src/tools/read
src/tools/write
src/tools/edit
src/tools/glob
src/tools/grep
src/tools/web-fetch
src/tools/web-search
src/tools/todo
src/prompts/system
src/prompts/memory
```

测试和实现放在一起。

## 前期不做

- 模型自动提议 memory
- 批量文件翻译、术语库、子 agent
- 账号、计费、远程部署

## 里程碑

按编号顺序做。M5 里单个工具可以在注册表和执行器完成后并行。

### M1 协作与工程基座

仓库有文档、模板、TypeScript 脚手架和 Ink 空壳。

- [#1](https://github.com/AtlanticF/translate-agent/issues/1) 写入路线图、迭代流程和 GitHub 模板
- [#2](https://github.com/AtlanticF/translate-agent/issues/2) 初始化 TypeScript 脚手架与依赖
- [#3](https://github.com/AtlanticF/translate-agent/issues/3) 添加 Ink 空壳入口

### M2 messages 状态

领域消息、派生对象，以及 application 上的 `getMessages()`。

- [#4](https://github.com/AtlanticF/translate-agent/issues/4) 定义领域 Message 类型
- [#5](https://github.com/AtlanticF/translate-agent/issues/5) 从 messages 派生 currentMemory
- [#6](https://github.com/AtlanticF/translate-agent/issues/6) 从 messages 派生 reviewRequest 与 reviewResult
- [#7](https://github.com/AtlanticF/translate-agent/issues/7) 从 messages 派生待执行的 tool call
- [#8](https://github.com/AtlanticF/translate-agent/issues/8) 在 application 中保存 messages 并提供 getMessages

### M3 next 与循环

无状态 `next()`，以及会在审核或结束时停下的循环。

- [#9](https://github.com/AtlanticF/translate-agent/issues/9) 定义 Decision，并实现 next 的四个分支
- [#10](https://github.com/AtlanticF/translate-agent/issues/10) 实现 application 循环，在审核或结束时停下

### M4 模型调用

OpenAI 兼容接口、`ModelMessage` 映射、一次调用写回 messages。

- [#11](https://github.com/AtlanticF/translate-agent/issues/11) 读取 OpenAI 兼容接口的环境变量
- [#12](https://github.com/AtlanticF/translate-agent/issues/12) 把领域消息映射为 ModelMessage
- [#13](https://github.com/AtlanticF/translate-agent/issues/13) 执行一次模型调用并把助手回复写回 messages
- [#14](https://github.com/AtlanticF/translate-agent/issues/14) 把助手回复中的 tool call 记成待执行调用

### M5 Tools

工具注册表，以及 Claude Code 那一组工具的第一版。

- [#15](https://github.com/AtlanticF/translate-agent/issues/15) 定义 Tool 接口与注册表
- [#16](https://github.com/AtlanticF/translate-agent/issues/16) 模型调用携带已注册的 tools
- [#17](https://github.com/AtlanticF/translate-agent/issues/17) 执行一个 tool 并把结果写回 messages
- [#18](https://github.com/AtlanticF/translate-agent/issues/18) 实现 Bash 工具
- [#19](https://github.com/AtlanticF/translate-agent/issues/19) 实现 Read 工具
- [#20](https://github.com/AtlanticF/translate-agent/issues/20) 实现 Write 工具
- [#21](https://github.com/AtlanticF/translate-agent/issues/21) 实现 Edit 工具
- [#22](https://github.com/AtlanticF/translate-agent/issues/22) 实现 Glob 工具
- [#23](https://github.com/AtlanticF/translate-agent/issues/23) 实现 Grep 工具
- [#24](https://github.com/AtlanticF/translate-agent/issues/24) 实现 WebFetch 工具
- [#25](https://github.com/AtlanticF/translate-agent/issues/25) 实现 WebSearch 工具
- [#26](https://github.com/AtlanticF/translate-agent/issues/26) 实现 TodoWrite 工具

### M6 Prompt

稳定的 system prompt，以及由审核结果拼接出的 memory prompt。

- [#27](https://github.com/AtlanticF/translate-agent/issues/27) 编写 system prompt 并放进模型请求
- [#28](https://github.com/AtlanticF/translate-agent/issues/28) 实现 memory 拼接：不同 reviewRequest 与 reviewResult
- [#29](https://github.com/AtlanticF/translate-agent/issues/29) 审核完成后把新 memory 写回 messages
- [#30](https://github.com/AtlanticF/translate-agent/issues/30) 模型请求附带 memory prompt

### M7 审核闭环

在 Ink 里完成审核，并把结果写回 messages。

- [#31](https://github.com/AtlanticF/translate-agent/issues/31) 在 Ink 中展示 reviewRequest
- [#32](https://github.com/AtlanticF/translate-agent/issues/32) 收集接受、拒绝和修改后的 reviewResult
- [#33](https://github.com/AtlanticF/translate-agent/issues/33) 写回审核结果并恢复循环

### M8 最小翻译路径

输入一句原文并看到译文。审核通过后，下一轮模型请求带上新 memory。

- [#34](https://github.com/AtlanticF/translate-agent/issues/34) 把用户输入写成待翻译的 user message
- [#35](https://github.com/AtlanticF/translate-agent/issues/35) 跑通输入到译文的路径
- [#36](https://github.com/AtlanticF/translate-agent/issues/36) 审核通过后下一轮请求带上新 memory
