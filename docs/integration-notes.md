# 引擎接口

| 引擎 | 依据 | 接入范围 |
|---|---|---|
| DSH | [官方仓库](https://github.com/deepseek-ai/deepseek-harness) | 本机 ACP 子进程、会话、公开增量、工具和审批 |
| Codex CLI | [非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode) · [CLI 参数](https://learn.chatgpt.com/docs/cli/reference) | 本机 CLI 登录、exec JSONL、工具进度、文件导入和取消 |

Codex 的 `thread.started` 保存会话 ID，`item.completed` 提取公开回复，工具项映射到 RelayDesk 工具事件。任务以 `turn.completed` 和进程成功退出共同确认完成。执行后仅导入任务输出目录中的普通文件。
