# DSH-Graphify

把 [Graphify](https://github.com/Graphify-Labs/graphify) 生成的代码知识图谱直接显示在 **DeepSeek Harness (DSH)** 的右侧工作区中，并让 DSH Agent 通过原生工具建立和查询图谱。

> **状态：v0.3.0-beta.2 · 自动图谱预览版。** DSH Desktop 新建/打开本地项目会话时自动构建代码知识图谱，源文件变更后自动更新，右侧 Graphify 面板自动显示结果。仍需在实际 DSH Desktop 上完成联调；当前自动索引仅用于本地代码，不会自动调用大模型分析文档或媒体。

## 主要功能

- **右侧栏原生页面**：从 DSH 会话右侧栏的起始/指南页选择 `Graphify`；不需要新开浏览器。
- **Graphify 可视化**：节点、关系线、社区颜色分组；拖拽画布、滚轮缩放、重置视图。
- **搜索与定位**：搜索节点名称、源文件；查看源文件位置；筛选社区。
- **路径查询**：选中节点，再选择目标，显示两个节点间的最短无向关联路径。
- **原生 Agent 工具**：`graphify_build` 和 `graphify_query`，通过插件自带的运行时管理器调用 Graphify CLI；不将 Agent 提供的内容交给 Shell 解释。
- **自动建立与更新**：打开受沙箱允许的本地项目会话即后台运行 `graphify extract . --code-only`，后续变化约 3 秒防抖、以 `graphify update` 增量刷新，不占用 Agent 对话。
- **实时状态**：右侧栏显示构建、更新、失败、文档内容变动提醒；图谱完成后自动重新加载。
- **免手动安装运行环境**：首次自动构建时安装经 SHA-256 校验的 uv、独立 Python 和官方 Graphify 包，之后复用缓存。
- **生命周期管理**：同项目多个会话共享监听，最后一个会话关闭后停止监听；不扫描沙箱外路径。
- **项目隔离**：可视化图谱通过 DSH 自带 `workspaceFiles` Remote，从**当前会话**所在工作区读取 `graphify-out/graph.json`。
- **无前端 CDN**：UI 依赖 DSH 已有 React 运行时，不加载外部 JavaScript。

## 环境要求

- DeepSeek Harness Desktop / Web **0.2.x**，且包含右侧栏和 `workspaceFiles` Remote。
- 由 DSH 自身提供的 Node.js 22+ Host 环境；**无需在 Windows 手动安装 Python、uv、pip 或 Graphify**。
- **第一次自动构建**需要访问 GitHub Releases 与 PyPI 以下载运行环境和依赖；后续会优先复用隔离缓存。该 beta 不是完全离线安装包。
- 当前通过固定 SHA-256 保护 uv 运行时归档；Graphify Python 包精确固定为 `graphifyy==0.9.92`。

插件下载环境的位置：Windows 为 `%LOCALAPPDATA%\DSH-Graphify\engine-v2`；macOS / Linux 为用户缓存目录中的 `DSH-Graphify/engine-v2`。不会修改系统 PATH。

## 安装到 DSH Desktop

**面向用户：** 打开 DSH Desktop → 插件（Plugins）→ 添加/安装插件，在来源输入框使用 `github:Jov3c/DSH-Graphify`，然后安装并重启 Desktop。如果某个版本不支持在窗口中输入 GitHub 源，可改用相应 Profile 的 CLI 安装方式。

本仓库已经提交 `lib/index.js`、`lib/runtime.js` 和 `lib/client.js` 等预构建产物。安装插件时不需要运行 npm build，也不需要手动安装 Graphify。

可选的 DSH 命令行安装（Desktop 版固定使用 `desktop` Profile）：

```powershell
dsh plugin --profile desktop add github:Jov3c/DSH-Graphify
dsh --profile desktop --dump-config
```

> DSH Desktop 使用专门的 `desktop` Profile；请直接通过 **Desktop 自带的插件管理器** 安装。已安装旧版 GitHub 插件时，通过「已安装插件」卸载旧版、重新安装同一地址并重启即可更新。

## v0.3.0-beta.2 修复说明

- 修复 DSH `workspaceFiles.readBytes` 返回 `RemoteResult` 时字段解包错误（此前会显示 `Unexpected end of JSON input`）。
- 插件激活时从 `ctx.sessions.list()` 补接管已经恢复的本地项目会话；避免错过 `session/created`。
- 如果 graph.json 尚不存在，显示明确的等待/构建提示，而不是 JSON 解析失败。
- 若从上一版更新，请使用 DSH Desktop 插件管理：卸载旧版、重新添加本仓库 URL 并重新启用，必要时重启 Desktop。
- 尚未在真实 DSH Desktop 安装环境完成端到端验证；GitHub CI 只覆盖模拟接口和 Node 测试。

## 使用方法

### 1. 自动后台构建

在 DSH Desktop **新建或打开本地项目会话**，无需向 Agent 发送额外指令。Host 监听 `session/created` 事件，从该会话的 `header.cwd` 获取项目路径，经过真实路径和 DSH 沙箱根目录校验后启动任务：无图谱时运行 `graphify extract . --code-only`，有缓存时运行 `graphify update`。首次使用由插件在自己的缓存目录自动准备 uv/Python/Graphify（需要联网），不会弹出 PowerShell 或占用 AI Token。

生成在该项目的 `graphify-out/graph.json`、`graphify-out/GRAPH_REPORT.md` 等。插件另写 `graphify-out/.dsh-graphify-status.json` 用于显示进度和错误。对于源码修改，以约 3 秒防抖触发 `graphify update`；Git 与 node_modules 等输出目录不会触发重建。文档或图片变更只提醒需语义更新，**不会自动调用 LLM**。

多个会话打开同一目录只维护一份监听；关闭最后一个会话会关闭监听。若项目在沙箱外、使用远端工作区或不支持递归文件监听，则不会越权扫描；仍可使用 `graphify_build` 明确构建。设置 Host 环境变量 `DSH_GRAPHIFY_AUTO=0` 可关闭自动模式。

### 可选：手动调用 Agent 工具

自动构建失败时，可以在当前会话要求 Agent 使用 `graphify_build`。`directory` 默认 DSH 沙箱工作区根目录，项目位于子目录时应明确提供相对路径。

### 2. 在 DSH 内查看

打开当前 DSH 会话 → 展开**右侧栏** → 进入指南/空白页 → 点击 **Graphify**。页面读取当前会话的 `graphify-out/graph.json`。可以搜索、拖动、缩放和追踪关系路径。

后台构建完成后图谱会自动刷新；也可点击 **Refresh** 重新读取文件。可视化当前只显示前 **800 节点 / 4500 关联**（防止大型图谱堵塞 UI），总数仍会显示；复杂大仓库建议进一步增加聚合或局部加载。

### 3. AI 图谱查询

> 用 `graphify_query` 工具分析 UserService 到 Database 之间的依赖。

Host 通过插件管理的 Graphify CLI 调用 `graphify query <question>`，返回文本结果。查询不直接操作 UI；UI 的路径高亮由人选择起点和终点。

## 安全与限制

- 首次构建会下载并执行官方 uv 可执行程序，再从 PyPI 下载固定版本的 Graphify 和依赖。用户必须信任这些上游来源；该步骤会使用网络，但不应上传项目源码。离线首次运行暂未支持。

- Agent 工具只允许 `sandboxPolicy.workspaceRoot` 目录及其后代；解析 realpath 后验证路径，防止 `..` 或符号链接越界。工具使用 `spawn(shell:false)`，不执行拼接的 Shell 命令。
- 使用 Graphify 的外部文档 / 图像语义抽取时，可能调用你配置的模型服务。源码 AST 解析无需上传模型。选择适当的 Graphify 模式并保护项目数据。
- UI 从 DSH 已有 `workspaceFiles` Remote 读取文件，沿用 DSH 的文件访问策略与大小限制（默认完整文件 32 MiB）。
- **当前版本不支持**：独立的面板内「强制重新构建」按钮、点击源码直接跳转、跨仓库混合图谱、大图聚合、Agent 主动定位图谱节点，以及与 DSH TUI 集成。自动更新只针对受允许的本地会话目录与代码文件；大项目扫描可能占用 CPU。
- 插件不会在 DSH 启动时扫描所有磁盘；**进入本地项目会话会自动触发扫描**，首次扫描可能联网下载引擎；退出会话会关闭监听。
- 部分 DSH 发行版可能存在与目前主分支不兼容的 API 差异；因此须在本机实际试装和反馈报错。

## 研发与检查

本项目不依赖下载 npm 包即可运行自测：

```powershell
node scripts/build.mjs
npm test
```

`src/index.js` 为 Host 侧 Agent 工具和 Session 事件注册，`src/auto.js` 管理自动索引与监听，`src/runtime.js` 管理自动下载安装，`src/client.js` 是浏览器模块工厂的源代码。`scripts/build.mjs` 将客户端包装为 DSH 的 `window.__ModuleLoader__.load({ id, factory })` 入口，并同步 Host、运行时及自动索引文件，输出到 `lib/`。此方法沿用了 DSH 当前正式的模块表加载规范；如后续 DSH 修改引导协议，应同步升级打包逻辑。

## 参考

- [DSH 官方插件打包规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [DSH 右侧栏扩展](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-right/README.md)
- [DSH Workspace Files Remote](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-files/README.md)
- [Graphify 官方仓库](https://github.com/Graphify-Labs/graphify)

## License

MIT。本项目不包含 Graphify 代码；Graphify 按其独立许可证发布。
