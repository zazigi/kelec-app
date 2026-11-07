#!/bin/sh
# Le paquet Gradle sidecar embarque toutes les ABI. OnePlus 15 n'utilise qu'arm64.
# On retire les autres .so du APK déjà signé, puis on resigne avec le même keystore debug.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
src="$root/android/app/build/outputs/apk/sidecar/app-sidecar.apk"
out="${1:-$root/kelec-test-sidecar.apk}"
build_tools="${ANDROID_HOME:-/tmp/android-sdk}/build-tools/37.0.0"
if [ ! -f "$src" ]; then
  echo "APK sidecar introuvable. Lancer d'abord : cd android && ./gradlew :app:assembleSidecar" >&2
  exit 1
fi
tmp=$(mktemp)
cp "$src" "$tmp"
zip -d "$tmp" 'lib/x86/*' 'lib/x86_64/*' 'lib/armeabi-v7a/*' >/dev/null
"$build_tools/apksigner" sign \
  --ks "$root/android/app/debug.keystore" \
  --ks-pass pass:android \
  --key-pass pass:android \
  "$tmp"
"$build_tools/zipalign" -c -P 16 4 "$tmp"
mv "$tmp" "$out"
echo "$out"
