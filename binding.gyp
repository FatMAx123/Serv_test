{
  "targets": [
    {
      "target_name": "project_steam_native",
      "sources": [ "native/src/main.cpp" ],
      "cflags_cc": [ "-O3", "-mavx2" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "Optimization": 3,
          "EnableEnhancedInstructionSet": 5
        }
      }
    }
  ]
}
