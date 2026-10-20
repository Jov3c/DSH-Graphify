# DSH-Graphify

把 [Graphify](https://github.com/Graphify-Labs/graphify) 生成的代码知识图谱直接显示在 **DeepSeek Harness (DSH)** 的右侧工作区中，并让 DSH Agent 通过原生工具建立和查询图谱。

> **状态：v0.2.0-beta.1 · Desktop 原生插件预览版。** 在 DSH Desktop 中直接安装本插件即可使用；不要求用户先安装 Python、uv 或 Graphify。首次明确要求建立知识图谱时，插件自动下载并在专用目录配置分析引擎，需要互联网连接。尚未完成 DSH Desktop 实机端到端验证，不能视为稳定版。

## 主要功能

- **右侧栏原生页面**：从 DSH 会话右侧栏的起始/指南页选择 `Graphify`；不需要新开浏览器。
- **Graphify 可视化**：节点、关系线、社区颜色分组；拖拽画布、滚轮缩放、重置视图。
- **搜索与定位**：搜索节点名称、源文件；查看源文件位置；筛选社区。
- **路径查询**：选中节点，再选择目标，显示两个节点间的最短无向关联路径。
- **原生 Agent 工具**：`graphify_build` 和 `graphify_query`，通过插件自带的运行时管理器调用 Graphify CLI；不将 Agent 提供的内容交给 Shell 解释。
- **免手动安装运行环境**：首次构建时自动准备校验过的 uv、专属 Python 和官方 Graphify 包，之后复用缓存。
- **项目隔离**：可视化图谱通过 DSH 自带 `workspaceFiles` Remote，从**当前会话**所在工作区读取 `graphify-out/graph.json`。
- **无前端 CDN**：UI 依赖 DSH 已有 React 运行时，不加载外部 JavaScript。

## 环境要求

- DeepSeek Harness Desktop / Web **0.2.x**，且包含右侧栏和 `workspaceFiles` Remote。
- 由 DSH 自身提供的 Node.js 22+ Host 环境；**无需在 Windows 手动安装 Python、uv、pip 或 Graphify**。
- **首次构建**需要访问 GitHub Releases 与 PyPI 以下载运行环境和依赖；后续会优先复用隔离缓存。该 beta 不是完全离线安装包。
- 当前通过固定 SHA-256 保护 uv 运行时归档；Graphify Python 包精确固定为 `graphifyy==0.9.92`。

插件下载环境的位置：Windows 为 `%LOCALAPPDATA%\DSH-Graphify\engine-v2`；macOS / Linux 为用户缓存目录中的 `DSH-Graphify/engine-v2`。不会修改系统 PATH。

## 安装到 DSH Desktop

**面向用户：** 打开 DSH Desktop → 插件（Plugins）→ 添加/安装插件，在来源输入框使用 `github:Jov3c/DSH-Graphify`，然后安装并重启 Desktop。如果某个版本不支持在窗口中输入 GitHub 源，可改用相应 Profile 的 CLI 安装方式。

本仓库已经提交 `lib/index.js`、`lib/runtime.js` 和 `lib/client.js` 等预构建产物。安装插件时不需要运行 npm build，也不需要手动安装 Graphify。

可选的 DSH 命令行安装（`desktop` 只是示意 Profile 名，请换成你本机 Desktop 当前使用的 Profile）：

```powershell
dsh plugin --profile desktop add github:Jov3c/DSH-Graphify
dsh --profile desktop --dump-config
```

> Desktop 可能使用不同 Profile，不能默认认为它是 `web` 或 `desktop`。安装到不使用的 Profile 时，窗口里不会出现插件。

## 使用方法

### 1. 在当前 DSH 项目内构建图谱

在 DSH Desktop 的当前项目会话直接告诉 Agent：

> 使用 `graphify_build` 为当前项目生成知识图谱；如果这是第一次使用，可以自动准备插件私有的 Graphify 运行环境。生成后告诉我打开右侧 Graphify。

首次构建时，插件在自己的缓存目录下载并校验 uv，再自动配置 Python 3.12 和 Graphify 0.9.92。**无需用户在系统 PowerShell 输入任何安装命令**。首次联网准备可能需要等待；下载失败会显示明确错误，可重新尝试。

Graphify 在当前项目中生成 `graphify-out/graph.json`、`graph.html` 和 `GRAPH_REPORT.md`。后续构建优先复用安装好的引擎。

**路径说明**：`graphify_build` 的 `directory` 默认是 DSH 的沙箱工作区根目录；如果当前项目位于其子目录，请在 Agent 指令中指定正确的项目目录。右侧图谱视图从所选会话工作区读取输出，必须保持两者一致。

### 2. 在 DSH 内查看

打开当前 DSH 会话 → 展开**右侧栏** → 进入指南/空白页 → 点击 **Graphify**。页面读取当前会话的 `graphify-out/graph.json`。可以搜索、拖动、缩放和追踪关系路径。

首次构建或更新后点击 **Refresh**。可视化当前只显示前 **800 节点 / 4500 关联**（防止大型图谱堵塞 UI），总数仍会显示；复杂大仓库建议进一步增加聚合或局部加载。

### 3. AI 图谱查询

> 用 `graphify_query` 工具分析 UserService 到 Database 之间的依赖。

Host 通过插件管理的 Graphify CLI 调用 `graphify query <question>`，返回文本结果。查询不直接操作 UI；UI 的路径高亮由人选择起点和终点。

## 安全与限制

- 首次构建会下载并执行官方 uv 可执行程序，再从 PyPI 下载固定版本的 Graphify 和依赖。用户必须信任这些上游来源；该步骤会使用网络，但不应上传项目源码。离线首次运行暂未支持。

- Agent 工具只允许 `sandboxPolicy.workspaceRoot` 目录及其后代；解析 realpath 后验证路径，防止 `..` 或符号链接越界。工具使用 `spawn(shell:false)`，不执行拼接的 Shell 命令。
- 使用 Graphify 的外部文档 / 图像语义抽取时，可能调用你配置的模型服务。源码 AST 解析无需上传模型。选择适当的 Graphify 模式并保护项目数据。
- UI 从 DSH 已有 `workspaceFiles` Remote 读取文件，沿用 DSH 的文件访问策略与大小限制（默认完整文件 32 MiB）。
- **当前版本不支持**：自动实时更新、点击源码直接跳转、跨仓库混合图谱、大图聚合、Agent 主动定位图谱节点，以及与 DSH TUI 集成。
- 不会在插件加载或 DSH 启动时自动下载。首次使用 `graphify_build` 是明确的构建动作，该操作可能联网下载安装引擎；不会执行用户没有要求的项目扫描。
- 部分 DSH 发行版可能存在与目前主分支不兼容的 API 差异；因此须在本机实际试装和反馈报错。

## 研发与检查

本项目不依赖下载 npm 包即可运行自测：

```powershell
node scripts/build.mjs
npm test
```

`src/index.js` 为 Host 侧 Agent 工具，`src/runtime.js` 管理自动下载安装，`src/client.js` 是浏览器模块工厂的源代码。`scripts/build.mjs` 将客户端包装为 DSH 的 `window.__ModuleLoader__.load({ id, factory })` 入口，并同步 Host 与运行时文件，输出到 `lib/`。此方法沿用了 DSH 当前正式的模块表加载规范；如后续 DSH 修改引导协议，应同步升级打包逻辑。

## 参考

- [DSH 官方插件打包规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [DSH 右侧栏扩展](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-right/README.md)
- [DSH Workspace Files Remote](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-files/README.md)
- [Graphify 官方仓库](https://github.com/Graphify-Labs/graphify)

## License

MIT。本项目不包含 Graphify 代码；Graphify 按其独立许可证发布。
