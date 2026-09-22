#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cwchar>
#include <iostream>
#include <string>
#include "runtime_ipc.h"
int wmain(int argc,wchar_t** argv) {
  const bool inProcess = argc == 6 && std::wcscmp(argv[1], L"--in-process") == 0;
  const int first = inProcess ? 2 : 1;
  if((!inProcess && argc != 5) || std::wcscmp(argv[first],L"--pipe") || std::wcscmp(argv[first + 2],L"--token")){std::wcerr<<L"usage: TF3RuntimeIpcHost [--in-process] --pipe <safe-name> --token <64-lowercase-hex>\n";return 2;}
  const std::wstring pipe=argv[first + 1]; const std::wstring wideToken=argv[first + 3];
  if(!tf3runtimeipc::ValidPipeName(pipe)||wideToken.size()!=64){return 3;}
  std::string token; token.reserve(64); for(wchar_t c:wideToken){if(!((c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f')))return 3;token.push_back(static_cast<char>(c));}
  if(!tf3runtimeipc::ValidToken(token))return 3;
  return inProcess ? tf3runtimeipc::ServeInProcess(pipe,token) : tf3runtimeipc::Serve(pipe,token);
}
