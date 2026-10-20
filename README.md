# DSH-Graphify

把 [Graphify](https://github.com/Graphify-Labs/graphify) 生成的代码知识图谱直接显示在 **DeepSeek Harness (DSH)** 的右侧工作区中，并让 DSH Agent 通过原生工具建立和查询图谱。

> **状态：v0.7.0-beta.1 · Graphify 原版渲染器内嵌预览版。** 右侧 Graphify 面板直接读取项目生成的 graphify-out/graph.html，使用原版 vis-network 交互式物理布局、社区图例、搜索和节点详情，保留自动索引、配置、Agent 工具。已提供沙箱隔离及 CI 测试，真实 DSH Desktop 图形渲染仍待验证。

## 自然语言自动使用图谱（v0.7.0-beta.1）

**不需要记住或输入工具名称。** 在本地项目会话里，用户直接说“分析项目架构”“登录模块有什么依赖”“修改用户模型会影响哪些地方”等，DSH Agent 就会收到插件注册的、面向当前项目的工具使用指导，根据问题尝试选择已有的 Graphify 图谱工具。它通过 DSH 官方 `systemPrompt.section()` 注入动态系统提示，不改写工作区的 `AGENTS.md`，不会擅自写入 Hook/Skill，也不影响普通非项目对话。

使用策略位于右侧 **Graphify → ⚙ 设置 → Agent 自然语言图谱使用策略**：

| 策略 | 默认 | 使用方式 |
| --- | --- | --- |
| 智能使用 | ✅ | 项目架构、依赖、调用链、改动影响等问题优先使用已有图谱；普通聊天不强制调用 |
| 仅明确要求 | | 用户明确说“用图谱”“用 Graphify”时才建议调用图谱工具，仍可用普通自然语言 |
| 关闭主动使用 | | 不向模型注入 Graphify 优先指导，手动点名 Graphify 工具仍可使用 |

**与自动扫描设置的区别**：Agent 使用策略控制“会不会主动考虑图谱”；扫描模式控制“后台何时自动建立、更新图谱”。如果项目没有 `graph.json`，Agent 只会在自动索引已允许、适合当前任务且没有后台构建时考虑建图；“手动/关闭”扫描模式下，不会根据普通项目提问主动启动构建。图谱结果仍需结合源码验证，不能代替真实代码审查。

**能力边界**：以上是 DSH 官方系统提示与原生工具接口的集成，工具最终是否被调用由当前模型、模型工具权限和会话环境共同决定；不是一个拦截所有用户消息的强制工具路由器。此版本未做真实 Desktop GUI 端到端验收。

## 核心功能

- **Graphify 原版可视化**：DSH 右侧原生标签页加载 `graphify-out/graph.html`，直接使用上游 vis-network 力导向布局、社区筛选、节点搜索与点击详情；在隔离的 iframe 中运行，并非插件自绘的简化 Canvas。
- **本地代码图谱**：项目会话创建或打开时自动执行官方 `graphify extract . --code-only`。基础索引不调用大模型、不产生 AI 语义抽取费用。
- **增量更新与控制**：监听源代码保存并防抖更新；设置面板支持自动/仅打开/手动/关闭、工作区白名单、扫描排除规则和 1–15 秒防抖，保存到 DSH Host 配置。
- **自然语言 Agent 工具选择**：通过 DSH 官方系统提示机制，按项目会话动态注入图谱优先指导；可选择智能使用、仅明确要求或关闭主动使用。
- **五个 Agent 工具**：`graphify_build`（安全代码构建）、`graphify_query`（自然语言局部查询）、`graphify_path`（双节点路径）、`graphify_explain`（节点关系解释）、`graphify_affected`（修改影响分析）。
- **可靠性提示**：图谱输出状态区分 `graph.json` 和 `graph.html`；部分很小的图谱可能没有可用的 HTML，可在状态栏查看原因。
- **引擎自动准备**：首次使用会下载校验后的 uv、独立 Python 和 Graphify，之后复用缓存。不修改系统 Python 或 PATH。
- **会话与扫描范围隔离**：索引目录必须属于 DSH 会话策略允许的本地项目，不会自动扫描其他磁盘、其他工作区或跨仓库图谱。

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

## v0.7.0-beta.1 更新内容（包含 v0.6 的功能）

- 新增官方 Graphify CLI 的 `path`、`explain`、`affected` 对应 DSH Agent 工具；加上 `build`、`query`，合计五项工具。Agent 能主动选择适当的图谱查询，但尚未接入“每次自动查询”策略或 Agent 与图谱节点双向联动。
- `graphify_build` 默认行为修正为 `extract . --code-only`，同时应用设置的扫描排除规则；不会因项目已有 API Key 自动进入付费语义提取。
- 将原版 HTML 是否生成单独记录为 `htmlAvailable`；当原版因内容太少/社区不足而跳过 HTML 时，状态说明原因，不误报完成可视化。
- 切换扫描模式或工作区白名单时，不让旧后台任务完成后覆盖暂停状态；更改 `.gitignore` / `.graphifyignore` 触发重新索引。
- 删除旧自绘 Canvas 和对应测试；图谱页面只呈现原版 Graphify HTML。
- Windows/Linux 自动化测试作为验收；**真实 DSH Desktop 原版图谱交互、设置持久化和权限行为仍需本机实测**。

## 原版 Graphify 在 DSH 中查看（v0.7.0-beta.1）

打开 DSH Desktop 项目会话 → 右侧 **Graphify**。插件直接读取 **当前会话目录的 graphify-out/graph.html**，而不是基于 JSON 手工仿制一张图。显示内容保留了上游 Graphify v8 的 vis-network 力导向物理布局、节点大小、社区图例、搜索、筛选、节点详情和 Light/Dark/System 主题控件。右侧顶部继续保留自动索引状态、刷新、⚙ 设置。

原始 Graphify HTML 在单独 Blob iframe 中通过 sandbox="allow-scripts" 执行，不附加 allow-same-origin；附加限制性 CSP，阻断 connect-src、嵌套框架和表单，限制脚本来源为原版固定 SRI 的 vis-network 9.1.6 CDN 与页面自带脚本。只接受带原版固定渲染签名的 HTML，不对任意项目 HTML 启用脚本。

**运行限制：** 上游 graph.html 使用 unpkg.com 上的 vis-network 9.1.6；首次显示需要能访问该域名。若 DSH Desktop 版本的宿主 CSP 进一步阻断 Blob iframe 或外部脚本，可能不能渲染，这需要实机检验并在下一阶段处理离线脚本资源。iframe 是独立、无特权的文档，无法直接访问 DSH 内部 API；Graphify 原版在无同源存储的隔离环境中，可能无法持久记住主题设置。

生成项目图谱仍然由插件自动触发的 Graphify CLI 负责，只解析代码，不产生 AI Token。图谱文件按原版生成；如果原版未输出 graph.html，面板会提示等待或错误，不会静默退回自研 Canvas。

## 原生设置面板（v0.7.0-beta.1）

在 DSH Desktop 中打开项目 → 右侧 **Graphify → ⚙ 设置**。设置由 DSH 官方 `configForms` / Host 设置文档持久化，不依赖浏览器 LocalStorage。选择后点击 **保存设置**；Host 的 `loader/volatile-update` 事件会在不重启插件的情况下更新运行时规则。

| 选项 | 默认 | 行为 |
| --- | --- | --- |
| 自动触发 | 自动 | 项目会话创建时构建；本地源码保存后 3 秒防抖增量分析 |
| Agent 图谱使用策略 | 智能使用 | 基于当前项目和图谱状态提示 Agent 用自然语言智能选用 Graphify 工具；可选仅明确要求或关闭主动使用 |
| 轻量模式 | - | 仅在项目会话打开时刷新，不持续监听文件 |
| 手动模式 | - | 不自动扫描；用户明确让 Agent 使用 `graphify_build` 时仍可执行 |
| 关闭模式 | - | 不调度任何后台分析；Agent 工具仍可独立使用 |
| 扫描工作区 | 本地会话项目 | 只能扫描当前已激活的本地项目目录 |
| 白名单 | 空 | 开启白名单模式后只会自动扫描**绝对路径精确匹配**的项目；空白名单表示不自动扫描任何项目 |
| 防抖 | 3 秒 | 1–15 秒，仅自动监听模式生效 |
| 排除规则 | 常见依赖目录、敏感文件 | 每行一个，通过 Graphify `extract --code-only --exclude` 传递给真实扫描器 |
| 自动 AI 分析 | 始终禁用 | 设置面板只作状态说明；自动构建绝不调用 LLM |

**注意**：Graphify 官方的 `extract . --code-only` 在存在图谱时自动进行增量更新，因此自动构建统一使用这一命令，以免 `update` 绕过本插件设置的排除规则。更改扫描规则会重新评估该项目，正在运行的旧扫描可能先完成。

项目自己的 `.gitignore` 和 `.graphifyignore` 继续生效。排除规则属于索引层过滤，不是操作系统级权限沙箱；切换规则之前已存在的旧图谱可能需要重新生成才能完全排除历史数据。

## 使用方法

### 1. 自动后台构建

在 DSH Desktop **新建或打开本地项目会话**，无需向 Agent 发送额外指令。Host 监听 `session/created` 事件，从该会话的 `header.cwd` 获取项目路径，经过真实路径和 DSH 沙箱根目录校验后启动任务：无图谱时运行 `graphify extract . --code-only`，有缓存时运行 `graphify extract . --code-only` 的增量模式。首次使用由插件在自己的缓存目录自动准备 uv/Python/Graphify（需要联网），不会弹出 PowerShell 或占用 AI Token。

生成在该项目的 `graphify-out/graph.json`、`graphify-out/GRAPH_REPORT.md` 等。插件另写 `graphify-out/.dsh-graphify-status.json` 用于显示进度和错误。对于源码修改，采用配置的 1–15 秒防抖后触发 `graphify extract . --code-only` 增量更新；Git 与 node_modules 等输出目录不会触发重建。文档或图片变更只提醒需语义更新，**不会自动调用 LLM**。

多个会话打开同一目录只维护一份监听；关闭最后一个会话会关闭监听。若项目在沙箱外、使用远端工作区或不支持递归文件监听，则不会越权扫描；仍可使用 `graphify_build` 明确构建。设置 Host 环境变量 `DSH_GRAPHIFY_AUTO=0` 可关闭自动模式。

### 可选：手动调用 Agent 工具

自动构建失败时，可以在当前会话要求 Agent 使用 `graphify_build`。`directory` 默认 DSH 沙箱工作区根目录，项目位于子目录时应明确提供相对路径。

### 2. 在 DSH 内查看

打开当前 DSH 会话 → 展开**右侧栏** → 进入指南/空白页 → 点击 **Graphify**。页面读取当前会话的 `graphify-out/graph.html`，在沙箱中呈现 **Graphify 原版** 的网络、社区图例、节点详情、原生搜索和过滤。

后台构建完成后图谱会自动刷新；也可点击 **Refresh** 重新读取文件。原版 HTML 的大图谱性能和社区聚合行为以 Graphify 自己的导出规则为准，不再使用我们旧 Canvas 的 800 节点显示上限。

### 3. 五项原生 Agent 工具

> 用 `graphify_query` 工具分析 UserService 到 Database 之间的依赖。

Host 通过插件管理的原版 Graphify CLI 调用 `query`、`path`、`explain`、`affected`，返回文本结果；工具调用前检查当前项目的 `graph.json` 是否存在，并限制会话授权目录。Agent 可选择图谱查询，但还不能自动让 UI 选中图谱节点。

## 安全与限制

- 首次构建会下载并执行官方 uv 可执行程序，再从 PyPI 下载固定版本的 Graphify 和依赖。用户必须信任这些上游来源；该步骤会使用网络，但不应上传项目源码。离线首次运行暂未支持。

- Agent 工具只允许 `sandboxPolicy.workspaceRoot` 目录及其后代；解析 realpath 后验证路径，防止 `..` 或符号链接越界。工具使用 `spawn(shell:false)`，不执行拼接的 Shell 命令。
- 使用 Graphify 的外部文档 / 图像语义抽取时，可能调用你配置的模型服务。源码 AST 解析无需上传模型。选择适当的 Graphify 模式并保护项目数据。
- Graphify HTML iframe 内的脚本会通过浏览器从 unpkg.com 加载固定的 vis-network 版本，不会对上游代码或 Graphify 引擎授予 DSH Host 权限。
- UI 从 DSH 已有 `workspaceFiles` Remote 读取文件，沿用 DSH 的文件访问策略与大小限制（默认完整文件 32 MiB）。
- **当前版本不支持**：自动 LLM 语义分析、独立的面板内「强制重新构建」按钮、点击源码直接跳转、跨仓库混合图谱、Agent 主动定位图谱节点，以及与 DSH TUI 集成。自动更新只针对受允许的本地会话目录与代码文件；大项目扫描可能占用 CPU。
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
