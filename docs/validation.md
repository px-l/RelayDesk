# 本地验证记录

日期：2026-10-26（Asia/Shanghai）。macOS arm64，开发 Node 24.14.0，Electron 44.9.3。

- `npm run typecheck`：前端、共享类型、本地后端通过。
- `npm test`：18 项通过，0 失败；含 SQLite 去重/原子更新、状态、并发派发、授权目录软链接、失败与取消、接力归属和原始目标保留、关闭重开数据库、DSH stdio 与 WorkBuddy REST/SSE 协议替身。
- `npm run build`：通过。存在图标包 use-client 指令与主包体积提示，记录为非阻塞优化项。
- `npm run smoke`：真实 Electron 44.9.3 窗口启动成功，两个关联 Demo 任务完成，8 个工作区成果文件，Markdown/CSV/PNG/PDF 读取成功；PDF canvas 实际绘制，交接编辑器五部分内容存在。
- `npm audit`：0 vulnerabilities。
- OAuth 参考实现：语法检查通过，未持有 clientSecret 或进行线上授权交换。

桌面截图：[任务](screenshots/task.png)、[PDF 实际绘制](screenshots/pdf-preview.png)、[交接包](screenshots/handoff.png)。

系统运行时输出过一条 macOS sandbox extension 的资源路径提示，未阻止渲染器、preload、SQLite 或 PDF 工作；smoke 以 0 退出。没有禁用 Electron sandbox 规避检查。

不宣称：真实 DSH 模型调用、WorkBuddy 账号授权、云端模型执行、线上成果下载、系统凭据实际写入或其他操作系统已通过。真实外部条件见 README。

## 新增资料准备与成果审核 · 2026-10-27

- 分工：Python 3.9.6 实际子进程负责检索与检查，Node/Electron 44.9.3 保留后端。Python 仅标准库，无新运行时依赖安装。
- `npm run check` 通过：前后端类型检查、33 项 Node 测试、10 项 Python 测试和生产构建。
- 新测试覆盖：无准备不得审核、无基线不得生成、缺口须确认、输入变更使旧基线不可用、切换检查模式需重做、跨任务成果拒绝、快照篡改检测、成果内容或版本变化导致旧审核失效、修改草稿不自动派发、检查中断持久化。
- Python 测试包含：关键词只能算相关片段、无命中不能断言不存在、模型清单必须完整、虚构引用拒绝、只有成果引用而无来源证据不能判通过、缺凭据不自动回退。模型回复均为替身，无厂商账号实测。
- Electron smoke 通过完整 UI：勾选可选阶段 → 编辑要求 → 调用真正 Python 检查 → 接受限制并冻结基线 → Demo 生成 → Python 自动审核 → 显示不完整审核 → 修改成果后显示旧审核失效。原接力与四类预览回归仍通过。
- 结果明确保持：规则检查/演示生成不产生真实语义审核通过；未解析、截断与无证据均显示限制，需修改属于已完成的业务结果。
- 截图：[资料检查](screenshots/preparation.png)、[审核报告](screenshots/quality-review.png)。

尚未验证真实 DeepSeek Key 的账号、额度和模型调用；按官方 JSON API 实现的语义通路需用户配置后联调。DSH / WorkBuddy 的真实账号验证条件与原记录一致。未声称实现向量 RAG、自动联网补资料、动态多 Agent 或 LangGraph Checkpoint。
