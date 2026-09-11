cmake_minimum_required(VERSION 3.22.1)

project(HookKeysNative LANGUAGES CXX)

set(HOOK_KEYS_ENGINE_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../../../native-engine")
set(HOOK_KEYS_BUILD_TESTS OFF CACHE BOOL "" FORCE)
add_subdirectory("${HOOK_KEYS_ENGINE_ROOT}" "${CMAKE_CURRENT_BINARY_DIR}/hook-keys-engine")

add_library(hook_keys_native SHARED HookKeysNativeBridge.cpp)
target_compile_features(hook_keys_native PRIVATE cxx_std_17)
target_link_libraries(hook_keys_native PRIVATE hook_keys_engine aaudio log android)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    target_compile_options(hook_keys_native PRIVATE -Wall -Wextra -Wpedantic)
endif()
