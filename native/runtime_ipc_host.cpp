#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cwchar>
#include <iostream>
#include <string>
#include "runtime_ipc.h"
namespace tf3runtimeipc { int Serve(const std::wstring&, const std::string&); bool ValidPipeName(const std::wstring&); }
int wmain(int argc,wchar_t** argv) {
  if(argc!=5 || std::wcscmp(argv[1],L"--pipe") || std::wcscmp(argv[3],L"--token")){std::wcerr<<L"usage: TF3RuntimeIpcHost --pipe <safe-name> --token <64-lowercase-hex>\n";return 2;}
  const std::wstring pipe=argv[2]; const std::wstring wideToken=argv[4];
  if(!tf3runtimeipc::ValidPipeName(pipe)||wideToken.size()!=64){return 3;}
  std::string token; token.reserve(64); for(wchar_t c:wideToken){if(!((c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f')))return 3;token.push_back(static_cast<char>(c));}
  return tf3runtimeipc::Serve(pipe,token);
}
