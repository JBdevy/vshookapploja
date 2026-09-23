#!/usr/bin/env python3
"""R8/ProGuard no build release do Android.

android/ nao e versionado (veja .gitignore: `/android/`) -- todo build do
CI roda `npx cap add android` do zero e recria o projeto padrao do
Capacitor, com minifyEnabled false e o proguard-rules.pro vazio. Por isso
a configuracao mora aqui, como as outras `configure-*.py`, em vez de uma
edicao direta dentro de android/: uma edicao direta se perderia no proximo
`cap add android`.

Liga minifyEnabled + shrinkResources e troca proguard-android.txt pela
variante -optimize (deixa o R8 remover codigo morto e otimizar em vez de
so ofuscar). As keep rules cobrem exatamente o que o app usa e que o R8 nao
enxerga sozinho: anotacoes do Capacitor (@CapacitorPlugin/@PluginMethod,
lidas via reflection pelo PluginManager), o bridge WebView
(@JavascriptInterface) e avisos opcionais do Firebase Messaging (usado
pelo plugin vshook-local-network). Nao ha codigo JNI/NDK no app (nenhum
.so em android/ ou plugins/), entao nenhuma regra nesse sentido e
necessaria. Tambem liga windowLayoutInDisplayCutoutMode no tema realmente
aplicado a MainActivity, para o WebView (ja preenchido com
env(safe-area-inset-*), ver check-safe-area.js) desenhar embaixo do notch
de forma consistente em vez de deixar a area do recorte com uma barra
preta em alguns aparelhos.
"""
from pathlib import Path

PROGUARD_MARKER = "# VS_HOOK_R8_KEEP_RULES"

PROGUARD_RULES = f"""
{PROGUARD_MARKER}
# Minificacao ligada (minifyEnabled true). As regras abaixo cobrem reflection
# e chamadas por nome que o R8 nao enxerga sozinho. Sem codigo JNI/NDK no
# app, nenhuma regra de JNI e necessaria aqui.

# Capacitor le @CapacitorPlugin/@PluginMethod via getAnnotation() em tempo de
# execucao para registrar plugins e permissoes -- sem manter os atributos de
# anotacao, o registro quebra silenciosamente (sem crash, so para de responder).
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, Exceptions, SourceFile, LineNumberTable

# Bridge e plugins do Capacitor. @capacitor/android ja publica essa mesma
# regra como consumerProguardFile, mas node_modules nao e versionado neste
# repo, entao ela fica repetida aqui explicitamente: e a categoria de maior
# risco (cobre camera, haptics, keyboard, screen-orientation, keep-awake,
# voice-recorder e os plugins vshook-* customizados, que so existem como
# subclasses de com.getcapacitor.Plugin).
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {{
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}}
-keep public class * extends com.getcapacitor.Plugin {{ *; }}

# Ponte WebView -> nativo: com.getcapacitor.MessageHandler (e
# CapacitorCookies/CapacitorHttp) expoe metodos @JavascriptInterface chamados
# pelo nome exato a partir do JS. Nao esta nas consumer rules do
# @capacitor/android; sem isso a ofuscacao pode renomear o metodo e quebrar
# toda chamada JS -> nativo silenciosamente.
-keepclassmembers class * {{
    @android.webkit.JavascriptInterface <methods>;
}}

# Firebase Messaging (plugin vshook-local-network le a config do Firebase e
# renova o push token). O AAR do Firebase ja publica suas proprias consumer
# rules; isso so evita que uma classe opcional/transitiva do Play Services
# fora do classpath vire "Missing class" e quebre o build.
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
"""


def configure_build_gradle(android_dir: Path) -> bool:
    build_gradle = android_dir / "app" / "build.gradle"
    if not build_gradle.exists():
        raise SystemExit(f"build.gradle nao encontrado: {build_gradle}")
    text = build_gradle.read_text(encoding="utf-8")
    changed = False

    if "minifyEnabled false" in text:
        text = text.replace("minifyEnabled false", "minifyEnabled true")
        changed = True

    if "shrinkResources" not in text:
        text = text.replace(
            "minifyEnabled true",
            "minifyEnabled true\n            shrinkResources true",
            1,
        )
        changed = True

    if "proguard-android.txt" in text:
        text = text.replace("proguard-android.txt", "proguard-android-optimize.txt")
        changed = True

    if changed:
        build_gradle.write_text(text, encoding="utf-8")
    print(f"R8/shrinkResources configurados: {build_gradle}")
    return changed


def configure_proguard_rules(android_dir: Path) -> None:
    proguard = android_dir / "app" / "proguard-rules.pro"
    if not proguard.exists():
        raise SystemExit(f"proguard-rules.pro nao encontrado: {proguard}")
    text = proguard.read_text(encoding="utf-8")
    if PROGUARD_MARKER not in text:
        text = text.rstrip("\n") + "\n" + PROGUARD_RULES
        proguard.write_text(text, encoding="utf-8")
    print(f"Keep rules do R8 aplicadas: {proguard}")


def configure_cutout_mode(android_dir: Path) -> None:
    styles = android_dir / "app" / "src" / "main" / "res" / "values" / "styles.xml"
    if not styles.exists():
        raise SystemExit(f"styles.xml nao encontrado: {styles}")
    text = styles.read_text(encoding="utf-8")
    if "windowLayoutInDisplayCutoutMode" in text:
        print(f"windowLayoutInDisplayCutoutMode ja presente: {styles}")
        return

    marker = '<style name="AppTheme.NoActionBarLaunch"'
    start = text.find(marker)
    if start < 0:
        raise SystemExit(f"AppTheme.NoActionBarLaunch nao encontrado: {styles}")
    close = text.find("</style>", start)
    if close < 0:
        raise SystemExit(f"Fechamento de AppTheme.NoActionBarLaunch nao encontrado: {styles}")
    item = '        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>\n    '
    text = text[:close] + item + text[close:]
    styles.write_text(text, encoding="utf-8")
    print(f"windowLayoutInDisplayCutoutMode adicionado: {styles}")


def main() -> None:
    root = Path.cwd()
    android_dir = root / "android"
    if not android_dir.exists():
        raise SystemExit(f"android/ nao encontrado em {root}")
    configure_build_gradle(android_dir)
    configure_proguard_rules(android_dir)
    configure_cutout_mode(android_dir)


if __name__ == "__main__":
    main()
