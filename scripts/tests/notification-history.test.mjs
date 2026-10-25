import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const tick=()=>new Promise(setImmediate);
function fixture(){
 const auth={currentUser:{uid:'viewer'}}, rows=new Map(), listeners=[], outputs=[], errors=[];let failRead=false,hold;
 const stamp=(n)=>({toMillis:()=>n});
 const document=(path)=>{const data=rows.get(path);return{id:path.split('/').at(-1),path,ref:{path},exists:()=>data!==undefined,data:()=>data};};
 const evaluate=(q)=>{
  let values=[...rows].filter(([path])=>path.split('/')[0]===q.name).map(([path])=>document(path));
  for(const constraint of q.parts.filter(p=>p.kind==='where'))values=values.filter(item=>{
   const value=constraint.field==='__name__'?item.id:item.data()[constraint.field];
   return constraint.op==='=='?value===constraint.value:constraint.op==='in'?constraint.value.includes(value):value?.includes(constraint.value);
  });
  const compare=(a,b)=>(b.data().createdAt?.toMillis()??0)-(a.data().createdAt?.toMillis()??0)||(a.id===b.id?0:a.id<b.id?1:-1);
  values.sort(compare);const after=q.parts.find(p=>p.kind==='after');if(after)values=values.filter(item=>compare(item,after.cursor)>0);
  const cap=q.parts.find(p=>p.kind==='limit')?.n;assert.ok(cap&&cap<=20,'every page and receipt query is bounded');
  const docs=values.slice(0,cap);return{docs,size:docs.length};
 };
 const snapshot=q=>q.path?document(q.path):evaluate(q);
 const identityOf=result=>JSON.stringify(result.docs?result.docs.map(d=>[d.id,d.data()]):[result.id,result.data()]);
 const notify=()=>{for(const l of [...listeners])if(!l.stopped){const result=snapshot(l.query),identity=identityOf(result);if(identity!==l.identity){l.identity=identity;l.next(result);}}};
 const sdk={collection:(_,name)=>name,doc:(_,name,id)=>({path:`${name}/${id}`}),where:(field,op,value)=>({kind:'where',field,op,value}),
  documentId:()=> '__name__',orderBy:(field,dir)=>({kind:'order',field,dir}),limit:n=>({kind:'limit',n}),startAfter:cursor=>({kind:'after',cursor}),query:(name,...parts)=>({name,parts}),
  onSnapshot:(query,next,error)=>{const l={query,next,error,stopped:false};listeners.push(l);queueMicrotask(()=>{if(!l.stopped){const result=snapshot(query);l.identity=identityOf(result);next(result);}});return()=>l.stopped=true;},
  getDocsFromServer:async q=>{if(failRead)throw Error('offline');const result=evaluate(q);if(hold){const wait=hold;hold=null;await wait;}return result;},
  getDocFromServer:async ref=>{if(failRead)throw Error('offline');return document(ref.path);},serverTimestamp:()=>stamp(999),
  writeBatch:()=>{const changes=[];return{update:(ref,data)=>changes.push([ref.path,data]),set:(ref,data)=>changes.push([ref.path,data]),commit:async()=>{if(failRead)throw Error('offline');for(const[path,data]of changes)rows.set(path,{...rows.get(path),...data});notify();}};},
 };
 const service=loadService('src/services/notificationHistory.ts',{'firebase/firestore':sdk,'@/src/firebase/config':{auth,db:{}}});
 const start=()=>service.connectNotificationHistory('viewer','customer',(id,data)=>({id,...data,source:'personal'}),(id,data)=>({id,...data}),
  (items,status)=>outputs.push({items,status}),error=>errors.push(error));
 const add=(id,n,source='notifications',extra={})=>rows.set(`${source}/${id}`,{createdAt:stamp(n),userId:'viewer',read:false,
  ...(source==='system_messages'?{audienceRoles:['customer'],status:'active'}:{}),...extra});
 return{auth,rows,listeners,outputs,errors,start,add,notify,latest:()=>outputs.at(-1),offline:v=>failRead=v,hold:p=>hold=p};
}
test('notification pages use timestamp/ID cursors, merge sources and retain boundary evictions without duplicates',async()=>{
 const f=fixture();for(let i=0;i<45;i++)f.add(`n${String(i).padStart(2,'0')}`,i<25?100:200);
 f.add('broadcast',300,'system_messages');const c=f.start();await tick();
 assert.equal(f.latest().items.filter(i=>i.source==='personal').length,20);assert.equal(f.latest().status.unreadTotal,undefined);
 await c.loadMore();await tick();assert.equal(f.latest().items.filter(i=>i.source==='personal').length,40);
 f.add('arrival',400);f.notify();await tick();await c.loadMore();await tick();
 const ids=f.latest().items.map(i=>`${i.source}:${i.id}`);assert.equal(new Set(ids).size,47);assert.equal(ids.length,47);
 assert.equal(f.latest().items[0].id,'arrival');assert.equal(f.latest().status.hasMore,false);
 f.rows.delete('notifications/n30');f.notify();await tick();assert.ok(!f.latest().items.some(i=>i.id==='n30'));
 f.rows.set('system_messages/broadcast',{...f.rows.get('system_messages/broadcast'),status:'archived'});f.notify();await tick();assert.ok(!f.latest().items.some(i=>i.id==='broadcast'));
 c.stop();assert.ok(f.listeners.every(l=>l.stopped));
});
test('all-history unread checks and mark-all include unloaded personal/system rows and live receipt updates',async()=>{
 const f=fixture();for(let i=0;i<45;i++)f.add(`p${i}`,i);
 for(let i=0;i<25;i++)f.add(`s${i}`,i,'system_messages',{status:i%2?'active':'sent'});
 f.rows.set('message_reads/viewer_s0',{userId:'viewer',messageId:'s0'});
 const c=f.start();await tick();await c.refreshTotal();assert.equal(f.latest().status.unreadTotal,69);
 f.rows.set('message_reads/viewer_s24',{userId:'viewer',messageId:'s24'});f.notify();await tick();
 assert.equal(f.latest().status.unreadTotal,undefined);assert.equal(f.latest().items.find(i=>i.id==='s24').read,true);
 await c.markAll();await tick();await c.refreshTotal();assert.equal(f.latest().status.unreadTotal,0);
 assert.ok([...f.rows].filter(([p])=>p.startsWith('notifications/')).every(([,row])=>row.read));c.stop();
});
test('arrivals during counting invalidate the total; failures are recoverable and stale account callbacks cannot emit or write',async()=>{
 const f=fixture();for(let i=0;i<22;i++)f.add(`p${i}`,i);const c=f.start();await tick();
 let release;f.hold(new Promise(done=>release=done));const counting=c.refreshTotal();await tick();f.add('new',999);f.notify();release();await counting;await tick();
 assert.equal(f.latest().status.unreadTotal,undefined);assert.match(f.latest().status.operationError,/changed/);
 f.offline(true);await assert.rejects(c.refreshTotal());assert.match(f.latest().status.operationError,/unavailable/);
 f.offline(false);await c.refreshTotal();assert.equal(f.latest().status.unreadTotal,23);
 f.listeners[0].error(Object.assign(Error('denied'),{code:'permission-denied'}));assert.ok(f.latest().status.errors.length);
 const count=f.outputs.length;f.auth.currentUser={uid:'other'};f.listeners[0].next({docs:[],size:0});assert.equal(f.outputs.length,count);
 await assert.rejects(c.markAll());c.stop();assert.ok(f.listeners.every(l=>l.stopped));
});
test('a burst moving the full live boundary explicitly requests refresh instead of hiding an unexplained history gap',async()=>{
 const f=fixture();for(let i=0;i<45;i++)f.add(`old${i}`,i);const c=f.start();await tick();await c.loadMore();
 for(let i=0;i<45;i++)f.add(`arrival${i}`,1000+i);f.notify();await tick();
 assert.equal(f.latest().status.windowChanged,true);const count=f.listeners.length;await c.loadMore();assert.equal(f.listeners.length,count);c.stop();
});
test('equal timestamps use Firestore ASCII document-ID ordering rather than locale collation',async()=>{
 const f=fixture();for(const id of ['a','A','_','9'])f.add(id,100);const c=f.start();await tick();
 assert.deepEqual(f.latest().items.map(i=>i.id),['a','_','A','9']);c.stop();
});

test('evicted history stays live for read updates, deletion and system audience withdrawal, with bounded listeners',async()=>{
 const f=fixture();
 for(let i=0;i<45;i++){
  f.add(`p${String(i).padStart(2,'0')}`,i);
  f.add(`s${String(i).padStart(2,'0')}`,i,'system_messages');
 }
 const c=f.start();await tick();await c.loadMore();await tick();
 f.add('arrival',100);f.add('system-arrival',100,'system_messages');f.notify();await tick();
 // p25/s25 fell between the live page and the original history cursor.
 assert.ok(f.latest().items.some(i=>i.id==='p25'));
 f.rows.set('notifications/p25',{...f.rows.get('notifications/p25'),read:true});f.notify();await tick();
 assert.equal(f.latest().items.find(i=>i.id==='p25').read,true);
 f.rows.set('system_messages/s25',{...f.rows.get('system_messages/s25'),audienceRoles:['technician']});
 f.rows.delete('notifications/p25');f.notify();await tick();
 assert.ok(!f.latest().items.some(i=>i.id==='p25'||i.id==='s25'));
 assert.ok(f.listeners.filter(l=>!l.stopped&&l.query.path).length<=80);
 c.stop();assert.ok(f.listeners.every(l=>l.stopped));
});

test('retained-row listener failures hide unverified content, expose retry status and ignore late callbacks after account changes',async()=>{
 const f=fixture();for(let i=0;i<45;i++)f.add(`p${String(i).padStart(2,'0')}`,i);
 const c=f.start();await tick();await c.loadMore();f.add('arrival',100);f.notify();await tick();
 const retained=f.listeners.find(l=>!l.stopped&&l.query.path==='notifications/p25');assert.ok(retained);
 retained.error(Object.assign(Error('offline'),{code:'unavailable'}));
 assert.ok(!f.latest().items.some(i=>i.id==='p25'));assert.ok(f.latest().status.errors.includes('personal-notifications'));
 const count=f.outputs.length;f.auth.currentUser={uid:'other'};retained.next({exists:()=>true,data:()=>({userId:'viewer',read:false})});
 assert.equal(f.outputs.length,count);c.stop();assert.ok(f.listeners.every(l=>l.stopped));
});
