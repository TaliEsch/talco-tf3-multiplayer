import {setTimeout as delay} from 'node:timers/promises';

// Retry only an OS-level failed replacement while the exact unpublished source
// still exists. Never recreate a consumed source, rewrite the live destination,
// allocate another operation identity, or infer engine success from publication.
export async function replaceUnpublished({replace,verifyUnpublished,assertActive,
  platform=process.platform,wait=()=>delay(25),now=()=>performance.now()}) {
  const started=now();
  let previousError;
  for(let attempt=0;attempt<5;attempt++) {
    assertActive();
    if(attempt>0) {
      if(now()-started>=150)throw previousError;
      let unchanged=false;
      try {unchanged=await verifyUnpublished();} catch { /* retain the original failure */ }
      assertActive();
      if(unchanged!==true||now()-started>=150)throw previousError;
    }
    try {await replace();return;} catch(error) {
      if(platform!=='win32'||!['EPERM','EBUSY'].includes(error.code)||attempt===4||now()-started>=125)throw error;
      previousError=error;
      assertActive();
      let unchanged=false;
      try {unchanged=await verifyUnpublished();} catch { /* uncertain publication stays unknown */ }
      if(unchanged!==true)throw error;
      await wait();
    }
  }
}
