# 官方接入核查记录 · 2026-10-26

来源：

- [DSH 官方入口](https://deepseek.com/harness/)
- [DSH ACP README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)
- [DSH Python SDK 指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/python-sdk.md)
- [WorkBuddy Open API](https://open.workbuddy.cn/docs/openapi)

选用 DSH 官方 ACP stdio，避免把终端展示当作 API。客户端只使用已核实的 initialize、session/new、session/prompt、session/cancel、session/update 和 session/request_permission。官方存在恢复方法，但本项目尚未提供安全的未完成请求恢复，不宣称支持。DSH 的更新可能是提交后语义块，不保证逐 token。

WorkBuddy 已核查授权码交换、云端任务创建/查询、ACP SSE 双通道、公开权限请求及成果列表/下载。OAuth 需要 clientSecret，因此交换逻辑只能部署于服务端。未发现可直接接收本地文件的公开上传契约；未把未知能力当成支持。

WorkBuddy 文档存在两类 link 示例；成果端点仅对文档定义的 `/acp` 形态推导。其他形态显示不支持，等待厂商澄清。REST 成果恢复和 SSE 推送按 URI 合并，不根据无标识的流式文本猜测去重。

验证层级：

| 项目 | 本地验证 | 厂商实测 |
|---|---|---|
| Demo 执行与接力 | 完整流程、真实文件与重启存储 | 不适用 |
| DSH stdio 客户端 | JSON-RPC 可执行协议替身 | 缺 DSH 运行时与凭据 |
| WorkBuddy REST / ACP | fetch/SSE 协议替身、顺序与恢复只读 | 缺应用授权和账号 |
| WorkBuddy 成果与下载 | 官方响应结构解析、文本下载替身 | 沙箱/CDN 需实测 |
| 系统凭据 | safeStorage 可用性检查与加密路径 | 未提供凭据，未保存用户令牌 |

本文件刻意区分「按官方协议实现」「协议替身通过」「真实账号通过」。升级厂商协议时应重新核查，再更新能力声明和测试。
