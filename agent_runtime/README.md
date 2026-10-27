# Python 检查 Agent

AI 能力与桌面后端独立：本目录负责关键词证据检索、资料充分性分析、结构化模型调用、引用验证和审核判断；Node 负责文件授权、解析、SHA-256 快照、SQLite、凭据、任务调度和 IPC。

第一版为两个固定阶段的专用 Agent，Python 3.9+，仅使用标准库，不需要安装模型 SDK、Python Web 框架或向量数据库。后续若增加动态工具循环或 Web 复用，可在不改变桌面接口的前提下替换内部执行图或增加服务入口；目前不声称使用 LangGraph/FastAPI。

Node 为每次请求启动 `worker.py`，通过 stdin 输入单个 JSON，通过 stdout 接收一个 JSON 信封。进程不接收任意文件路径，不提供文件、Shell 或联网搜索工具。规则模式不联网；模型模式仅请求固定 DeepSeek 官方 Chat Completions 地址，不跟随重定向，不输出思维链。

DeepSeek JSON 接口依据 2026-10-27 官方文档：
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode/

模型返回需同时通过 Python 引用/清单验证与 Node Zod 协议校验。规则命中不会标成语义通过；解析失败、截断或演示生成不能产生完整审核通过结论。模型判断不等于事实认证，不保证任何形式的准确率。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s agent_runtime/tests -v
```

测试中的模型回复都是协议夹具，不代表真实账号验证。API Key 由 Node 系统密钥加密保管，通过私有 stdin 管道发送，不放在命令行、环境变量或日志中。
