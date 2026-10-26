#!/usr/bin/env python3
"""Build an unsigned, isolated iPad quality probe; never install or launch it.

Pass --models the directory containing the 32 compiled offline .mlmodelc
stages. Sign the result with a development profile before installing on a
test device. It creates its own 10-second audio, reserves 256 MiB to simulate
project memory, and writes five stems plus result.txt in its own Documents.
Download that directory and run catstem/compare-device-output.py against it.
Set launch environment CATSTEM_PROBE_PROJECT_MIB=384 to verify memory refusal.
"""
import argparse
from pathlib import Path
import plistlib
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--models", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
output = args.output.resolve()
app = output / "AudioProbe.app"
app.mkdir(parents=True, exist_ok=True)
source = (root / "Apple/Bridge/JarasStemSeparator.mm").read_text()
start = source.index("namespace CatStemRealtime {")
end = source.index("#if TARGET_OS_OSX\nstd::atomic<bool> workerLease", start)
(output / "CatStemCoreMLTestKernel.hpp").write_text(
    source[start:end] + '\n#include "CatStemCoreMLRuntime.inc"\n}\n')
sdk = subprocess.check_output(["xcrun", "--sdk", "iphoneos", "--show-sdk-path"], text=True).strip()
command = ["xcrun", "--sdk", "iphoneos", "clang++", "-target", "arm64-apple-ios16.0",
           "-isysroot", sdk, "-std=c++17", "-O2", "-fobjc-arc", "-I", str(output),
           "-I", str(root / "Apple/Bridge"), str(root / "Tests/Apple/CatStemOfflineDeviceProbe.mm")]
for framework in ("Foundation", "UIKit", "CoreGraphics", "CoreML", "AVFoundation", "Accelerate"):
    command.extend(["-framework", framework])
subprocess.run(command + ["-o", str(app / "AudioProbe")], check=True)
for index in range(1, 33):
    name = "CatStemHTDemucs6Offline" + ("" if index == 1 else str(index)) + ".mlmodelc"
    shutil.copytree(args.models / name, app / name, dirs_exist_ok=True)
(app / "Info.plist").write_bytes(plistlib.dumps({
    "CFBundleIdentifier": "com.hookdeveloper.catlive.audioprobe", "CFBundleExecutable": "AudioProbe",
    "CFBundleName": "CatStem Quality Probe", "CFBundleVersion": "1", "CFBundleShortVersionString": "1.0",
    "CFBundlePackageType": "APPL", "LSRequiresIPhoneOS": True, "MinimumOSVersion": "16.0",
    "UIDeviceFamily": [2], "UIFileSharingEnabled": True, "UILaunchScreen": {}}))
print(app)
