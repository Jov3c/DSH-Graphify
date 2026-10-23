# Graphify 开源能力迁移矩阵

目标：将 Graphify 开源版能力融入 DSH Desktop；**不包括 Graphify Cloud 的商业服务**。以下仅标记“已接入接口”的真实范围，不把未实机验证的功能标成正式可用。

## 已实现：原生 DSH 入口

| Graphify 开源能力 | DSH 入口 | 备注 |
| --- | --- | --- |
| 代码 AST 图谱、增量索引 | 自动索引 / `graphify_build` | 默认 `--code-only`，无外部模型调用；同一任务生成原版 `graph.html` |
| 原版 force graph | 右侧关系网络 | 自动索引生成原版 `graph.html`；大图使用社区聚合视图，插件上限 20,000 节点；等待 Desktop 实机验收 |
| Tree D3 视图 | `graphify_view(tree)` / 右侧视图选择 | 先生成 `GRAPH_TREE.html`，D3 CDN 仍需联网 |
| Call Flow HTML | `graphify_view(callflow)` / 右侧视图选择 | 先生成 `GRAPH_CALLFLOW.html`，Mermaid CDN 仍需联网 |
| query / explain / path / affected | 五个原生 Agent 工具 | `affected` 附加只读静态证据分级；不等于动态调用的完备证明 |
| 多重图诊断 | `graphify_health(detail=multigraph)` | 官方 `diagnose multigraph --json` |
| 基础图谱健康指标 | `graphify_health` | 节点、边、索引文件数、孤点、端点缺失；**不能当源码覆盖率** |
| 生成 Wiki | `graphify_export(wiki)` | 官方 `export wiki`；依赖已完成社区聚类 |
| Obsidian、GraphML、HTML 导出 | `graphify_export` | 生成至 `graphify-out`；HTML 导出同步更新侧栏状态 |
| PR 列表、冲突、详情、可选分诊 | `graphify_workflow`、`graphify_pr` | PR 访问需要联网权限；AI 分诊须额外权限与模型后端 |
| Git Hook | `graphify_workflow(hook-status)`、`graphify_git` | 安装/卸载默认禁止，需主动启用高级操作 |
| 查询结果记忆与反思 | `graphify_memory` | 本地写入，默认禁止 |
| 离线图谱合并、全局图谱登记 | `graphify_merge`、`graphify_global` | 默认禁止，全局操作会写入用户级 Graphify 目录 |
| 自定义社区重聚类 | `graphify_cluster` | `--no-label` 不触发额外 AI 标签生成 |
| 导入 URL / 论文 / 视频 | `graphify_add` | 仅明确授权后调用；格式依赖原版可选依赖是否已安装 |
| 按需安装官方 extras | `graphify_dependencies` | 显式授权后用插件缓存环境内的 uv 安装固定版本的可选依赖；不修改系统 Python |
| 外部后端语义抽取 | `graphify_semantic` | 默认关闭，必须显式开启高级及联网权限、设置 API 密钥和预算 |
| GitHub 项目克隆 | `graphify_clone` | 仅 HTTPS github.com；输出受 DSH 工作区路径约束 |
| Agent 自然语言图谱优先 | DSH System Prompt + Agent tools | 不保证工具每次必定调用；不强制打断普通聊天 |

## 尚未完成或尚不能验收

下列项目仍属于**待开发/待验证**，不能作为当前 Beta 的已完成承诺：

- **MCP Server 端到端连接**：Graphify 的 `graphify-mcp` 可选依赖已有显式安装入口，但 DSH 的 `@deepseek-ai/dsh-mcp-client` 服务条目、重连和会话生命周期仍需单独配置与验证。插件不会擅自添加持久后台进程。参见 [MCP_SETUP.md](./MCP_SETUP.md)。
- **可选解析器完整验收**：已提供 `graphify_dependencies` 原生工具，在用户开启两级权限后可按需安装部分官方 extras（MCP、PDF、Office、视频、SVG 等），但这些格式的真实解析与兼容性尚未完成跨平台集成测试。默认引擎仍只安装基础 `graphifyy`。
- **Neo4j / FalkorDB 实际写入**：数据库凭据、TLS、连接权限、目标操作确认尚未提供完整 DSH 安全接入。
- **SVG 导出和 `label` 的模型后端选择**：可选依赖/费用控制尚未做完整的原生界面。
- **Graphify 原生 hook-guard/拦截读取文件机制**：当前用 DSH 官方 `systemPrompt.section()` 做工具优先指导，未创建强制的 pre-tool hooks；需要核对 DSH 版本的安全授权链。
- **完整的 PR Review/CI 操作界面**、**Graphify provider 子命令**与 **`benchmark`**。
- **代码解析覆盖率准确计算**：不能简单用 Graphify 节点数除以源文件数，需考虑可识别语言、排除文件、生成文件、解析失败及项目配置。
- **终端、远程工作区与桌面真机兼容性验收**：当前主要是 GitHub Actions 的 Node.js 接口测试，未覆盖真实 DSH Desktop UI 或 Graphify/PyPI + 外部服务的端到端测试。
- **超大图谱可视化**：超过 20,000 个社区节点或生成 HTML 超过侧栏 32 MiB 读取上限时，关系网络仍无法显示；`graphify_health` 和影响分析的 graph.json 上限为 64 MiB；超过 Graphify 单社区视图上限时不会生成 `graph.html`，状态区会明确提示。
- **安装进度与首启许可**：首次自动建图会静默下载 uv、托管 Python 3.12 和 graphifyy；目前只有状态文案，没有逐行日志、取消或预安装向导。
- **版本适配**：插件固定 Graphify `0.9.92`；上游 v8 当前为 `0.9.94`。CLI 和 HTML 签名已按 0.9.92 验证，升级前仍需回归。未确认新命令在旧引擎的兼容性前，不应自动升级或宣布全部命令可用。

## 权限边界

- 基础自动建图：本地代码解析，不调用外部 AI。
- 默认禁止：安装 Git Hook、修改全局图谱、导入 URL、克隆仓库、额外模型语义提取。
- 操作须由用户在 Graphify 设置中启用相应权限：`advancedActions` 与 `networkActions`；两者默认 `false`。
- 上述 UI 开关只是明确授权策略，不替代外部数据库的独立认证、模型费用上限或仓库安全策略。
- 在真实桌面端验收前，任何非 Node.js 静态验证覆盖的功能均保留 Beta 标记。

## 官方来源

- Graphify v8 README：https://github.com/Graphify-Labs/graphify/tree/v8
- CLI：https://github.com/Graphify-Labs/graphify/blob/v8/graphify/cli.py
- 可选依赖：https://github.com/Graphify-Labs/graphify/blob/v8/pyproject.toml
