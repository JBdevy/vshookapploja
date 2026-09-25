#!/usr/bin/env python3
"""Generate the standalone UIKit/SwiftUI project using only Python's stdlib."""
import hashlib
import json
import plistlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def identifier(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()

def quote(value):
    return json.dumps(str(value), ensure_ascii=False)

objects = []

def add(name, body):
    key = identifier(name)
    objects.append(f"\t{key} = {{ {body} }};")
    return key

sources = []
source_refs = []
for file in sorted((ROOT / "Sources").glob("*.swift")):
    ref = add("file:" + file.name, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {quote(file.name)}; sourceTree = "<group>";')
    source_refs.append(ref)
    sources.append(add("build:" + file.name, f"isa = PBXBuildFile; fileRef = {ref};"))

assets = add("assets", 'isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>";')
assets_build = add("assets-build", f"isa = PBXBuildFile; fileRef = {assets};")
product = add("product", 'isa = PBXFileReference; explicitFileType = wrapper.application; path = "VS Hook.app"; sourceTree = BUILT_PRODUCTS_DIR;')
source_group = add("sources-group", f'isa = PBXGroup; children = ({",".join(source_refs)},); path = Sources; sourceTree = "<group>";')
product_group = add("products-group", f'isa = PBXGroup; children = ({product},); name = Products; sourceTree = "<group>";')
main_group = add("main-group", f'isa = PBXGroup; children = ({source_group},{assets},{product_group},); sourceTree = "<group>";')
source_phase = add("source-phase", f"isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({','.join(sources)},); runOnlyForDeploymentPostprocessing = 0;")
resource_phase = add("resource-phase", f"isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({assets_build},); runOnlyForDeploymentPostprocessing = 0;")
framework_phase = add("framework-phase", "isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;")
configs = []
for name in ("Debug", "Release"):
    settings = {
        "PRODUCT_NAME": "VS Hook", "PRODUCT_BUNDLE_IDENTIFIER": "com.hookdeveloper.vshook",
        "SWIFT_VERSION": "5.0", "IPHONEOS_DEPLOYMENT_TARGET": "15.0",
        "OTHER_SWIFT_FLAGS": "$(inherited) -Xfrontend -disable-autolink-framework -Xfrontend SwiftUICore",
        "OTHER_LDFLAGS": "$(inherited) -framework SwiftUI",
        "SDKROOT": "iphoneos", "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator",
        "TARGETED_DEVICE_FAMILY": "1,2", "INFOPLIST_FILE": "Info.plist",
        "CODE_SIGN_STYLE": "Automatic", "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
        "MARKETING_VERSION": "1.0.2", "CURRENT_PROJECT_VERSION": "1",
        "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks",
        "SWIFT_OPTIMIZATION_LEVEL": "-Onone" if name == "Debug" else "-O",
        "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG" if name == "Debug" else "",
        "DEBUG_INFORMATION_FORMAT": "dwarf" if name == "Debug" else "dwarf-with-dsym",
        "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
        "CLANG_ENABLE_MODULES": "YES", "SWIFT_EMIT_LOC_STRINGS": "YES",
        "ONLY_ACTIVE_ARCH": "YES" if name == "Debug" else "NO",
        "ENABLE_TESTABILITY": "YES" if name == "Debug" else "NO",
    }
    body = " ".join(f"{key} = {quote(value)};" for key, value in settings.items())
    configs.append(add("config:" + name, f"isa = XCBuildConfiguration; name = {name}; buildSettings = {{ {body} }};"))
config_list = add("configs", f"isa = XCConfigurationList; buildConfigurations = ({','.join(configs)},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;")
project_configs = []
for name in ("Debug", "Release"):
    project_configs.append(add("project-config:" + name, f"isa = XCBuildConfiguration; name = {name}; buildSettings = {{ }};"))
project_config_list = add("project-configs", f"isa = XCConfigurationList; buildConfigurations = ({','.join(project_configs)},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;")
target = add("target", f'isa = PBXNativeTarget; name = VSHook; productName = VSHook; productReference = {product}; productType = "com.apple.product-type.application"; buildConfigurationList = {config_list}; buildPhases = ({source_phase},{framework_phase},{resource_phase},); dependencies = (); buildRules = ();')
project = add("project", f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; }}; buildConfigurationList = {project_config_list}; compatibilityVersion = "Xcode 14.0"; developmentRegion = pt; knownRegions = (pt,en,Base,); mainGroup = {main_group}; productRefGroup = {product_group}; projectDirPath = ""; projectRoot = ""; targets = ({target},);')
destination = ROOT / "VSHook.xcodeproj"
destination.mkdir(exist_ok=True)
(destination / "project.pbxproj").write_text("// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n" + "\n".join(objects) + f"\n}}; rootObject = {project}; }}\n")
schemes = destination / "xcshareddata/xcschemes"
schemes.mkdir(parents=True, exist_ok=True)
reference = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="VS Hook.app" BlueprintName="VSHook" ReferencedContainer="container:VSHook.xcodeproj"/>'
(schemes / "VSHook.xcscheme").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference}</BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"/>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
print("VSHook.xcodeproj: " + str(len(sources)) + " arquivos Swift, sem dependências externas.")
