# 迭代方式

一个 issue 对应一个 PR。合并进 `main` 之后再开始下一个。

## 步骤

1. 按 [路线图](roadmap.md) 的编号取下一个未关闭 issue。M5 里的单个工具可以在 [#17](https://github.com/AtlanticF/translate-agent/issues/17) 完成后并行。
2. 从最新的 `main` 拉分支，分支名使用 `issue-<编号>-<短名>`。
3. 只做该 issue 的完成标准。
4. 开 PR。描述第一行写 `Closes #<编号>`。
5. 合并到 `main`，删除分支。
6. 继续下一个 issue。

## PR

- 标题说明这个 issue 做了什么。
- 对照 issue 里的完成标准逐条写明结果。
- 不把下一个 issue 的改动放进同一个 PR。

## 进度

GitHub milestone 和 issue 是进度。路线图不手工勾选。
