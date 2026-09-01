#!/usr/bin/env python3
import re
from pathlib import Path


MINIMUM_IOS_VERSION = "13.4"


def replace_required(path: Path, pattern: str, replacement: str) -> None:
    if not path.exists():
        raise SystemExit(f"Arquivo do projeto iOS não encontrado: {path}")
    original = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, original)
    if count == 0:
        raise SystemExit(f"Não foi possível configurar o iOS mínimo em: {path}")
    path.write_text(updated, encoding="utf-8")


def main() -> None:
    root = Path.cwd()
    replace_required(
        root / "ios" / "App" / "Podfile",
        r"platform\s+:ios,\s*['\"][^'\"]+['\"]",
        f"platform :ios, '{MINIMUM_IOS_VERSION}'",
    )
    replace_required(
        root / "ios" / "App" / "App.xcodeproj" / "project.pbxproj",
        r"IPHONEOS_DEPLOYMENT_TARGET\s*=\s*[^;]+;",
        f"IPHONEOS_DEPLOYMENT_TARGET = {MINIMUM_IOS_VERSION};",
    )
    print(f"Versão mínima do aplicativo iOS configurada: {MINIMUM_IOS_VERSION}")


if __name__ == "__main__":
    main()
