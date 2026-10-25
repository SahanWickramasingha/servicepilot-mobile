import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const domain=loadService('functions/src/domain/map.ts',{'./district-catalogue.json':{default:[]}});
const errors=loadService('src/utils/locationSharingError.ts',{});
const { ForegroundSharing }=loadService('src/utils/foregroundSharing.ts',{'@/functions/src/domain/map':domain,'./locationSharingError':errors});
const { installLocationAuthGuard }=loadService('src/firebase/locationAuthGuard.ts',{});
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(){
 const auth={currentUser:{uid:'A'}}, events=[], watches=new Set(), timers=new Set(); let middleware, offline=false, release, removal;
 const sharing=new ForegroundSharing({now:()=>100000,permission:async()=>true,servicesEnabled:async()=>true,
  current:async()=>({latitude:7,longitude:80,sampledAt:100000}),
  watch:async(next)=>{watches.add(next);return()=>watches.delete(next);},every:(next)=>{timers.add(next);return()=>timers.delete(next);},
  publish:async(uid,point)=>{assert.equal(auth.currentUser?.uid,uid,'old cleanup must use old credentials');if(offline)throw Error('offline');if(point&&release)await release.promise;if(!point&&removal)await removal;events.push({uid,point});},
 });
 installLocationAuthGuard(auth,(_,next)=>{middleware=next;return()=>{};},async()=>sharing);
 const replace=async(uid)=>{const next=uid?{uid}:null;await middleware(next);auth.currentUser=next;await sharing.setSession(uid??undefined);};
 return {auth,sharing,events,watches,timers,replace,offline:(value)=>offline=value,hold:(value)=>release=value,holdRemoval:(value)=>removal=value};
}
test('direct replacement/sign-out revoke before credentials change; repeated switches stop watchers and delayed callbacks',async()=>{
 const f=fixture(); await f.sharing.setSession('A');await f.sharing.enable();const old=[...f.watches][0];
 await f.replace('B');assert.equal(f.events.filter(e=>e.uid==='A').at(-1).point,undefined);assert.equal(f.watches.size,0);assert.equal(f.timers.size,0);
 const count=f.events.length;old({latitude:8,longitude:81,sampledAt:100000});await tick();assert.equal(f.events.length,count);
 for(const uid of ['A','B','A','B']){await f.sharing.enable();assert.equal(f.watches.size,1);await f.replace(uid);assert.equal(f.watches.size,0);assert.equal(f.timers.size,0);}
 await f.sharing.enable();await f.replace(null);assert.equal(f.auth.currentUser,null);assert.equal(f.sharing.getSnapshot().enabled,false);
});
test('offline cleanup blocks identity replacement without claiming public marker deletion, and recovers on retry',async()=>{
 const f=fixture();await f.sharing.setSession('A');await f.sharing.enable();f.offline(true);
 await assert.rejects(f.replace('B'));assert.equal(f.auth.currentUser.uid,'A');assert.equal(f.watches.size,0);
 assert.match(f.sharing.getSnapshot().error,/grey approximate marker may remain/);assert.doesNotMatch(f.sharing.getSnapshot().error,/location expires/);
 f.offline(false);await f.replace('B');assert.equal(f.auth.currentUser.uid,'B');assert.equal(f.sharing.getSnapshot().enabled,false);
});
test('identity replacement drains an in-flight publish and its removal while still authorized as A',async()=>{
 const f=fixture();await f.sharing.setSession('A');let resolve;f.hold({promise:new Promise(yes=>resolve=yes)});
 const enabling=f.sharing.enable();await tick();const replacing=f.replace('B');await tick();assert.equal(f.auth.currentUser.uid,'A');assert.equal(f.watches.size,0);
 resolve();await Promise.all([enabling,replacing]);assert.equal(f.events.filter(e=>e.uid==='A').at(-1).point,undefined);assert.equal(f.auth.currentUser.uid,'B');
});
test('already-replaced external Auth state cancels locally and discloses residual sharing without writing as the old user',async()=>{
 const f=fixture();await f.sharing.setSession('A');await f.sharing.enable();f.auth.currentUser={uid:'B'};
 const count=f.events.length;await f.sharing.setSession(undefined);assert.equal(f.events.length,count);assert.equal(f.watches.size,0);assert.equal(f.timers.size,0);
 assert.match(f.sharing.getSnapshot().error,/Remote removal was not confirmed/);await f.sharing.setSession('B');
 assert.equal(f.events.at(-1).uid,'B');assert.equal(f.sharing.getSnapshot().enabled,false);
});

test('direct replacement waits for initial remote cleanup even while sharing is locally OFF',async()=>{
 const f=fixture();let release;f.holdRemoval(new Promise(done=>release=done));
 const starting=f.sharing.setSession('A');await tick();const replacing=f.replace('B');await tick();
 try{assert.equal(f.auth.currentUser.uid,'A','initial unconfirmed removal must block replacement');}
 finally{release();await Promise.all([starting,replacing]);}
 assert.equal(f.auth.currentUser.uid,'B');assert.equal(f.sharing.getSnapshot().enabled,false);
 await f.sharing.setActive(false);await f.sharing.setActive(true);assert.equal(f.watches.size,0);
});

test('queued removal from an obsolete session cannot execute under a replacement account',async()=>{
 const f=fixture();await f.sharing.setSession('A');let release;f.hold({promise:new Promise(done=>release=done)});
 const enabling=f.sharing.enable();await tick();
 const stopping=f.sharing.stop().then(()=>true,()=>false);await tick();
 f.auth.currentUser={uid:'B'};await f.sharing.setSession(undefined);const changed=f.sharing.setSession('B');
 release();await Promise.all([enabling,changed]);assert.equal(await stopping,true,'obsolete cleanup must be cancelled before the adapter write');
 assert.equal(f.events.filter(e=>e.uid==='A'&&!e.point).length,1,'only the original authorized initialization removed A');
 assert.equal(f.events.at(-1).uid,'B');assert.equal(f.sharing.getSnapshot().enabled,false);
 assert.match(f.sharing.getSnapshot().error,/Remote removal was not confirmed/);
});

test('backgrounding while replacement waits must not cancel the same-account remote OFF write',async()=>{
 const f=fixture();await f.sharing.setSession('A');let release;f.hold({promise:new Promise(done=>release=done)});
 const enabling=f.sharing.enable();await tick();const replacing=f.replace('B');await tick();
 await f.sharing.setActive(false);release();await Promise.all([enabling,replacing]);
 assert.equal(f.events.filter(e=>e.uid==='A').at(-1).point,undefined,'A must be remotely OFF before B replaces it');
 await f.sharing.setActive(true);assert.equal(f.watches.size,0);assert.equal(f.sharing.getSnapshot().enabled,false);
});
