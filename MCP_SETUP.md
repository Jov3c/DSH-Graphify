# Graphify 原版 MCP 与 DSH Desktop 对接指南

> 状态：**可手动配置，尚未实现插件内一键自动连接或完成 Desktop 实机测试。** MCP 属于 Graphify 开源功能；DSH 官方 MCP 客户端支持 stdio，但必须是**独立的已配置服务器**。不要把原生 `graphify_query` 工具和 MCP 工具在同一项目内同时强制调用。

## 先决条件

1. 当前项目已有 `graphify-out/graph.json`。
2. 在 Graphify 设置里显式开启 **高级本地操作** 与 **联网／AI 操作**。然后让 Agent 在用户明确授权下调用 `graphify_dependencies`，只传 `extras: ["mcp"]`。这一步会从 PyPI 下载官方可选 Python 依赖，不会启动 MCP 服务。
3. 确认 DSH 的 Desktop Profile 已安装 `@deepseek-ai/dsh-mcp-client`（官方包）。

## 使用官方 DSH MCP 客户端

在 DSH Desktop 对应 Cordis Profile 的服务器配置位置，添加一个 `@deepseek-ai/dsh-mcp-client` 条目。Windows 示例**仅为模板**，将 `<LOCALAPPDATA>` 和 `<PROJECT>` 替换为实际绝对路径：

```yaml
- id: graphify-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: graphify
    transport: stdio
    command: '<LOCALAPPDATA>\\DSH-Graphify\\engine-v2\\venv\\Scripts\\python.exe'
    args:
      - '-m'
      - 'graphify.serve'
      - '--graph'
      - '<PROJECT>\\graphify-out\\graph.json'
    cwd: '<PROJECT>'
    toolCallTimeoutMs: 60000
    failOnStartupError: false
```

原版使用 `python -m graphify.serve --graph <path>` 运行 stdio MCP。DSH 的官方 MCP 客户端会负责连接、发现、权限与注销。没有安装 `graphifyy[mcp]` 时连接会失败。

**不要**在没有鉴权时把 Graphify MCP 绑定到 `0.0.0.0` 的 HTTP 端口。上面的 stdio 配置仅本地进程通信，不创建可被公网访问的监听端口。

## 说明

- 原版 Graphify MCP 服务器与插件当前的五项原生工具有功能重叠。推荐二选一作为 Agent 的主要图谱查询渠道。
- 如果多个 DSH 工作区对应不同 `graph.json`，需要分别配置独立的 MCP 服务名与工作目录。
- 目前本插件不会在 DSH 里自动编辑用户 Profile、安装 MCP 服务，避免破坏现有配置或自动打开持久外部接口。
- 该流程仍需在 DSH Desktop 本机验证；GitHub Actions 的 Node.js 测试无法代表 MCP 子进程和真实工具发现已成功。
- DSH 官方来源：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md
- Graphify 原版来源：https://github.com/Graphify-Labs/graphify/blob/v8/graphify/serve.py
