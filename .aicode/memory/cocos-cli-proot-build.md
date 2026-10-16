---
name: cocos-cli-proot-build
description: 官方 Cocos CLI（cocos/cocos-cli）在 PRoot 容器：全链路编译命令、npm/npx wrapper、已验证可用的命令，以及 cocos build（Web）卡在 dev-cli 引擎 SystemJS dev 加载（q-bundled fetch）的受限结论与 pnpm `+` 路径坑。
---
# 官方 Cocos CLI（cocos/cocos-cli）在 PRoot 容器

## 环境
- Ubuntu 26.04 PRoot（aarch64，无 DISPLAY）；Node 22.22.1；pnpm 10.6.1；npm/npx 走本地 wrapper（`/root/.aicode/bin/{npm,npx}` → npm 10.9.9）
- 仓库：`/root/cocos-cli`（cocos-cli@0.0.1-alpha.44）
- 全局命令 wrapper：`/root/.aicode/bin/cocos` → `node /root/cocos-cli/dist/cli.js`

## 关键命令
- 全链路编译：`cd /root/cocos-cli && npm run compile`（build:asset-db → prepare-dts → tsc -b → build:platform-views → build:static-web → generate-schema）
- 全量重编 dev-cli 引擎缓存：`cd /root/cocos-cli && node --max-old-space-size=8192 workflow/compiler-engine.js --force`
- 生成引擎声明：`cd /root/cocos-cli/packages/engine && npm run build:declaration`
- 构建 cc-module（生成 node_modules/cc + cc.d.ts）：`cd /root/cocos-cli && npm run build:cc-module`
- postinstall 全流程：`cd /root/cocos-cli && FORCE_UPDATE=true MINIMAL_DOWNLOAD_TOOLS=1 node workflow/postinstall.js`

## 已验证可用
- `dist/cli.js` 编译成功；`cocos --version` / `cocos --help` 正常
- `cocos create --project /root/test-web-project --type 3d` 成功（创建模板项目）

## 受限：`cocos build`（Web / native 出包）
- 卡在 preload 引擎：dev-cli 的 SystemJS 引擎 dev 加载只命中 2/14 个 editor 模块（`cc/editor/2d-misc`、`cc/editor/populate-internal-constants`），其余（含 `cc` 主模块、`cc/editor/serialization`）退化到 Node 原生 fetch 加载 `q-bundled:` URL → `TypeError: Only absolute URLs are supported`
- 出错位置：`packages/engine/bin/.cache/dev-cli/editor/loader.js` 的 SystemJS fetch（`lib_default()(url)` = Node fetch/http）
- 已排查并排除：
  - dev-cli 产物缺失 —— 否，index.js 约 32 万行、1568 个 `System.register` 全在
  - `new Function` 执行截断 —— 否，模拟执行 1568 register 全跑完
  - 缓存损坏 —— 否，全量重编（删 `bin/.cache` 后 `compiler-engine.js --force`）结果相同
- 根因：SystemJS 的 registry 键 与 import 的 `q-bundled` URL 归一化，在 PRoot/aarch64 + Node 22 下，`instantiate` 递归到深层依赖时对不上 registry → 退化 fetch → `q-bundled:` 非合法 http 协议报错。属引擎 dev 编译产物 SystemJS 加载机制的容器环境限制。
- 结论：不改引擎加载路径 / 不换 Node 版本，短期打不通 build。CLI 本身可运行、create 可用。

## 相关
- 换用「编辑器 CLI 生成工程 + Gradle wrapper 出包」的 Android CI 方案与 3.8.8 事实，见记忆 `cocos-android-ci`。

## 坑
- pnpm 的引擎 node_modules 路径含 `+`（如 `@cocos+dragonbones-js`）。引擎声明 `bin/.declarations/cc.d.ts` 会把这些路径编码进 TS 限定名（`__node_modules_pnpm_cocos+dragonbones...`），`+` 是非法标识符 → 主 `tsc -b` 报 `TS1109/TS1005/TS1128` 一片。
  - 修复：对 `packages/engine/bin/.declarations/cc.d.ts` 做全局替换，把 `cocos+dragonbones_js102` 里的 `+` 换成 `_`（每次重新 `build:declaration` 后可能需要再修一次）。