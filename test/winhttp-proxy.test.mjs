import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'native', 'winhttp_proxy.cpp'), 'utf8');
const host = fs.readFileSync(path.join(root, 'native', 'winhttp_proxy_host.cpp'), 'utf8');
const session = fs.readFileSync(path.join(root, 'native', 'native_session_handoff.cpp'), 'utf8');
const stage = fs.readFileSync(path.join(root, 'Stage-NativeLoader.ps1'), 'utf8');
const definition = fs.readFileSync(path.join(root, 'native', 'winhttp_proxy.def'), 'utf8');

const expected = [
  'WinHttpAddRequestHeaders', 'WinHttpCloseHandle', 'WinHttpConnect', 'WinHttpOpen',
  'WinHttpOpenRequest', 'WinHttpQueryDataAvailable', 'WinHttpQueryHeaders', 'WinHttpReadData',
  'WinHttpReceiveResponse', 'WinHttpSendRequest', 'WinHttpSetOption',
  'WinHttpSetStatusCallback', 'WinHttpSetTimeouts', 'WinHttpWriteData'
];

test('WinHTTP proxy exports exactly the audited TF3 import family', () => {
  const exports = definition.split(/\r?\n/).map(line => line.trim())
    .filter(line => line.startsWith('WinHttp'));
  assert.deepEqual(exports, expected);
  for (const name of expected) assert.match(source, new RegExp(`Resolve\\([^\\n]+, "${name}"\\)`));
});

test('WinHTTP proxy uses absolute System32 forwarding and lazy opt-in runtime activation', () => {
  assert.match(source, /GetSystemDirectoryW/);
  assert.match(source, /WinVerifyTrust/);
  assert.match(source, /TF3_NATIVE_SESSION_FILE/);
  assert.match(source, /FILE_FLAG_DELETE_ON_CLOSE/);
  assert.match(source, /TryConsumeSession\(request\) \|\|\s+\(ReadBoundedEnvironment/);
  assert.match(source, /120ULL \* 10000000ULL/);
  assert.match(session, /CREATE_NEW/);
  assert.match(session, /D:P\(A;;FA;;;OW\)/);
  assert.match(session, /std::iswalnum/);
  assert.doesNotMatch(session, /FILE_ATTRIBUTE_HIDDEN/);
  assert.match(source, /LoadLibraryExW\(path\.c_str\(\), nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32\)/);
  assert.match(source, /TF3InProcessRuntime\.dll/);
  assert.match(source, /TF3_MP_NATIVE_PIPE/);
  assert.match(source, /TF3_MP_NATIVE_TOKEN/);
  assert.match(source, /StartRuntimeIfConfigured\(\);/);
  assert.match(source, /CreateThread\(nullptr, 0, RuntimeWorker/);
  assert.match(source, /GetModuleHandleExW\(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS/);
  assert.match(source, /FreeLibraryAndExitThread\(worker_reference, 0\)/);
  assert.match(stage, /\[System\.IO\.File\]::Copy\(\$source, \$destination, \$false\)/);
  assert.match(stage, /\[System\.IO\.FileMode\]::CreateNew/);
  assert.doesNotMatch(stage, /Copy-Item/);
  assert.match(source, /const DWORD caller_last_error = GetLastError\(\)/);
  assert.match(source, /SetLastError\(caller_last_error\)/);
  assert.match(source, /if \(!PrepareForwarder\(\)\)/);
  assert.match(source, /if \(reason == DLL_PROCESS_ATTACH\) \{\s+g_proxy_module = instance;/);
  assert.match(source, /DisableThreadLibraryCalls\(instance\)/);
  assert.doesNotMatch(source, /CreateThread\([^\n]+DllMain/);
  assert.match(host, /VerifyLastErrorTransparency/);
  assert.doesNotMatch(source, /LoadLibraryExW\([^\n]+DllMain/);
});
