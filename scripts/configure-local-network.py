#!/usr/bin/env python3
import argparse
import plistlib
from pathlib import Path


def configure_ios(root: Path) -> None:
    plist_path = root / "ios" / "App" / "App" / "Info.plist"
    if not plist_path.exists():
        raise SystemExit(f"Info.plist nao encontrado: {plist_path}")

    with plist_path.open("rb") as source:
        data = plistlib.load(source)
    data["NSLocalNetworkUsageDescription"] = (
        "O VS Hook procura a Hook Center e a extensao VS Hook na sua rede local."
    )
    with plist_path.open("wb") as target:
        plistlib.dump(data, target, sort_keys=False)
    print(f"Permissao de rede local configurada: {plist_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", choices=("ios",))
    args = parser.parse_args()
    root = Path.cwd()
    if args.platform == "ios":
        configure_ios(root)


if __name__ == "__main__":
    main()
