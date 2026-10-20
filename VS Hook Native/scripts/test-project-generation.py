"""Ensure macOS metadata never becomes a Swift source in the generated project."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

generator = Path(__file__).with_name("generate-project.py")
with tempfile.TemporaryDirectory(prefix="vshook-project-generation-") as temporary:
    root = Path(temporary)
    (root / "scripts").mkdir()
    sources = root / "Sources"
    sources.mkdir()
    for name in ("App.swift", "Director.swift"):
        (sources / name).write_text("import Foundation\n", encoding="utf-8")
    (sources / "._App.swift").write_bytes(bytes.fromhex("0005160700020000") + b"\x00" * 4088)
    (sources / ".hidden.swift").write_bytes(b"not Swift source\x00")
    (sources / "Directory.swift").mkdir()
    copy = root / "scripts" / generator.name
    shutil.copyfile(generator, copy)
    subprocess.run([sys.executable, str(copy)], check=True, capture_output=True)
    project = root / "VSHook.xcodeproj" / "project.pbxproj"
    first = project.read_text(encoding="utf-8")
    assert "App.swift" in first and "Director.swift" in first
    assert "._App.swift" not in first
    assert ".hidden.swift" not in first
    assert "Directory.swift" not in first
    assert first.count("isa = PBXBuildFile; fileRef = ") == 3  # two sources and assets
    subprocess.run([sys.executable, str(copy)], check=True, capture_output=True)
    assert project.read_text(encoding="utf-8") == first
print("PROJECT_GENERATION_OK: real Swift sources only; metadata and directories excluded")
