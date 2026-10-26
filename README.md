# RelayDesk · 接力工作台

一个以本地任务记录为中心的 Electron 桌面应用。把需求、输入资料、公开回答和生成成果放在同一个工作区，让另一个引擎通过可编辑的交接包继续处理。

**真实接入状态**：DSH 与 WorkBuddy 的适配代码依据官方协议实现，并通过本地协议替身测试。当前开发机器没有 DSH 运行时、DeepSeek 凭据或 WorkBuddy 应用授权，尚未进行厂商端到端验证。演示模式完全独立，不代表任何厂商能力。

## 运行

需要 Node.js **24 LTS**（本机开发版本 24.14.0）、npm、macOS。首轮已在 Apple Silicon macOS 验证 Electron 桌面运行。其他平台没有做桌面实测。

```sh
npm ci
npm run dev
```

开发模式先编译本地后端，再启动 Vite 和 Electron。React/CSS 支持热更新；修改 backend 或 shared 后重新启动开发进程。

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` 构建并运行生产页面。`npm run dev:web` 仅提供页面开发服务器；浏览器不会获得本地桥接权限，会明确提示使用桌面应用。

Electron 二进制在首次安装/启动时下载；网络必须能访问其发布地址。网络环境需要镜像时，可设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后执行 `node node_modules/electron/install.js`，安装器仍使用官方 npm 包内的 checksums 校验。不要关闭校验。

## 无凭据演示（约一分钟）

1. 点击左侧「工作区」的 `+`，选择或新建一个本地目录并授权。
2. 选择 `Demo · 方案助手 · 演示模式`，描述需求，创建草稿。
3. 可在右侧 `+` 添加文件。文件经原生文件选择器授权后复制到工作区，不会上传。
4. 点击「启动任务」，查看批量刷新的 Markdown 回答、工具记录及状态。
5. 在右侧预览 Markdown、CSV、PNG 或 PDF；也可导出、打开所在目录或用系统应用打开。
6. 点击「交给另一个引擎」，选择 `Demo · 审阅助手`，检查五部分交接内容并选择成果。确认后创建关联草稿，再点击启动。
7. 退出并重开应用，任务、事件、成果和前后任务关系仍保留。

两种 Demo 角色同属独立 DemoAdapter，用来演示不同处理阶段；不是 DSH / WorkBuddy 的模拟成功状态。输出内容是可重复模板，输入文件仅登记和传递，不声称读取或理解文档。示例 PNG/PDF 是真实可打开的文件。

## 界面与功能

- 中文三栏：工作区/历史任务，对话/公开工具事件/审批，输入/成果/接力。
- 草稿、连接中、执行中、等待输入、取消请求中、中断、完成、失败、取消，分别建模。
- 空状态、加载、未配置、检测失败、不支持、失败和明确的新建重试草稿。
- 每个任务只派发一次。中断不等于远端失败；真实引擎中断后不能简单重试创建，须先核对远端。
- Markdown/GFM 与代码高亮；远程图片不自动加载。CSV 预览前 500 行。
- PNG/JPEG/GIF/WebP、PDF、文本预览；HTML 在无脚本、无网络、无宿主桥接的 sandbox iframe 中显示。
- DOCX/XLSX/PPTX 提供成果卡片、导出和系统打开，不提供内嵌编辑。
- 可编辑交接包包含目标、已完成、结论、未解决、下一阶段要求与选定文件。确认后创建草稿，启动再次由用户操作。

## 真实引擎配置

### DeepSeek Harness

官方来源：[DeepSeek Harness](https://deepseek.com/harness/)、[官方仓库](https://github.com/deepseek-ai/deepseek-harness)、[ACP 包契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)。核查日期：2026-10-26。

按官方安装说明安装 DSH，在其自身的 home/profile 中配置提供商、模型、凭据及工具审批策略。RelayDesk 不读取和保存 DeepSeek API Key。

在设置中填写**已安装 `dsh` 可执行文件的绝对路径**，例如 `/opt/homebrew/bin/dsh`（示例路径不是安装承诺），先保存再检测。RelayDesk 用无 shell 的子进程执行 `dsh --profile acp`，通过逐行 JSON-RPC 通信；不抓取终端展示文字，不解析 stderr。

检测执行权限并进行 ACP v1 握手。任务使用 `session/new` 和 `session/prompt`，只转换公开回答与工具事件，忽略 thought 内容。取消使用 `session/cancel`，授权请求由用户选择官方返回选项。输入文件使用工作区内的 resource link；模型是否能实际读取取决于 DSH 配置的工具。

DSH 当前 ACP 不提供结构化成果列表，因此右侧明确提示在工作区查看文件，`artifacts=false`。官方虽然存在会话恢复，本版没有实现能可靠查询未完成 prompt 状态的恢复方案，因此 `resume=false`；断开后显示中断并保留远端 ID，不重发原请求。本版不支持模型自动调用其他引擎，也不配置多 Agent 编排。

**边界**：RelayDesk 自身的文件读写受授权工作区限制；DSH 子进程的工具权限由 DSH 自己的安全策略决定。工作区检查不是操作系统级进程隔离。只使用信任的 DSH 安装与工具配置，审批由用户确认。

### WorkBuddy

以 [官方 Open API 文档](https://open.workbuddy.cn/docs/openapi) 为准，核查日期：2026-10-26。

需要注册第三方应用，并授权 `user.task.readable` 与 `user.task.invokable`。在你自己的服务端完成 OAuth 授权码交换，得到用户 access_token，再粘贴到桌面设置。

- **clientSecret 只能存在服务端**，不能放在 Electron、Vite 环境变量或前端配置里。
- 提供 [服务端 OAuth 参考实现](examples/oauth-server/server.mjs) 与 [配置示例](examples/oauth-server/.env.example)。它绑定 localhost，须置于自己的 HTTPS 反向代理后面，配置完全一致的 `/callback` 地址，使用 state、HttpOnly/Secure Cookie 和一次性回调校验。用 Node 24 的 `--env-file` 在服务器运行。参考实现仅用于自有应用联调，使用手动传递 access_token；不保存 refresh_token、不提供多用户登录与令牌刷新服务。不要把该目录打入客户端。
- 桌面通过 Electron safeStorage 的系统密钥机制加密 access_token，文件权限为 0600；系统密钥服务不可用或 Linux 使用 basic_text 时拒绝保存。令牌不回传给渲染层、不写普通日志、不进入 SQLite。
- 检测仅调用任务列表，成功只表示读取权限可用。创建权限、ACP 以及媒体下载必须另行实测。
- 创建、查询任务走固定官方 REST 主机；ACP 采用返回的 HTTPS link/token，GET SSE 接收、POST JSON-RPC 发送并携带连接标识。依次 initialize、session/load、session/prompt。只接受官方 WorkBuddy / agentos-run.net 运行域，拒绝重定向及任意主机。
- 工具审批由用户确认；本版取消禁用。没有在当前文档找到已验证的本地文件上传入口，`files=false`。不能给云端任务传本地路径，接力到 WorkBuddy 时须取消文件选择，将必要结论写入包内。
- 「查询远端」只 GET 既有任务状态，不重新 prompt，不把本地事件重放冒充恢复。当前文档未承诺 SSE 历史游标恢复，所以不自动重连重放或重发。
- 结构化成果通知按 uri 合并/删除；右侧刷新按钮查询官方成果列表。只有返回 link 以 `/acp` 结尾时，才按文档推导 sandbox 成果接口。若返回另一种 link（文档也展示了 `/sessions/...` 的形态），明确拒绝猜测成果端点。
- 文本成果直接使用返回的公开内容；媒体优先使用官方返回的下载 URL，或按文档由 agent URI 推导同一沙箱路径。token 不发送到第三方下载地址。下载只接受受信域（WorkBuddy、agentos-run.net、myqcloud.com、tencentcos.cn），最多 20MB，不跟随重定向；其他 CDN 提示通过 WorkBuddy 导出。

## 架构与数据

```text
React + Zustand（细粒度选择器、60ms 批量增量）
              ↓ 类型化窄 IPC / preload
Electron 本地 Node 后端
  ├─ TaskService：派发、状态、关联、交接校验
  ├─ EngineAdapter：Demo / DSH stdio / WorkBuddy REST + SSE
  ├─ Store：SQLite WAL、事件唯一键、原子更新
  └─ Files：目录授权、realpath、排除越界软链接、独占创建
```

数据库封装在后端，不对渲染层暴露 SQL、任意文件路径或任意命令。IPC 用 Zod 严格校验并验证顶层调用来源；Electron 禁用 Node 集成、启用 contextIsolation/sandbox，阻止导航与新窗口，默认拒绝权限请求。

SQLite 与加密设置保存在 `app.getPath('userData')`（macOS 通常为 `~/Library/Application Support/relaydesk/`，以 Electron 实际路径为准）。输入副本和成果放在工作区 `.relaydesk/<task-id>/`。移动或删除工作区会导致文件不可用，界面会显示错误。任务元数据与文件的备份需一起进行。

本版 SQLite 使用 Node 内置 `node:sqlite`，避免 ABI 原生模块重编译。在 Node 24 开发测试环境中可能输出 experimental 提示；接口封装在 Store 内，方便后续替换。短事务同步提交；海量任务时应迁移到后台 worker。

细节见 [architecture.md](architecture.md) 与 [官方资料核查记录](docs/integration-notes.md)。

## 验证

```sh
npm run typecheck
npm test
npm run build
npm run smoke
```

`smoke` 启动真实 Electron 窗口，在 `/tmp/relaydesk-smoke-<pid>/` 使用独立数据库与工作区，执行两个 Demo 阶段、预览四类成果、检查交接编辑器并保存截图，然后退出。不使用个人账号，不改正常应用数据库。协议替身测试只验证客户端契约，绝不表示真实厂商通过。

固定依赖以 package-lock.json 为准：Electron 44.9.3、React 19.3.1、Vite 8.3.5、TypeScript 6.0.3、Tailwind 4.3.3、Zustand 5.0.16。选择前核对了 [Electron](https://releases.electronjs.org/release/v44.9.3)、[React](https://react.dev/versions)、[Vite](https://vite.dev/guide/)、[Tailwind](https://tailwindcss.com/docs/installation/using-vite)、[Zustand](https://github.com/pmndrs/zustand)、[TypeScript](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) 官方资料与 npm 发布版本。

## 当前限制

不包含签名、公证、自动更新或安装包发布；这是可从源码运行的开源桌面项目。首版没有多租户、计费、画布、向量库或自动多 Agent 工作流。每个任务一轮请求，后续处理通过关联任务进行；真实适配器的 sendMessage 用于连接内的初始消息；本轮完成后关闭连接，未实现的后续追问明确报不支持。DSH 成果自动发现、DSH 恢复、WorkBuddy 文件上传、取消及有游标的远端流恢复均未伪装实现。PDF 使用 PDF.js 按页绘制 canvas，由 CSP 禁止 eval，关闭 XFA 与交互脚本，不执行文档动作；复杂编码/缺失字体的文档预览失败时可导出用系统应用打开。预览/输入文件上限 20MB。构建可能提示代码高亮带来的单包体积及图标包 use-client 指令警告，不影响桌面构建。

MIT License.

验证明细与截图见 [本地验证记录](docs/validation.md)。
