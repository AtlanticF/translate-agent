# translate-agent

翻译 agent 的目录骨架。当前没有任何实现代码。

前期范围和迭代方式：

- [路线图](docs/roadmap.md)
- [迭代方式](docs/workflow.md)

约束：

- agent core 无状态。状态就是 `messages` 以及从它派生的对象。
- core 不自己循环，只暴露 `next()`。循环和 `getMessages()` 在 application。
- 界面用 Ink。模型调用用 Vercel AI SDK，OpenAI 兼容接口，发给模型的是 `ModelMessage`。
- tools 按 Claude Code 那一组来放。
- system prompt 与 memory prompt 分开。memory 由 `reviewRequest`、`reviewResult`、`currentMemory` 拼出。

```
src/
  agent/            next()，无 loop，不保存状态
  application/      Ink、循环、getMessages、审核交互
  messages/         messages 以及从它派生的对象
  ai/               AI SDK、OpenAI 兼容、ModelMessage 映射
  tools/
    bash/
    read/
    write/
    edit/
    glob/
    grep/
    web-fetch/
    web-search/
    todo/
  prompts/
    system/
    memory/
```
