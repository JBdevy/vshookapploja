#!/usr/bin/env python3
import re
from pathlib import Path


MINIMUM_ANDROID_SDK = 30  # Android 11
COMPILE_ANDROID_SDK = 36  # Android 16
TARGET_ANDROID_SDK = 36   # Exigência Google Play desde 31/08/2026


def main() -> None:
    variables_path = Path.cwd() / "android" / "variables.gradle"
    if not variables_path.exists():
        raise SystemExit(f"Arquivo Android não encontrado: {variables_path}")

    original = variables_path.read_text(encoding="utf-8")
    updated = original
    replacements = (
        ("minSdkVersion", MINIMUM_ANDROID_SDK),
        ("compileSdkVersion", COMPILE_ANDROID_SDK),
        ("targetSdkVersion", TARGET_ANDROID_SDK),
    )
    for variable, value in replacements:
        updated, count = re.subn(
            rf"{variable}\s*=\s*\d+",
            f"{variable} = {value}",
            updated,
            count=1,
        )
        if count != 1:
            raise SystemExit(
                f"Não foi possível configurar {variable} em: {variables_path}"
            )

    variables_path.write_text(updated, encoding="utf-8")
    print(
        "Android configurado: "
        f"mínimo API {MINIMUM_ANDROID_SDK}, "
        f"compile/target API {TARGET_ANDROID_SDK}"
    )


if __name__ == "__main__":
    main()
