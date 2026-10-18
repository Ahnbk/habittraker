#!/usr/bin/env bash
# 밥찰칵 APK 빌드 (Android Studio/Gradle 없이). Ubuntu: sudo apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-21-jdk-headless
set -euo pipefail
cd "$(dirname "$0")"
APP=..                                   # mealsnap/ (웹 앱 소스)
JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
VERSION=$(grep -o 'versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)
OUT=dist/mealsnap-$VERSION.apk
rm -rf build && mkdir -p build/assets/www build/classes dist

# 1) 웹 앱 파일을 assets에 복사 (서비스워커·문서·소스 SVG는 제외)
cp "$APP/index.html" "$APP/styles.css" "$APP/manifest.webmanifest" build/assets/www/
cp -r "$APP/src" "$APP/icons" build/assets/www/
rm -f build/assets/www/icons/*.svg

# 2) 리소스 + 매니페스트 패키징
aapt package -f -M AndroidManifest.xml -S res -A build/assets -I "$JAR" -F build/base.apk

# 3) 자바 컴파일 → dex
javac --release 8 -Xlint:-options -cp "$JAR" -d build/classes src/app/mealsnap/MainActivity.java
dalvik-exchange --dex --min-sdk-version=29 --output=build/classes.dex build/classes
cp build/base.apk build/unsigned.apk
(cd build && aapt add -k unsigned.apk classes.dex >/dev/null)

# 4) 정렬 + 서명 (키스토어가 없으면 새로 만든다. 같은 키로 서명해야 덮어쓰기 업데이트가 된다)
zipalign -p -f 4 build/unsigned.apk build/aligned.apk
[ -f mealsnap.keystore ] || keytool -genkeypair -keystore mealsnap.keystore -storepass mealsnap -keypass mealsnap \
  -alias mealsnap -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=Mealsnap" >/dev/null 2>&1
apksigner sign --ks mealsnap.keystore --ks-pass pass:mealsnap --key-pass pass:mealsnap --out "$OUT" build/aligned.apk
apksigner verify --verbose "$OUT" | head -6
ls -la "$OUT"
