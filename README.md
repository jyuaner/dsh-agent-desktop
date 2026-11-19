<div align="center">

# dsh-agent-desktop

[![GitHub stars](https://img.shields.io/github/stars/jyuaner/dsh-agent-desktop?style=flat-square&label=stars)](https://github.com/jyuaner/dsh-agent-desktop/stargazers)
[![License](https://img.shields.io/badge/license-MIT-3DA639?style=flat-square)](LICENSE)
[![DSH](https://img.shields.io/badge/dsh-bundle%200.1.1-4D6BFE?style=flat-square)](package.json)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![Tests](https://img.shields.io/badge/tests-10%20%2B%201%20passing-brightgreen?style=flat-square)](test/unit.test.mjs)
[![Tools](https://img.shields.io/badge/tools-75-8957E5?style=flat-square)](#装完是什么样)

**给 dsh 里的模型一双手：75 个桌面操作工具，一条命令装上。**

上游 [agent-desktop](https://github.com/vercel-labs/agent-desktop) 早就用原生无障碍树把「看窗口、点按钮、打字、截图」做成了 75 个 MCP 工具。
但 dsh 这边只有通用的 `@deepseek-ai/dsh-mcp-client`：静态 patch 要写死二进制路径，
MCP 桥又拉不起 Windows 的 `.cmd` 垫片，装上先吃一堆 `ENOENT`。
这个包补的就是这一层。

75 个工具 · 一条 `dsh plugin add` · 引擎自动发现 · 不 fork 现有 MCP 桥

当前版本 **0.1.1** · 适配任意带 `dsh-mcp-client` 的 profile · Windows / macOS / Linux

配合 [agent-desktop](https://github.com/vercel-labs/agent-desktop) 使用（由它提供桌面引擎与 75 个工具）· 与 [dsh-pilot](https://github.com/Viger1/dsh-pilot) 叠加更完整（可选：一个管浏览器，一个管桌面）

[English](README.en.md) · 中文

</div>

---

## 一句话说清

```
agent-desktop        让 AI 看见并操作桌面              ← 上游，Rust 单二进制 + MCP
dsh-agent-desktop    把它变成 dsh 的 75 个原生工具      ← 就是这个
                     装完即用，不改一行 YAML
```

装完模型手里多出 `mcp__desktop__*` 一组工具，和 dsh 自带工具同权：

`desktop_snapshot`（读无障碍树、拿 `@ref`）· `desktop_click` · `desktop_type` · `desktop_screenshot` · `desktop_launch` · `desktop_list_windows` · `desktop_clipboard_get` · `desktop_wait` · `desktop_batch` …… 共 75 个。

一次真实调用：`snapshot` 拿到 46 个元素的树 → `click '@sXXXX:e25'` → 再 `snapshot` 校验。
默认走语义投递（无障碍动作），不抢焦点、不动鼠标。

---

## 之前卡在哪三处

上游已经把 MCP 服务写好了，所以「直接用」理论上只差一条 `dsh-mcp-client` 配置。**差的三处都在配置之外。**

### 一、`command` 没法写死

MCP 客户端需要的是一行静态配置，可 `agent-desktop` 的入口路径随系统、架构、安装方式、前缀变化：

| 场景 | 实际路径 |
| --- | --- |
| npm 全局（Windows） | `%APPDATA%\npm\node_modules\agent-desktop\bin\agent-desktop` |
| npm 全局（本机实测） | `D:\软件\ClaudeCode\node_modules\agent-desktop\bin\agent-desktop` |
| pnpm 全局 | `$PNPM_HOME/...` 或 `%LOCALAPPDATA%\pnpm\...` |
| 项目内 | `<repo>/node_modules/agent-desktop/bin/...` |

并且 Windows 上 npm 的全局前缀**经常带中文**——`D:\软件\...` 这种路径写进 YAML 就已经输了一半。

### 二、MCP 桥拉不起 Windows 的垫片

即使写成裸名 `agent-desktop`，桥用 `CreateProcess`/`execve` 直接起进程，**不经过 shell**，npm 生成的 `agent-desktop.cmd` 根本执行不到；`agent-desktop.ps1` 还会因为无 BOM 被 PowerShell 5.1 按 GBK 读成 `D:\杞欢\...`（本机实测报 `CommandNotFoundException`）。

### 三、`dsh plugin add` 要求插件自带 patch 层

`dsh plugin add` 会把包名追加进 `dsh.profile.bundles`，只有 bundle 才带 `cordis.patch.yml`。**光发一个 npm 包不算「能装」**，还得有 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 和一层 `insert` 条目。

顺带一个反直觉的点：把 `agent-desktop` 写成 dependency 反而更糟——它带 `postinstall`，pnpm 11 默认拦截未批准的构建脚本并 `ERR_PNPM_IGNORED_BUILDS` 退出 1，于是 `dsh plugin add` 半途失败、profile 只更新一半（依赖写进去了，bundles 没写）。**实测踩过，所以本包不做硬依赖**，改成运行期发现。

---

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

---

## 它做什么

```
profiles/<name>/package.json   dsh.profile.bundles += dsh-agent-desktop
        │
        └─ cordis.patch.yml    - insert: [{ id: agent-desktop, name: dsh-agent-desktop }]
                 │
                 └─ lib/index.js
                      normalizeConfig()   → 校验 serverName / 超时 / 参数 / env
                      resolveLauncher()   → …/node_modules/agent-desktop/bin/agent-desktop
                      buildMcpConfig()    → { transport: stdio, command: process.execPath,
                                             args: [launcher, "mcp"], … }
                      @deepseek-ai/dsh-mcp-client.apply(ctx, config)
                                            └─ tools/call → mcp__desktop__*
```

- **引擎自动发现**：`config.command` → `AGENT_DESKTOP_BIN` / `AGENT_DESKTOP_LAUNCHER` → 本包依赖 → npm/pnpm/Volta/Scoop/asdf/Homebrew/`PATH` 隐含的各个全局前缀。
- **永远起真可执行文件**：`process.execPath` + `bin/agent-desktop`，全平台绕开 `.cmd` 垫片，同时保留 agent-desktop 在 macOS 上的 helper 逻辑。
- **不 fork 桥**：连接交给 harness 自带的 `@deepseek-ai/dsh-mcp-client`，只有一套 MCP 实现。
- **缺引擎不拖死会话**：打印可复制的修复提示并跳过注册，harness 照常启动；要硬失败就设 `failOnStartupError: true`。
- **自身无状态**：只导出 `name` / `inject: ['tools']` / `apply(ctx, config)`，卸载时连接由桥的生命周期释放。

## 配置

默认值即可用。要改就在自己的 profile patch 里覆盖条目（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）：

```yaml
- id: agent-desktop
  config:
    serverName: desktop        # 工具变成 mcp__<serverName>__*
    toolCallTimeoutMs: 120000
    command: /usr/local/bin/agent-desktop   # 跳过自动发现
    extraArgs: ["--headed"]    # 追加在 `mcp` 之后
    env: {}                    # 给引擎的额外环境变量
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `serverName` | `desktop` | MCP 命名空间（`mcp__desktop__*`），须匹配 `[A-Za-z0-9_-]{1,32}` 且同 profile 内唯一 |
| `command` | 自动发现 | agent-desktop 可执行文件或其 `bin/agent-desktop` launcher 的绝对路径 |
| `extraArgs` | `[]` | `mcp` 之后的额外 CLI 参数（如 `--headed` 走物理输入） |
| `toolCallTimeoutMs` | `120000` | 单次 MCP 调用超时 |
| `env` | `{}` | 给被拉起引擎的额外环境变量，覆盖 harness 清洗后的环境 |
| `failOnStartupError` | `false` | 引擎缺失或命名空间被占用时抛错而非告警 |

所有字段都在适配器里校验，写错一个字段只会得到一句话的错误，而不是桥内部的堆栈。

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| harness 起来了，但没有 `mcp__desktop__*` 工具 | 找不到引擎（启动时插件已告警） | `npm i -g agent-desktop` 或设置 `AGENT_DESKTOP_BIN`，然后重载 |
| `serverName "desktop" is already in use` | 手写的 `dsh-mcp-client` 条目占了同名命名空间 | 删掉那条，或给其中一个设 `config.serverName` |
| 安装时报 `ERR_PNPM_IGNORED_BUILDS` | 你自己把 `agent-desktop` 加成 dependency 了 | 去掉硬依赖；适配器只需要引擎已安装 |
| 工具出现了，但调用说 `desktop_status` 不可用 | 引擎二进制与当前平台/架构不匹配 | `npx dsh-agent-desktop doctor` 会打印解析到的路径和它的 `status` 输出 |
| macOS 上 `desktop_screenshot` 拿不到图 | 缺「屏幕录制」授权 | 系统设置 → 隐私与安全性 → 屏幕录制 → 勾选终端/`dsh` |
| 物理输入不生效 | 默认是语义投递而非合成事件 | 加 `extraArgs: ["--headed"]` |

## 更新

```bash
dsh plugin --profile web add github:jyuaner/dsh-agent-desktop#v0.1.1
```

钉 tag 让更新显式可控；写 `github:jyuaner/dsh-agent-desktop` 则跟随 `main`。改完重启 profile 生效，变更见 [CHANGELOG.md](CHANGELOG.md)。

## 测试

```bash
node --test test/unit.test.mjs   # 默认值、校验、spawn 形状、发现优先级（10 例）
node test/smoke.mjs              # 真跑 MCP initialize → tools/list，不需要 harness
```

冒烟测试用的是 `buildMcpConfig()` 产出的**同一份** spawn 配置：

```
{ "protocolVersion": "2025-06-18",
  "server": { "name": "agent-desktop", "version": "1.3.1" },
  "toolCount": 75, "missing": [] }
OK
```

GitHub Actions 在 Windows / macOS / Linux 跑单测，并在三个平台尝试真实握手（Linux 走 `xvfb-run`）。

## 卸载

```bash
dsh plugin --profile web remove dsh-agent-desktop
```

若加过 `id: agent-desktop` 覆盖，一并删掉；`dsh.profile.bundles` 里的条目随包移除。引擎本身不受影响：`npm rm -g agent-desktop`。

## 许可

MIT。`agent-desktop` 为 Apache-2.0，版权归 Vercel Labs；本项目是独立、非官方集成。DeepSeek Harness 为独立产品。