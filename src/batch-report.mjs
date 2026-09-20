import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

// Caller supplies a fixed project reports directory, never a network path.
export async function createBatchReportWriter(directory) {
  directory=path.resolve(directory);
  await mkdir(directory,{recursive:true});
  for(let p=directory;;p=path.dirname(p)) {
    const s=await lstat(p); if(!s.isDirectory() || s.isSymbolicLink()) throw new Error("unsafe report directory");
    if(path.dirname(p)===p) break;
  }
  let owned=null;
  return async report => {
    if(!/^[a-f0-9-]{36}$/.test(report.batchId)) throw new Error("invalid report id");
    if(owned!==null && owned!==report.batchId) throw new Error("report identity changed");
    const folder=path.join(directory,`local-batch-${report.batchId}`);
    if(owned===null) { await mkdir(folder); owned=report.batchId; }
    const s=await lstat(folder); if(!s.isDirectory() || s.isSymbolicLink()) throw new Error("unsafe report folder");
    const temporary=path.join(folder,"report.tmp"), filename=path.join(folder,"report.json");
    const handle=await open(temporary,"wx",0o600);
    try { await handle.writeFile(JSON.stringify(report,null,2)+"\n"); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temporary,filename); } finally { await unlink(temporary).catch(() => {}); }
  };
}
