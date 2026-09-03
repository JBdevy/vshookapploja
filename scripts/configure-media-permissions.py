#!/usr/bin/env python3
import argparse
import plistlib
from pathlib import Path


def configure_android(root: Path) -> None:
    manifest = root / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    if not manifest.exists():
        raise SystemExit(f"AndroidManifest.xml nao encontrado: {manifest}")
    text = manifest.read_text(encoding="utf-8")
    permissions = (
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
    )
    missing = [value for value in permissions if value not in text]
    if missing:
        manifest_start = text.find("<manifest")
        marker = text.find(">", manifest_start)
        if marker < 0:
            raise SystemExit(f"Manifesto Android invalido: {manifest}")
        declarations = "".join(
            f'\n    <uses-permission android:name="{value}" />'
            for value in missing
        )
        text = text[: marker + 1] + declarations + text[marker + 1 :]
        manifest.write_text(text, encoding="utf-8")
    print(f"Permissao de microfone Android configurada: {manifest}")


def configure_ios(root: Path) -> None:
    plist_path = root / "ios" / "App" / "App" / "Info.plist"
    if not plist_path.exists():
        raise SystemExit(f"Info.plist nao encontrado: {plist_path}")
    with plist_path.open("rb") as source:
        data = plistlib.load(source)
    data["NSCameraUsageDescription"] = (
        "O VS Hook usa a câmera quando você tira uma foto para enviar no Chat Hook "
        "ou definir sua foto de perfil."
    )
    data["NSPhotoLibraryUsageDescription"] = (
        "O VS Hook acessa sua fototeca quando você escolhe uma imagem para enviar "
        "no Chat Hook ou usar como foto de perfil."
    )
    data["NSMicrophoneUsageDescription"] = (
        "O VS Hook usa o microfone somente quando você grava uma mensagem de voz no Chat Hook."
    )
    with plist_path.open("wb") as target:
        plistlib.dump(data, target, sort_keys=False)
    print(f"Permissao de microfone iOS configurada: {plist_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", choices=("android", "ios"))
    args = parser.parse_args()
    root = Path.cwd()
    if args.platform == "android":
        configure_android(root)
    else:
        configure_ios(root)


if __name__ == "__main__":
    main()
