---
name: cocos-android-ci
description: Cocos 3.8.8 Android CI 出包：Gradle wrapper 主导流程、RELEASE_* 签名属性名、CocosGame 产物路径、NDK/runner 限制与失效 action
---
# Cocos 3.8.8 Android CI 出包（Gradle wrapper 主导）

## 已交付文件（`~/workspace`，用时要拷进 Cocos 工程 repo 根 + `.github/workflows/`）
- `cocos-ci-build.sh`：Cocos 编辑器 CLI 只生成工程（`autoCompile=false`），出包交给 `build/android/proj/gradlew`
- `.github/workflows/cocos-ci-android.yml`（主路径，Intel macOS）/ `cocos-ci-windows.yml`（备选）/ `cocos-ci.yml`（Web+Android+iOS）
- `build-apk`（容器触发 CI + 轮询 + 拉产物到 `./apk-out`）、`build-apk-local`（本地 gradle 打壳）、`gen-keystore`
- `build-apk` 已用 mock GitHub API（`/tmp/mock_gh_test.py`，ThreadingHTTPServer 模拟 dispatch/轮询×3/artifacts/zip 下载）跑通全流程；支持 `GH_API_BASE` 覆盖（自测/GHES）；修过真 bug：轮询处拼出的 Python f-string 是 `df"..."` 非法前缀 → 改为 `json "['status'] + ' ' + str(d['conclusion'] or '')"`
- 脚本必须 `chmod +x`；CI 里用 `bash ./cocos-ci-build.sh <target>` 更稳（不怕丢执行位）

## 核实过的 3.8.8 事实（依 cocos-engine v3.8.8 模板）
- Gradle 根工程 = `<项目>/build/android/proj`（gradlew/gradle.properties/settings.gradle 在此）；`native/engine/android` 只是 `:app` 模块 + 引擎源码，不是出包目录
- AGP **8.10.1** + Gradle wrapper **8.11.1** + JDK **17**；引擎 native/README：NDK 只支持 **21~22**，23+ 不支持
- **release 签名属性名**：`RELEASE_STORE_FILE` / `RELEASE_STORE_PASSWORD` / `RELEASE_KEY_ALIAS` / `RELEASE_KEY_PASSWORD`
  - 模板 `native/engine/android/app/build.gradle` 的 `signingConfigs.release` 只读这四个；旧写法 `-PstoreFile` / `-Pcc.storeFile` 被静默忽略 → **不报错但 apk 未签名**
  - 用 `ORG_GRADLE_PROJECT_RELEASE_*` 环境变量注入等价于 `-P`，密码不进 argv
- **APK/AAB 输出**：`build/android/proj/build/CocosGame/outputs/{apk,bundle}/`（因为 `settings.gradle` 里 `project(':app').name = "CocosGame"`，而 app/build.gradle 的 buildDir 挂在它下面）；**不是** `proj/build/outputs`
- Cocos CLI 退出码：**36=成功**，32=参数非法，34=过程出错；CLI build 需 GUI 环境（macOS 要 WindowServer，Windows 要桌面会话，纯 headless Linux 不行）

## 环境 / 链接（本轮 `curl -I` 实测）
- Cocos 下载直链构建号 121518 有效：mac `CocosCreator-v3.8.8-mac-121518.zip` → 200；Windows 是 `-win-` **不是** `-win32-`（后者 404）
- NDK r21/r22 没有 darwin-arm64 宿主工具链 → Android job **必须** `macos-15-intel`（`macos-latest` 已是 arm64）
- 会直接让 job 失败的 action：`ReactiveCircus/android-build-action`、`apple-actions/import-certificate`、`apple-actions/import-profile`（均 404）
  - 可用替代：`android-actions/setup-android@v4`（装 cmdline-tools 并设 ANDROID_HOME、自动接受 licenses）、`apple-actions/import-codesign-certs@v7`（一个 action 同时吃 `p12-file-base64` + `provisioning-profile`）
- GitHub Actions 顶层只认 `name/on/env/jobs/permissions/concurrency/defaults/run-name`；把 YAML anchor 挂在顶层当“复用片段”会**校验失败**，要复用只能内联
- `secrets` 上下文**不能在步骤的 `if:` 里用**（actionlint 报错）：需要“未配 secrets 就跳过该步”时，先加一个 run 步骤探测（`env: P12: ${{ secrets.X }}` + `echo HAS=${P12:+true} >> $GITHUB_ENV`），再 `if: env.HAS == 'true'`
- 校验工具：`actionlint` v1.7.12 linux_arm64 已下载到 `/tmp/al/actionlint`（在 `~/workspace` 下直接跑，三个 workflow 全绿 exit 0，含外部 action 输入 schema 校验）

## 容器限制（PRoot，aarch64）
- 容器无 `java` / `keytool` / `gradle` / `unzip` / `zip` / `adb` → `gen-keystore`、`build-apk-local` 没法在容器里跑/验证
- `build-apk` 因此改用 `python3` 的 `zipfile` 解压产物 zip
- Python 侧无 pyyaml；验 YAML 可用 `python3 -m venv /tmp/yv && /tmp/yv/bin/pip install pyyaml`