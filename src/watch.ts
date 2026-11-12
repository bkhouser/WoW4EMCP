// Configuration revocation runs independently of potentially slow disk reads.
export async function watchLoop<T>(options:{
  read:()=>T; reconcile:(config:T)=>void; stop:()=>void;
  sync:(config:T,isAllowed:(candidate:T)=>boolean)=>Promise<unknown>;
  pollSeconds:(config:T)=>number; error:(error:unknown)=>void;
  signal:AbortSignal; intervalMs?:number;
}) {
  let active:T|undefined,inFlight:Promise<void>|undefined,next=0,signature='';
  const revoke=()=>{active=undefined;options.stop();};
  const tick=()=>{
    if(options.signal.aborted){revoke();return;}
    try {
      active=options.read();options.reconcile(active);
      const current=JSON.stringify(active);
      if(current!==signature){signature=current;next=0;}
      if(!inFlight&&Date.now()>=next){
        const config=active,batchSignature=signature;
        inFlight=options.sync(config,candidate=>!options.signal.aborted&&active!==undefined&&JSON.stringify(candidate)===JSON.stringify(active))
          .then(()=>{next=signature===batchSignature?Date.now()+options.pollSeconds(config)*1000:0;})
          .catch(options.error).finally(()=>{inFlight=undefined;});
      }
    }catch(error){revoke();options.error(error);}
  };
  options.signal.addEventListener('abort',revoke);
  const timer=setInterval(tick,options.intervalMs??1000);tick();
  try {
    if(!options.signal.aborted)await new Promise<void>(done=>options.signal.addEventListener('abort',()=>done(),{once:true}));
  }finally{clearInterval(timer);revoke();options.signal.removeEventListener('abort',revoke);await inFlight;}
}
