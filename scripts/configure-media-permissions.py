#!/usr/bin/env python3
import argparse
import plistlib
import re
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
    changed = False
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
        changed = True

    # O app abre em retrato mesmo quando a rotação do aparelho está livre.
    # O plugin ScreenOrientation substitui esta orientação em tempo de execução
    # somente quando o usuário escolhe Diretor > Tablet.
    activity_start = text.find("<activity")
    activity_end = text.find(">", activity_start)
    if activity_start < 0 or activity_end < 0:
        raise SystemExit(f"Activity principal não encontrada: {manifest}")
    activity_tag = text[activity_start : activity_end + 1]
    if "android:screenOrientation=" not in activity_tag:
        activity_tag = activity_tag[:-1] + '\n            android:screenOrientation="portrait">'
        text = text[:activity_start] + activity_tag + text[activity_end + 1 :]
        changed = True
    else:
        updated_tag = re.sub(
            r'android:screenOrientation="[^"]*"',
            'android:screenOrientation="portrait"',
            activity_tag,
            count=1,
        )
        if updated_tag != activity_tag:
            text = text[:activity_start] + updated_tag + text[activity_end + 1 :]
            changed = True

    # Android 16 ignora bloqueios em telas >= 600dp por padrão. Enquanto o
    # target ainda é API 36, estas flags mantêm a política dinâmica do app:
    # retrato em todos os modos e paisagem somente no Diretor Tablet.
    activity_close = text.find("</activity>", activity_start)
    if activity_close < 0:
        raise SystemExit(f"Fechamento da Activity principal não encontrado: {manifest}")
    activity_body = text[activity_start:activity_close]
    orientation_properties = (
        (
            "android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY",
            "true",
        ),
        (
            "android.window.PROPERTY_COMPAT_ALLOW_ORIENTATION_OVERRIDE",
            "false",
        ),
    )
    declarations = ""
    for property_name, property_value in orientation_properties:
        if property_name not in activity_body:
            declarations += (
                "\n            <property\n"
                f'                android:name="{property_name}"\n'
                f'                android:value="{property_value}" />'
            )
    if declarations:
        text = text[:activity_close] + declarations + "\n        " + text[activity_close:]
        changed = True

    if changed:
        manifest.write_text(text, encoding="utf-8")
    print(f"Permissões e orientação inicial Android configuradas: {manifest}")


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
    # O Camera.getPhoto do Capacitor valida também a chave de adição da
    # fototeca no iOS, mesmo quando saveToGallery está desativado. Sem ela o
    # seletor nativo interrompe a troca da foto antes de retornar a imagem.
    data["NSPhotoLibraryAddUsageDescription"] = (
        "O VS Hook pode adicionar uma imagem à sua fototeca quando você usa "
        "os recursos de foto do Chat Hook."
    )
    data["NSMicrophoneUsageDescription"] = (
        "O VS Hook usa o microfone somente quando você grava uma mensagem de voz no Chat Hook."
    )
    data["ITSAppUsesNonExemptEncryption"] = False
    # O app abre em retrato. No Diretor Tablet, o ScreenOrientation passa para
    # o sensor e precisa encontrar as duas paisagens declaradas no bundle.
    phone_orientations = [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
    ]
    tablet_orientations = [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown",
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
    ]
    data["UISupportedInterfaceOrientations"] = phone_orientations
    data["UISupportedInterfaceOrientations~ipad"] = tablet_orientations
    with plist_path.open("wb") as target:
        plistlib.dump(data, target, sort_keys=False)
    print(f"Permissões de câmera, fototeca e microfone iOS configuradas: {plist_path}")


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
