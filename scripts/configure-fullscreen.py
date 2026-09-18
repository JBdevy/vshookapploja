#!/usr/bin/env python3
"""Tela cheia no VS Hook: sem a barra de status (relógio, bateria, wi-fi).

No iOS a barra só some para valer com UIViewControllerBasedStatusBarAppearance
desligado — ligado, o sistema ignora UIStatusBarHidden e pergunta ao
controlador, que é o motivo de o iPhone (que esconde a barra sozinho na
paisagem) ficar limpo e o iPad continuar com a barra.

No Android o tema com windowFullscreen não basta a partir do Android 11: as
barras voltam assim que a janela recebe foco. O MainActivity passa a esconder
as barras de sistema e a deixá-las no modo transiente, que só aparece quando o
usuário arrasta da borda.
"""
import re
import sys
from pathlib import Path

PLIST_KEYS = {
    "UIStatusBarHidden": "true",
    "UIViewControllerBasedStatusBarAppearance": "false",
    "UIRequiresFullScreen": "true",
}

IMMERSIVE_METHODS = """
    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enableImmersiveMode();
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration configuration) {
        super.onConfigurationChanged(configuration);
        enableImmersiveMode();
    }

    private void enableImmersiveMode() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(android.view.WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            return;
        }
        getWindow().getDecorView().setSystemUiVisibility(
            android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
"""


def configure_ios(root: Path) -> None:
    plist = root / "ios" / "App" / "App" / "Info.plist"
    if not plist.exists():
        raise SystemExit(f"Info.plist não encontrado: {plist}")
    text = plist.read_text(encoding="utf-8")
    for key, value in PLIST_KEYS.items():
        entry = f"\t<key>{key}</key>\n\t<{value}/>"
        pattern = rf"\t<key>{key}</key>\s*\n\s*<(?:true|false)/>"
        if re.search(pattern, text):
            text = re.sub(pattern, entry, text)
        else:
            text = text.replace("</dict>\n</plist>", f"{entry}\n</dict>\n</plist>")
    plist.write_text(text, encoding="utf-8")
    print(f"iOS em tela cheia: {plist}")


def configure_android(root: Path) -> None:
    styles = root / "android" / "app" / "src" / "main" / "res" / "values" / "styles.xml"
    if not styles.exists():
        raise SystemExit(f"styles.xml não encontrado: {styles}")
    text = styles.read_text(encoding="utf-8")
    updated = []
    for line in text.splitlines():
        updated.append(line)
        if "<style name=" in line and "windowFullscreen" not in text:
            updated.append('        <item name="android:windowFullscreen">true</item>')
    if "windowFullscreen" not in text:
        styles.write_text("\n".join(updated) + "\n", encoding="utf-8")

    activities = list((root / "android" / "app" / "src" / "main" / "java").rglob("MainActivity.java"))
    if not activities:
        raise SystemExit("MainActivity.java não encontrado")
    for activity in activities:
        source = activity.read_text(encoding="utf-8")
        if "enableImmersiveMode" in source:
            continue
        if "onCreate" in source:
            source = re.sub(
                r"(super\.onCreate\(savedInstanceState\);)",
                r"\1\n        enableImmersiveMode();",
                source,
                count=1,
            )
        else:
            source = source.replace(
                "extends BridgeActivity {",
                "extends BridgeActivity {\n"
                "    @Override\n"
                "    public void onCreate(android.os.Bundle savedInstanceState) {\n"
                "        super.onCreate(savedInstanceState);\n"
                "        enableImmersiveMode();\n"
                "    }\n",
                1,
            )
        source = source.rstrip()
        assert source.endswith("}"), activity
        source = source[:-1].rstrip("\n") + "\n" + IMMERSIVE_METHODS + "}\n"
        activity.write_text(source, encoding="utf-8")
        print(f"Android em tela cheia: {activity}")


def main() -> None:
    platform = sys.argv[1] if len(sys.argv) > 1 else ""
    root = Path.cwd()
    if platform == "ios":
        configure_ios(root)
    elif platform == "android":
        configure_android(root)
    else:
        raise SystemExit("Use: configure-fullscreen.py ios|android")


if __name__ == "__main__":
    main()
