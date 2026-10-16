---
name: iron-curtain-front
description: 《铁幕前线》Three.js 射击游戏的构建/验证命令与三个已踩过的坑
---
# 《铁幕前线》(IRON CURTAIN FRONT)

Three.js + TypeScript + esbuild 的仿战地单机网页 FPS。源码 `src/`，产物 `dist/`（index.html + game.js + styles.css，离线可开）。

## 命令
- 构建：`node build.mjs`（或 `npm run build`）
- 类型检查：`node scripts/typecheck.mjs`（**不要**用 `tsc --noEmit | head`）
- 逻辑测试：`./node_modules/.bin/esbuild scripts/logic-test.ts --bundle --platform=node --format=esm --outfile=/tmp/lt.mjs --log-level=error && node /tmp/lt.mjs`
- 预览：`node serve.mjs`（端口 4173，实时读 dist/）
- 调试：页面暴露全局 `window.game`，可直接读 `state`/`tickets`/`player`/`director`，也可手动 `g.update(1/30)` 驱动逻辑

## 三个坑（均已定位并修复）
1. **管道掩盖退出码**：`tsc --noEmit | head` 会让失败也显示成功。曾因此漏掉 `render()` 里调用已删除的 `this.composer`（TS2339），esbuild 不跑类型检查所以构建照样通过，运行时必崩。必须用脚本捕获退出码。
2. **全局 touchstart 吞掉点击**：`Input.initTouch()` 在 document 上无条件注册 `touchstart`，`onLookStart` 对非摇杆/触控按钮的触摸一律 `preventDefault()`，这会抑制浏览器合成的 click——**触摸设备上所有菜单按钮失效**。修复：排除选择器加入 `.overlay, button, input`（所有 UI 面板都是 `.layer.overlay`，HUD 是 `pointer-events:none`）。
3. **esbuild 把中文转义成大写 `\uXXXX`**：在 bundle 里 grep 中文会失败，需按 `\u5BDF` 这类大写转义匹配，或解码后再比。

## 已知未修问题
- `Game.applySettings()` 不重新应用画质预设：设置面板改画质在当前会话内无效，须刷新页面。画质字段被渲染器/阴影/泛光/粒子/士兵容量/AI 频率/世界植被等**构造期**消费，运行期整体重应用改动较大。
- 载具生成点可能正好落在边界夹紧值（`world.half-6`）上且车头朝外，导致油门踩满也不动，需先调头。