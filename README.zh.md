# dsh-agent-desktop

把 [agent-desktop](https://github.com/vercel-labs/agent-desktop)（基于原生无障碍树的桌面 computer-use 引擎）挂成 **DeepSeek Harness（dsh）插件包**。

装进 profile 之后，模型直接拿到 `mcp__desktop__*` 命名空间下的全部 **75 个工具**：`desktop_snapshot`、`desktop_click`、`desktop_type`、`desktop_screenshot`、`desktop_launch`、`desktop_list_windows`、`desktop_clipboard_get`、`desktop_wait`、`desktop_batch`……

## 安装

```bash
# 1. 桌面引擎（单个二进制，不需要编译工具链）
npm i -g agent-desktop

# 2. harness 插件：作为 bundle 注册，patch 层自动生效
dsh plugin --profile web add github:jyuaner/dsh-agent-desktop

# 3. 重启 profile
dsh web
```

不启动任何东西也能先验证接线：

```bash
npx dsh-agent-desktop doctor
# {
#   "ok": true,
#   "launcher": "C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\agent-desktop\\bin\\agent-desktop",
#   "platform": "win32-x64",
#   ...
# }
# --- agent-desktop status ---
# {"version":"2.6","ok":true,"command":"status","data":{"permissions":{"accessibility":{"state":"granted"}}, …}}
```

然后让模型调 `mcp__desktop__desktop_status` 即可——工具在首个回合之前就已注册完成。

还没装引擎？`npx dsh-agent-desktop setup` 会装好并重新探测。

### 为什么 `agent-desktop` 不做成本插件的 npm 依赖

它刻意保持「运行期发现」，而不是「安装期拉取」。`agent-desktop` 带一个 `postinstall` 用于链接原生二进制，而 pnpm 11 默认拦截未批准的依赖构建脚本并以非零码退出（`ERR_PNPM_IGNORED_BUILDS`）。如果本包把 `agent-desktop` 写成 dependency，`dsh plugin add` 会半途失败、profile 只更新一半。所以引擎由你装一次，适配器负责找到它——探测顺序见下。

## 配置

默认值即可用。要改就在自己的 profile patch 里覆盖条目（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）：

```yaml
- id: agent-desktop
  config:
    serverName: desktop        # 工具变成 mcp__<serverName>__*
    toolCallTimeoutMs: 120000
    command: /usr/local/bin/agent-desktop   # 跳过自动发现
    extraArgs: ["--headed"]    # 追加在 `mcp` 之后
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `serverName` | `desktop` | MCP 命名空间（`mcp__desktop__*`），同一 profile 内需唯一 |
| `command` | 自动发现 | agent-desktop 可执行文件或其 `bin/agent-desktop` launcher 的绝对路径 |
| `extraArgs` | `[]` | `mcp` 之后的额外 CLI 参数（如 `--headed` 走物理输入） |
| `toolCallTimeoutMs` | `120000` | 单次 MCP 调用超时 |
| `failOnStartupError` | `false` | 引擎缺失时抛错而非告警 |

发现顺序：`config.command` → `AGENT_DESKTOP_BIN` / `AGENT_DESKTOP_LAUNCHER` → 从本插件可解析到的包 → npm/pnpm/`PATH` 隐含的各个全局前缀（`%APPDATA%\npm`、`/usr/local`、`~/.local`、`<prefix>/node_modules`、`<prefix>/lib/node_modules`…）。

全都找不到时，插件打印可复制的修复提示并**跳过注册**，让 harness 照常启动——桌面引擎缺失不该把整个会话拖死。

## 工作原理

```
profiles/<name>/package.json   dsh.profile.bundles += dsh-agent-desktop
        │
        └─ cordis.patch.yml    - insert: [{ id: agent-desktop, name: dsh-agent-desktop }]
                 │
                 └─ lib/index.js
                      resolveLauncher()   → …/node_modules/agent-desktop/bin/agent-desktop
                      buildMcpConfig()    → { transport: stdio, command: process.execPath,
                                             args: [launcher, "mcp"], … }
                      @deepseek-ai/dsh-mcp-client.apply(ctx, config)
                                            └─ tools/call → mcp__desktop__*
```

这一层适配器专门处理的三个问题：

| 问题 | 本插件的做法 |
|---|---|
| 静态 patch 必须写死 `command`，但 launcher 路径随系统、架构、安装方式、前缀变化，Windows 上还常带中文路径 | 加载时从自身包与全局前缀解析；`AGENT_DESKTOP_BIN` 可完全覆盖 |
| MCP 桥用 `CreateProcess`/`execve` 直接拉起 `command`，执行不了 npm 在 Windows 生成的 `.cmd` 垫片；裸写 `agent-desktop` 只有走 shell 才能解析 | 统一用 `process.execPath` + `bin/agent-desktop` 启动——全平台都是真可执行文件，且保留 agent-desktop 在 macOS 上的 helper 逻辑 |
| `dsh plugin add` 会把包名追加进 `dsh.profile.bundles`，插件必须自带 patch 层 | 自带 `cordis.patch.yml`，并把连接交给 harness 自带的 `@deepseek-ai/dsh-mcp-client`——只有一套 MCP 桥，不 fork 实现 |

插件只导出 `name`、`inject: ['tools']`、`apply(ctx, config)`，自身不持状态；卸载时 MCP 连接由桥的正常生命周期释放。

## 平台差异

- **Windows**：默认语义投递（无障碍动作），不抢焦点；需要物理输入时加 `extraArgs: ["--headed"]`。
- **macOS**：给运行 `dsh` 的进程授予「辅助功能」；截图另需「屏幕录制」。
- **Linux**：需要带 AT-SPI 的 X11/Wayland 会话，具体矩阵见 agent-desktop 自身说明。

## 冒烟测试

```bash
git clone https://github.com/jyuaner/dsh-agent-desktop && cd dsh-agent-desktop
node test/smoke.mjs
# {
#   "launcher": "…/bin/agent-desktop",
#   "protocolVersion": "2025-06-18",
#   "server": { "name": "agent-desktop", "version": "1.3.1" },
#   "toolCount": 75,
#   "missing": []
# }
# OK
```

它用 `buildMcpConfig()` 产出的**同一份** spawn 配置启动进程，完成 MCP `initialize` → `tools/list` 握手——不需要 harness、profile 或模型。

## 卸载

```bash
dsh plugin --profile web remove dsh-agent-desktop
```

若加过 `id: agent-desktop` 覆盖，一并删掉；`dsh.profile.bundles` 里的条目随包移除。引擎本身不受影响：`npm rm -g agent-desktop`。

## 许可

MIT。`agent-desktop` 为 Apache-2.0，版权归 Vercel Labs；本项目是独立、非官方集成。DeepSeek Harness 为独立产品。