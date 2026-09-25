#!/usr/bin/env python3
"""Check a device .app before packaging it for TestFlight."""
import plistlib
import re
import subprocess
import sys
from pathlib import Path


def inspect(app):
    with (app / "Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    executable = app / info["CFBundleExecutable"]
    assert executable.is_file(), "Executável ausente"
    assert info["CFBundleIdentifier"] == "com.hookdeveloper.vshook", "Bundle incorreto"
    forbidden = re.compile(r"WebKit|WKWebView|UIWebView|Capacitor|Cordova", re.I)
    inspected = False
    for file in app.rglob("*"):
        assert not forbidden.search(file.name), f"Dependência web: {file.name}"
        if not file.is_file():
            continue
        with file.open("rb") as stream:
            magic = stream.read(4).hex()
        if magic not in {"cffaedfe", "cefaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"}:
            continue
        commands = subprocess.check_output(["xcrun", "otool", "-l", str(file)], text=True)
        assert not forbidden.search(commands), f"Runtime web vinculado: {file.name}"
        for block in re.split(r"^Load command \d+\s*$", commands, flags=re.M)[1:]:
            if "/SwiftUICore.framework/" in block:
                assert re.search(r"cmd LC_LOAD_WEAK_DYLIB\s", block), "SwiftUICore obrigatório no iOS 16"
        symbols = subprocess.check_output(["xcrun", "nm", "-m", "-u", str(file)], text=True)
        assert "(from SwiftUICore)" not in symbols, "Metadados ligados diretamente a SwiftUICore; incompatível com iOS 16"
        if file == executable:
            versions = re.findall(r"cmd LC_BUILD_VERSION\s+cmdsize \d+\s+platform (\S+)\s+minos ([\d.]+)", commands)
            assert versions, "Versão mínima do executável ausente"
            for platform, version in versions:
                assert platform in {"2", "IOS"}, "Use a build de dispositivo, não a do simulador"
                assert tuple(map(int, version.split("."))) <= (15, 0, 0), f"Mínimo acima de iOS 15: {version}"
            inspected = True
    assert inspected, "Executável Mach-O não encontrado"
    print("VSHOOK_IOS_OK: app nativo; mínimo iOS 15; sem vínculos diretos com SwiftUICore.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python3 scripts/verify-ios.py caminho/VS\ Hook.app")
    inspect(Path(sys.argv[1]).resolve())
