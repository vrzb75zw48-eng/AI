#!/usr/bin/env bash
# ============================================================
# Cocos Creator 3.8.8 官方 CLI 构建（Web + Android + iOS）
# 脱离 dev-cli 引擎 dev 容器：用 Cocos 编辑器内建引擎生成工程。
# Android 只让 Cocos 生成 Gradle 工程（autoCompile=false），出包交给工程自带的
# Gradle wrapper（assembleDebug / assembleRelease / bundleRelease）。
# 核心命令（成功退出码 36；32=参数非法，34=构建过程出错）：
#   CocosCreator --project <p> --build "platform=<plat>;<额外 key=value;...>"
# 前置：Cocos Creator 3.8.8（仅 mac/win；CLI build 需 GUI 环境——
#       macOS 需 WindowServer/agent，Windows 需桌面会话；纯 headless Linux 不行）
# 用法：
#   CC_PROJECT=/p CC_CREATOR=/opt/.../CocosCreator ./cocos-ci-build.sh web
#   CC_PROJECT=... CC_CREATOR=... ANDROID_HOME=... NDK_HOME=... ./cocos-ci-build.sh android
#   CC_BUILD_TYPE=release-apk RELEASE_STORE_FILE=ks.jks RELEASE_STORE_PASSWORD=x \
#     RELEASE_KEY_ALIAS=k RELEASE_KEY_PASSWORD=x ./cocos-ci-build.sh android
#   ./cocos-ci-build.sh ios        # 需 macOS runner + Xcode + 证书
# ============================================================
set -euo pipefail

CC_PROJECT="${CC_PROJECT:?需设 CC_PROJECT（Cocos 工程绝对路径）}"
CC_PROJECT="${CC_PROJECT//\\//}"   # Windows 传入的 C:\a\b 统一成正斜杠，bash 侧才好判断路径
CC_CREATOR="${CC_CREATOR:?需设 CC_CREATOR（Cocos Creator 3.8.8 可执行文件）}"
CC_ENGINE="${CC_ENGINE:-}"                    # 可选：自定义引擎路径（传了则脱离编辑器默认引擎）
CC_BUILD_TYPE="${CC_BUILD_TYPE:-debug-apk}"   # debug-apk | release-apk | aab
CC_PACKAGE="${CC_PACKAGE:-com.aicode.cocosp}" # Android 包名（Cocos android 构建必填）

# 引擎 native/README（v3.8.8）：Android 只支持 NDK 21~22，23+ 不支持
NDK_VER="${NDK_VER:-21.4.7075529}"            # r21e
ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
NDK_HOME="${NDK_HOME:-${ANDROID_HOME:+${ANDROID_HOME}/ndk/${NDK_VER}}}"

# Cocos 3.8.8 生成的工程布局（依 cocos-engine v3.8.8 模板核实）：
#   <项目>/build/android/proj          Gradle 根工程：gradlew / gradle.properties / settings.gradle
#   <项目>/native/engine/android/app   :app 模块；signingConfigs.release 读 RELEASE_* 工程属性
#   <项目>/build/android/{assets,data} 构建资源（gradle.properties 里的 RES_PATH）
#   APK/AAB：build/android/proj/build/CocosGame/outputs/{apk,bundle}/
# 版本组合：AGP 8.10.1 + Gradle wrapper 8.11.1 + JDK 17
PROJ_DIR="${CC_PROJECT}/build/android/proj"

log() { echo "[cocos-ci] $*"; }
die() { log "ERROR: $*"; exit 1; }

ccbuild() { # $1=platform  $2=额外 build 参数（分号分隔，可选）
  local platform="$1"; local extra="${2:-}"
  local params="platform=${platform}"
  [ -n "${extra}" ] && params="${params};${extra}"
  log "=== Cocos 3.8.8 build ${platform} ==="
  set +e
  if [ -n "${CC_ENGINE}" ]; then
    "$CC_CREATOR" --engine "${CC_ENGINE}" --project "${CC_PROJECT}" --build "${params}"
  else
    "$CC_CREATOR" --project "${CC_PROJECT}" --build "${params}"
  fi
  local rc=$?
  set -e
  if [ "${rc}" -eq 36 ]; then
    log "${platform} 构建成功（退出码 36）"
  else
    die "${platform} 构建失败（退出码 ${rc}：32=参数非法 / 34=过程出错；查构建日志）"
  fi
}

# 签名走 Gradle 工程属性：Cocos 模板 native/engine/android/app/build.gradle 的
# signingConfigs.release 读 RELEASE_STORE_FILE / RELEASE_STORE_PASSWORD /
# RELEASE_KEY_ALIAS / RELEASE_KEY_PASSWORD。用 ORG_GRADLE_PROJECT_* 环境变量注入，
# 等价于 -P，且密码不进命令行参数（不会被 ps / 构建日志记录）。
export_signing_env() {
  : "${RELEASE_STORE_FILE:?release 需 RELEASE_STORE_FILE（keystore 文件路径）}"
  : "${RELEASE_STORE_PASSWORD:?release 需 RELEASE_STORE_PASSWORD}"
  : "${RELEASE_KEY_ALIAS:?release 需 RELEASE_KEY_ALIAS}"
  : "${RELEASE_KEY_PASSWORD:?release 需 RELEASE_KEY_PASSWORD}"
  [ -f "${RELEASE_STORE_FILE}" ] || die "keystore 不存在：${RELEASE_STORE_FILE}"
  export ORG_GRADLE_PROJECT_RELEASE_STORE_FILE="${RELEASE_STORE_FILE}"
  export ORG_GRADLE_PROJECT_RELEASE_STORE_PASSWORD="${RELEASE_STORE_PASSWORD}"
  export ORG_GRADLE_PROJECT_RELEASE_KEY_ALIAS="${RELEASE_KEY_ALIAS}"
  export ORG_GRADLE_PROJECT_RELEASE_KEY_PASSWORD="${RELEASE_KEY_PASSWORD}"
}

gradlew_run() { # $@ = gradle 任务与属性
  [ -f "${PROJ_DIR}/settings.gradle" ] || die "未找到 Gradle 工程 ${PROJ_DIR}（Cocos 生成那步失败？）"
  local cmd="./gradlew"
  if [ ! -f "${PROJ_DIR}/gradlew" ]; then
    command -v gradle >/dev/null || die "既无 ${PROJ_DIR}/gradlew 也无系统 gradle"
    cmd="gradle"
  else
    chmod +x "${PROJ_DIR}/gradlew" || true
  fi
  log "=== gradle $* （cwd=${PROJ_DIR}）==="
  ( cd "${PROJ_DIR}" && "${cmd}" "$@" --no-daemon )
}

if [ $# -eq 0 ]; then
  DO_WEB=1; DO_ANDROID=1
else
  DO_WEB=0; DO_ANDROID=0; DO_IOS=0
  for a in "$@"; do case "$a" in
    web) DO_WEB=1;; android) DO_ANDROID=1;; ios) DO_IOS=1;; all) DO_WEB=1; DO_ANDROID=1;;
    *) die "未知目标 '$a'（web|android|ios|all）";;
  esac; done
fi

# ---------- Web（无 NDK；runner 需有 GUI 环境的 Cocos 编辑器）----------
if [ "${DO_WEB}" = "1" ]; then
  ccbuild web-mobile
  log "Web 产物：${CC_PROJECT}/build/web-mobile/（html/js/wasm，可部署 CDN）"
fi

# ---------- Android（JDK 17 + Android SDK + NDK 21/22 + Gradle wrapper）----------
if [ "${DO_ANDROID}" = "1" ]; then
  [ -n "${ANDROID_HOME}" ] || die "android 目标需设 ANDROID_HOME（或 ANDROID_SDK_ROOT）"
  [ -d "${ANDROID_HOME}" ] || die "Android SDK 不存在：${ANDROID_HOME}"
  # NDK r21/r22 只提供 x86_64 宿主工具链，runner 必须是 x86_64（macOS 用 macos-15-intel）
  [ -d "${NDK_HOME}" ] || die "NDK 不存在：${NDK_HOME}（NDK 21/22 无 darwin-arm64 宿主工具链，须 x86_64 runner）"
  command -v java >/dev/null || die "缺 java（Cocos 3.8 的 AGP 8.10.1 需 JDK 17）"
  export ANDROID_SDK_ROOT="${ANDROID_HOME}"
  # Cocos android 插件初始化（onAfterInit）在无 GUI Preferences 时读环境变量找 NDK/SDK：
  # NDK_ROOT / ANDROID_NDK_HOME / ANDROID_HOME / ANDROID_SDK_ROOT 缺一不可（论坛+文档确认）
  export NDK_ROOT="${NDK_HOME}"
  export ANDROID_NDK_HOME="${NDK_HOME}"
  export ANDROID_HOME="${ANDROID_HOME}"
  log "java：$(java -version 2>&1 | head -1)"

  case "${CC_BUILD_TYPE}" in
    debug-apk)   TASKS=(assembleDebug);   DEBUG_OPT=true ;;
    release-apk) TASKS=(assembleRelease); DEBUG_OPT=false; export_signing_env ;;
    aab)         TASKS=(bundleRelease);   DEBUG_OPT=false; export_signing_env ;;
    *) die "CC_BUILD_TYPE 只能是 debug-apk | release-apk | aab（当前：${CC_BUILD_TYPE}）" ;;
  esac

  # packages 参数必须是 JSON 字符串（官方文档："需要存放的是数据对象的序列化字符串"）
  ccbuild android "autoCompile=false;debug=${DEBUG_OPT};packages={\"android\":{\"packageName\":\"${CC_PACKAGE}\",\"sdkPath\":\"${ANDROID_HOME}\",\"ndkPath\":\"${NDK_HOME}\"}};ndkPath=${NDK_HOME};sdkPath=${ANDROID_HOME}"
  gradlew_run "${TASKS[@]}" "-PPROP_NDK_VERSION=${NDK_VER}"

  ART="$(find "${PROJ_DIR}/build" -type f -path '*/outputs/*' \( -name '*.apk' -o -name '*.aab' \) -print)"
  [ -n "${ART}" ] || die "gradle 已完成但没找到 apk/aab，检查 ${PROJ_DIR}/build/"
  log "Android 产物："
  echo "${ART}"
fi

# ---------- iOS（macOS runner + Xcode + 证书）----------
if [ "${DO_IOS}" = "1" ]; then
  command -v xcodebuild >/dev/null || die "iOS 只能在 macOS runner（缺 xcodebuild）"
  ccbuild ios
  log "iOS 产物：${CC_PROJECT}/build/ios/（真机需 Xcode 签名 + 描述文件；xcodebuild -exportArchive 出 .ipa）"
fi

log "CI 构建完成。"
