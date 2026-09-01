#!/usr/bin/env python3
import re
from pathlib import Path


MINIMUM_ANDROID_SDK = 30  # Android 11


def main() -> None:
    variables_path = Path.cwd() / "android" / "variables.gradle"
    if not variables_path.exists():
        raise SystemExit(f"Arquivo Android não encontrado: {variables_path}")

    original = variables_path.read_text(encoding="utf-8")
    updated, count = re.subn(
        r"minSdkVersion\s*=\s*\d+",
        f"minSdkVersion = {MINIMUM_ANDROID_SDK}",
        original,
        count=1,
    )
    if count != 1:
        raise SystemExit(f"Não foi possível configurar o Android mínimo em: {variables_path}")

    variables_path.write_text(updated, encoding="utf-8")
    print(f"Versão mínima do aplicativo Android configurada: Android 11 (API {MINIMUM_ANDROID_SDK})")


if __name__ == "__main__":
    main()
