const cp=require('child_process');const f=cp.fork;cp.fork=function(){const c=f.apply(this,arguments);c.on('exit',(code,sig)=>console.error('[child exit] code='+code+' sig='+sig));return c;};
