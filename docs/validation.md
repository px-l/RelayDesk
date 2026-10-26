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
