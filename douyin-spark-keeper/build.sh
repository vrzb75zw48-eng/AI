#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$PROJECT_DIR/app"
MANIFEST="$APP_DIR/src/main/AndroidManifest.xml"
RES_DIR="$APP_DIR/src/main/res"
JAVA_SRC="$PROJECT_DIR/java-src"
ANDROID_SDK="${ANDROID_SDK:-$HOME/android-sdk}"
PLATFORM_JAR="$ANDROID_SDK/platforms/android-34/android.jar"
BT="$ANDROID_SDK/build-tools/34.0.0"
LIB="$BT/lib"
OUT="$PROJECT_DIR/build"

echo "=== Spark Keeper 构建 ==="
echo "项目目录:  $PROJECT_DIR"
echo "SDK 路径:  $ANDROID_SDK"

QEMU="qemu-x86_64"

mkdir -p "$OUT"/{compiled,gen,classes,dex}

echo "[1/5] 编译资源 (aapt2 compile)…"
$QEMU "$BT/aapt2" compile --dir "$RES_DIR" -o "$OUT/compiled/"

echo "[2/5] 链接资源 (aapt2 link)…"
$QEMU "$BT/aapt2" link \
    "$OUT/compiled/"*.flat \
    -o "$OUT/resources.apk" \
    -I "$PLATFORM_JAR" \
    --manifest "$MANIFEST" \
    --java "$OUT/gen/" \
    --output-text-symbols "$OUT/res.txt"

echo "[3/5] 编译 Java (javac)…"
JAVAC_SOURCES=$(find "$JAVA_SRC" -name "*.java")
R_JAVA="$OUT/gen/com/douyin/sparkkeeper/R.java"
javac \
    --release 8 \
    -cp "$PLATFORM_JAR" \
    -d "$OUT/classes" \
    "$R_JAVA" \
    $JAVAC_SOURCES

echo "[4/5] 转 DEX (d8)…"
CLASSES_LIST=$(find "$OUT/classes" -name "*.class" | tr '\n' ' ')
java -Xmx2G -cp "$LIB/d8.jar" com.android.tools.r8.D8 \
    --lib "$PLATFORM_JAR" \
    --release \
    --output "$OUT/dex/" \
    $CLASSES_LIST

echo "[5/5] 组装 + 签名 APK…"
cp "$OUT/resources.apk" "$OUT/spark-keeper-unsigned.apk"
(cd "$OUT/dex" && zip -q ../spark-keeper-unsigned.apk classes.dex)

KEYSTORE="$HOME/.android/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair \
        -keystore "$KEYSTORE" \
        -storepass android -keypass android \
        -alias androiddebugkey \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US" 2>/dev/null
    echo "已生成 debug keystore: $KEYSTORE"
fi

java -Xmx1G -jar "$LIB/apksigner.jar" sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:android \
    --key-pass pass:android \
    --ks-key-alias androiddebugkey \
    --out "$OUT/spark-keeper-signed.apk" \
    "$OUT/spark-keeper-unsigned.apk"

echo ""
echo "✓ 构建完成！"
echo "APK 路径: $OUT/spark-keeper-signed.apk"
