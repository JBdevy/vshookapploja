cmake_minimum_required(VERSION 3.22)

project(HookKeysEngine VERSION 0.1.0 LANGUAGES CXX)

option(HOOK_KEYS_BUILD_TESTS "Build Hook Keys engine tests" ON)

add_library(hook_keys_engine STATIC
  src/HookKeysEngine.cpp
  src/ModuleEffects.cpp
  src/NativeEngineRuntime.cpp
  src/TinySoundFontImplementation.cpp
  src/TinySoundFontModule.cpp
)

target_include_directories(hook_keys_engine
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/TinySoundFont
)

target_compile_features(hook_keys_engine PUBLIC cxx_std_17)

if(MSVC)
  # C4324 only reports the intentional cache-line padding used to isolate the
  # lock-free queue indices from each other.
  target_compile_options(hook_keys_engine PRIVATE /W4 /permissive- /wd4324)
  set_source_files_properties(src/TinySoundFontImplementation.cpp PROPERTIES COMPILE_OPTIONS "/W0")
else()
  target_compile_options(hook_keys_engine PRIVATE -Wall -Wextra -Wpedantic)
  set_source_files_properties(src/TinySoundFontImplementation.cpp PROPERTIES COMPILE_OPTIONS "-w")
endif()

if(HOOK_KEYS_BUILD_TESTS)
  enable_testing()
  find_package(Threads REQUIRED)
  add_executable(hook_keys_engine_tests
    tests/HookKeysEngineTests.cpp
  )
  target_link_libraries(hook_keys_engine_tests PRIVATE hook_keys_engine Threads::Threads)
  add_test(NAME hook_keys_engine_tests COMMAND hook_keys_engine_tests)
  set_tests_properties(hook_keys_engine_tests PROPERTIES WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
endif()
