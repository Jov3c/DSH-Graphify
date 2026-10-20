# DSH-Graphify

把 [Graphify](https://github.com/Graphify-Labs/graphify) 生成的代码知识图谱直接显示在 **DeepSeek Harness (DSH)** 的右侧工作区中，并让 DSH Agent 通过原生工具建立和查询图谱。

> **状态：v0.1.0 · 可安装源码预览版。** 本仓库已实现插件入口、DSH 右侧栏扩展、可交互 Canvas 图谱和原生 Agent 工具，并通过 Node 侧自动化测试。尚未在使用者的 DSH Web/Desktop 实例上完成端到端验证，不能视为发布版。

## 主要功能

- **右侧栏原生页面**：从 DSH 会话右侧栏的起始/指南页选择 `Graphify`；不需要新开浏览器。
- **Graphify 可视化**：节点、关系线、社区颜色分组；拖拽画布、滚轮缩放、重置视图。
- **搜索与定位**：搜索节点名称、源文件；查看源文件位置；筛选社区。
- **路径查询**：选中节点，再选择目标，显示两个节点间的最短无向关联路径。
- **原生 Agent 工具**：`graphify_build` 和 `graphify_query`，用固定参数的进程调用 Graphify CLI；不将 Agent 提供的内容交给 Shell 解释。
- **项目隔离**：可视化图谱通过 DSH 自带 `workspaceFiles` Remote，从**当前会话**所在工作区读取 `graphify-out/graph.json`。
- **无前端 CDN**：UI 依赖 DSH 已有 React 运行时，不加载外部 JavaScript。

## 环境要求

- DeepSeek Harness **0.2.x**，启用含右侧栏、`workspaceFiles` Remote 的 Web/Desktop 配置。所依据源码接口：`@deepseek-ai/dsh-client-ui-sidebar-right`、`@deepseek-ai/dsh-api-workspace-files`。
- Node.js 22+（DSH Host 使用）。
- Python 3.10+ 与 [Graphify CLI](https://github.com/Graphify-Labs/graphify)。

Windows PowerShell 安装 Graphify：

```powershell
winget install astral-sh.uv
uv tool install graphifyy
# After reopening the terminal:
graphify --help
```

Graphify 在 PyPI 上的官方包名是 `graphifyy`（两个 y）。如果 DSH 的 Host 无法找到 `graphify` 可执行程序，请设置 `DSH_GRAPHIFY_BIN` 为其可执行文件的绝对路径，再启动 DSH。

## 安装到 DSH

1. 下载或 clone 本仓库到电脑；本仓库**已包含预构建**的 `lib/index.js` 和 `lib/client.js`，不需要运行 npm build。
2. 在 DSH 所用的 PowerShell 或终端中执行（请将目录改为实际位置）：

```powershell
# Assuming this terminal is at the parent directory of DSH-Graphify
# Install into DSH's web profile (replace with your existing profile name)
dsh plugin --profile web add ./DSH-Graphify

# Verify the composed bundle configuration
dsh --profile web --dump-config

# Restart the profile
dsh web --profile web
```

> 使用既有 profile 时，把 `web` 改成实际名称。不同发行版的启动参数可能稍有不同，请以 `dsh --help` 输出为准。插件必须在含 `@deepseek-ai/dsh-base`、Web UI/右侧栏及 workspace-files 的组合中启动。

也可以从 GitHub 直接安装（需具有访问 GitHub 的网络）：

```powershell
dsh plugin --profile web add github:Jov3c/DSH-Graphify
```

这个仓库提交了 `lib/`，因此 Git 安装不依赖 package prepare/build 脚本；避免 pnpm >=10 自动构建白名单问题。

## 使用方法

### 1. 构建当前项目图谱

在**项目根目录**的终端中运行：

```powershell
graphify .
```

Graphify 会生成：

```text
graphify-out/
  graph.json
  graph.html
  GRAPH_REPORT.md
```

也可以要求 DSH Agent：

> 请使用 `graphify_build` 工具为当前工作区生成 Graphify 知识图谱。完成后告诉我打开右侧栏的 Graphify 页。

`graphify_build` 的 `directory` 参数默认为 DSH 的 `sandboxPolicy.workspaceRoot`，如果实际项目在其子目录中，需要让 Agent **明确传入该子目录**；或者直接在项目根目录运行 `graphify .`。由于 DSH Session 的 cwd 与沙箱根目录不一定相同，工具不会猜测路径。

### 2. 在 DSH 内查看

打开当前 DSH 会话 → 展开**右侧栏** → 进入指南/空白页 → 点击 **Graphify**。页面读取当前会话的 `graphify-out/graph.json`。可以搜索、拖动、缩放和追踪关系路径。

首次构建或更新后点击 **Refresh**。可视化当前只显示前 **800 节点 / 4500 关联**（防止大型图谱堵塞 UI），总数仍会显示；复杂大仓库建议进一步增加聚合或局部加载。

### 3. AI 图谱查询

> 用 `graphify_query` 工具分析 UserService 到 Database 之间的依赖。

Host 通过 `graphify query <question>` 调用 Graphify，返回文本结果。查询不直接操作 UI；UI 的路径高亮由人选择起点和终点。

## 安全与限制

- Agent 工具只允许 `sandboxPolicy.workspaceRoot` 目录及其后代；解析 realpath 后验证路径，防止 `..` 或符号链接越界。工具使用 `spawn(shell:false)`，不执行拼接的 Shell 命令。
- 使用 Graphify 的外部文档 / 图像语义抽取时，可能调用你配置的模型服务。源码 AST 解析无需上传模型。选择适当的 Graphify 模式并保护项目数据。
- UI 从 DSH 已有 `workspaceFiles` Remote 读取文件，沿用 DSH 的文件访问策略与大小限制（默认完整文件 32 MiB）。
- **当前版本不支持**：自动实时更新、点击源码直接跳转、跨仓库混合图谱、大图聚合、Agent 主动定位图谱节点，以及与 DSH TUI 集成。
- 不会自动安装 Graphify，也不会执行用户没有要求的扫描。
- 部分 DSH 发行版可能存在与目前主分支不兼容的 API 差异；因此须在本机实际试装和反馈报错。

## 研发与检查

本项目不依赖下载 npm 包即可运行自测：

```powershell
node scripts/build.mjs
npm test
```

`src/index.js` 为 Host 侧 Agent 工具，`src/client.js` 是浏览器模块工厂的源代码。`scripts/build.mjs` 将它包装为 DSH 的 `window.__ModuleLoader__.load({ id, factory })` 入口，输出到 `lib/`。此方法沿用了 DSH 当前正式的模块表加载规范；如后续 DSH 修改引导协议，应同步升级打包逻辑。

## 参考

- [DSH 官方插件打包规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [DSH 右侧栏扩展](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-right/README.md)
- [DSH Workspace Files Remote](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-files/README.md)
- [Graphify 官方仓库](https://github.com/Graphify-Labs/graphify)

## License

MIT。本项目不包含 Graphify 代码；Graphify 按其独立许可证发布。
