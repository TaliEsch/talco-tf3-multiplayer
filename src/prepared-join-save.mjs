import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { sha256File } from './compatibility.mjs';

const SAVE_NAME = /^tf3mp_disposable_[a-f0-9]{32}\.sav$/;
const HASH = /^[a-f0-9]{64}$/;

// A prepared Join copy is an immutable input to this admission attempt. The
// downloaded source may still exist, but only the exact disposable copy named
// for startup load can satisfy the host's admitted save identity.
export async function verifyPreparedJoinSave({ saveFile, saveDirectory, expected } = {}) {
  if (typeof saveFile !== 'string' || !path.isAbsolute(saveFile)
    || typeof saveDirectory !== 'string' || !path.isAbsolute(saveDirectory)
    || !SAVE_NAME.test(path.basename(saveFile))
    || !expected || !Number.isSafeInteger(expected.bytes) || expected.bytes < 1
    || !HASH.test(expected.sha256)) throw new TypeError('INVALID_PREPARED_JOIN_SAVE');
  const [rootInfo, root, fileInfo, file] = await Promise.all([
    lstat(saveDirectory), realpath(saveDirectory), lstat(saveFile), realpath(saveFile),
  ]);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()
    || path.resolve(root).toLowerCase() !== path.resolve(saveDirectory).toLowerCase()
    || path.basename(root).toLowerCase() !== 'save'
    || !fileInfo.isFile() || fileInfo.isSymbolicLink()
    || path.resolve(file).toLowerCase() !== path.resolve(saveFile).toLowerCase()
    || path.dirname(file).toLowerCase() !== root.toLowerCase()) {
    throw new Error('PREPARED_JOIN_SAVE_PATH_REJECTED');
  }
  const info = await stat(file);
  if (info.size !== expected.bytes || await sha256File(file) !== expected.sha256) {
    throw new Error('PREPARED_JOIN_SAVE_MISMATCH');
  }
  return Object.freeze({ bytes: info.size, sha256: expected.sha256 });
}
