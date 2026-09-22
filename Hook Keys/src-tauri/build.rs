fn main() {
    let engine = "../native-engine";
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .opt_level(2)
        .std("c++17")
        .include(format!("{engine}/include"))
        .include(format!("{engine}/third_party/TinySoundFont"))
        .include(format!("{engine}/third_party/FFTConvolver"))
        .file("src/native_engine_bridge.cpp")
        .file(format!("{engine}/src/HookKeysEngine.cpp"))
        .file(format!("{engine}/src/ModuleEffects.cpp"))
        .file(format!("{engine}/src/NativeEngineRuntime.cpp"))
        .file(format!("{engine}/src/OrganModule.cpp"))
        .file(format!("{engine}/src/TinySoundFontImplementation.cpp"))
        .file(format!("{engine}/src/TinySoundFontModule.cpp"));
    build
        .file(format!("{engine}/third_party/FFTConvolver/AudioFFT.cpp"))
        .file(format!("{engine}/third_party/FFTConvolver/FFTConvolver.cpp"))
        .file(format!("{engine}/third_party/FFTConvolver/TwoStageFFTConvolver.cpp"))
        .file(format!("{engine}/third_party/FFTConvolver/Utilities.cpp"));
    if build.get_compiler().is_like_msvc() {
        build.flag("/EHsc").flag("/permissive-").flag("/wd4324");
    } else {
        build.flag("-fexceptions");
    }
    build.compile("hook_keys_engine");
    println!("cargo:rerun-if-changed=src/native_engine_bridge.cpp");
    println!("cargo:rerun-if-changed={engine}/include");
    println!("cargo:rerun-if-changed={engine}/src");
    println!("cargo:rerun-if-changed={engine}/third_party/TinySoundFont/tsf.h");
    println!("cargo:rerun-if-changed={engine}/third_party/FFTConvolver");
    println!("cargo:rerun-if-changed={engine}/assets/hook-b3");
    tauri_build::build()
}
