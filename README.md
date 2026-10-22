# DSH-Graphify

将开源 [Graphify](https://github.com/Graphify-Labs/graphify) 的代码知识图谱集成进 **DeepSeek Harness（DSH）Desktop**：本地索引代码，在右侧栏查看原版交互式图谱，并让 DSH Agent 根据自然语言调用图谱查询工具。

> **当前版本：0.9.2 Beta。** 核心代码建图和原版关系网络已接入；树状图、调用流程与多项高级 CLI 能力已提供入口。Windows / Linux CI 为接口及逻辑测试，**不等于全部功能都已通过真实 DSH Desktop 端到端验收**。详细覆盖范围与待完成项目见 [MIGRATION.md](./MIGRATION.md)。

## 功能

| 分类 | 当前能力 |
| --- | --- |
| 本地代码图谱 | 自动建立及更新 Graphify `graphify-out/graph.json`；默认 `--code-only`，不调用 AI |
| 图谱展示 | 右侧栏原版 vis-network 关系网络、节点搜索、社区图例与详情；可选择原版树状图和调用流程 HTML |
| 主题 | 关系网络默认跟随系统亮暗主题；保留 Graphify 原版手动主题选择 |
| 更新策略 | 默认停止编辑 20 秒后更新，连续两次自动更新至少间隔 180 秒；Agent 手动建图与后台索引共享同一项目任务队列，避免并行扫描；后台更新不立即重置关系网络，切换侧栏标签再返回保留画面 |
| Agent 代码分析 | 项目架构、节点解释、依赖路径、静态影响分析；对动态依赖与共同入口的候选关系标明局限 |
| 诊断与导出 | 图谱节点／边统计、孤点和缺失端点、原版多重图诊断、Wiki / Obsidian / GraphML / HTML 导出 |
| 高级工作流 | Git Hook、PR、社区重聚类、图谱合并／全局登记、记忆／反思、克隆／导入资料等受控操作 |
| 可选能力 | 显式安装官方 Graphify extras、配置后端执行语义提取；默认不启用、不主动上传源码 |

**图谱视图说明：** 首次打开关系网络会加载 `graphify-out/graph.html`。树状图与调用流程需要先分别生成 `GRAPH_TREE.html` 和 `GRAPH_CALLFLOW.html`，在 DSH 中让 Agent 使用 `graphify_view` 对应选项生成，再从右侧栏选择视图；这些原版 HTML 的 JavaScript 仍需访问对应 CDN。找不到视图文件不代表代码图谱为空。

## 安装

### 环境

- DSH Desktop / Web **0.2.x**，包含右侧栏和 `workspaceFiles` Remote；需要 DSH Host Node.js **22+**。
- 首次本地索引会从 GitHub Releases 下载校验后的 **uv**，并从 PyPI 安装固定版本的 **graphifyy 0.9.92**。需要联网；日常建图不调用大模型。
- Windows 缓存目录：`%LOCALAPPDATA%\DSH-Graphify\engine-v2`；macOS / Linux 使用用户缓存目录。不会修改系统 Python 或 PATH。

### Desktop 安装

打开 **DSH Desktop → 插件 → 安装插件**，输入：

```text
github:Jov3c/DSH-Graphify
```

安装后重启 DSH Desktop。已有版本可在插件管理器里重新安装同一来源并重启。仓库包含预构建的 `lib/`，正常安装无需手动编译。

可选的 CLI 安装方式（Desktop Profile）：

```powershell
dsh plugin --profile desktop add github:Jov3c/DSH-Graphify
```

## 使用

1. 在 DSH 中打开一个已授权的**本地项目会话**。插件检查 `graphify-out/`，按设置自动索引代码并更新状态。
2. 打开右侧 **Graphify** 标签。关系网络使用 Graphify 原版 HTML，在受限的 iframe 中运行。
3. 可直接向 Agent 提问，例如：“分析这个项目的模块结构”“登录模块与数据库怎么联系”“修改登录流程可能影响哪些测试”。插件提供原生工具与项目级提示，但是否实际调用由模型和工具权限决定。
4. 新图谱生成时，关系网络只提示**加载最新图谱**，不自动清空你的缩放、位置和筛选。手动刷新会加载新图谱并重置布局。

**手动重建**：在同一项目中，Agent 显式调用 `graphify_build` 会复用正在执行的自动索引，避免重复运行。禁用后台扫描时仍可手动建图，扫描结果与错误会更新右侧状态区；失败不会被报告成成功。

### 主要原生 Agent 工具

| 工具 | 用途 |
| --- | --- |
| `graphify_build` | 建立或更新本地代码图谱 |
| `graphify_query` / `graphify_explain` | 自然语言检索、解释类或函数 |
| `graphify_path` / `graphify_affected` | 跟踪关系、分析变更影响；需结合源码核实 |
| `graphify_health` | 检查图谱规模、索引时间及静态结构异常 |
| `graphify_view` | 生成关系网络 / 树状图 / 调用流程原版 HTML |
| `graphify_export` | 导出 Wiki、Obsidian、GraphML 等 |
| `graphify_workflow` / `graphify_pr` | 查看 Git/PR 状态、冲突及可选分诊 |
| `graphify_git` / `graphify_cluster` | 显式管理 Git Hook、社区聚类 |
| `graphify_merge` / `graphify_global` | 显式合并与登记图谱 |
| `graphify_memory` | 保存查询结果并归纳经验 |
| `graphify_dependencies` / `graphify_semantic` | 安装官方可选依赖、授权后进行语义抽取 |
| `graphify_add` / `graphify_clone` | 授权后导入外部资料或克隆 GitHub 项目 |

工具入口的存在**不表示所有 Graphify 可选依赖、外部服务和后端均已在 Desktop 上完成验证**。

## 设置与安全

右侧 **Graphify → 设置** 提供以下选项：

- **自动更新**：自动、仅打开项目、手动或关闭；扫描防抖 5–120 秒、最短间隔 30–900 秒，默认 20 秒 / 180 秒。
- **Agent 工具建议**：智能使用、仅明确要求、关闭主动使用。不会在普通聊天中强制查询图谱。
- **项目范围**：当前本地项目会话或指定目录白名单；支持排除规则，并尊重 Graphify 自身的忽略配置。
- **高级本地操作**、**联网／AI 操作**：**两者默认关闭**。涉及安装 Git Hook、图谱合并、外部下载、AI 调用或付费 API 的工具受相应权限控制，普通自动代码扫描不触发这些操作。

工具在 DSH 工作区策略根目录内解析真实路径；Node 子进程使用固定命令参数并禁用 Shell 拼接。图谱 HTML 在不授予同源权限的隔离 iframe 中执行，外部脚本仅允许经过校验的原版引用。不要把机密资料提交到图谱输出或外部后端，使用语义分析前应先审核模型服务的隐私与费用设置。

## 已知限制

- 图谱的静态导入、调用关系**不能完整证明**事件、回调、反射、依赖注入等运行时影响范围；影响分析需回到源码与测试核实。
- 原版关系网络、Tree、Call Flow 的 HTML 依赖对应第三方 JS CDN，无法保证纯离线显示。
- Graphify MCP 目前通过 [MCP_SETUP.md](./MCP_SETUP.md) **手动配置**，尚无插件内一键连接和端到端验收。
- Neo4j / FalkorDB 等数据库写入、所有可选媒体解析器、Graphify Guard/Hook 体系的 DSH 深度接入仍未完成；细节见 [MIGRATION.md](./MIGRATION.md)。
- 当前适配以 Graphify 0.9.92 为基准；上游版本变更后需要做兼容性测试。

## 开发与验证

```powershell
npm run check
```

这将根据 `src/` 构建 `lib/`，并运行 Node.js 测试。入口：`src/index.js`（Host / Agent 工具）、`src/auto.js`（会话与索引）、`src/runtime.js`（引擎安装）、`src/capabilities.js`（官方 CLI 集成）、`src/client.js`（右侧栏）。提交前保持 `src/` 与预构建 `lib/` 一致。

## 相关文档

- [MIGRATION.md](./MIGRATION.md)：开源能力迁移矩阵、未完成清单与验收边界
- [MCP_SETUP.md](./MCP_SETUP.md)：Graphify 原版 MCP 的手动连接说明
- [Graphify](https://github.com/Graphify-Labs/graphify)：原版项目
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：宿主项目

## License

本插件采用 [MIT License](./LICENSE)；Graphify 本身由上游项目独立授权。
