import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import * as fsdk from 'firebase/firestore';
import {loadService} from '../lib/subscription-reliability-workloads.mjs';
const hosts=[process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_AUTH_EMULATOR_HOST];
if(!hosts.every(h=>/^(127\.0\.0\.1|localhost):\d+$/.test(h??'')))throw Error('Loopback demo emulators required.');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp:adminApp,deleteApp:deleteAdmin}=require('firebase-admin/app'),{getAuth:adminAuth}=require('firebase-admin/auth');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const projectId='demo-servicepilot-review-author',app=adminApp({projectId},'notification-history-tests'),db=getFirestore(app),clients=[];
const wait=async(predicate)=>{for(let i=0;i<400;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error('Notification listener timed out.');};
before(async()=>{
 fsdk.setLogLevel('silent');
 for(const uid of ['nh-owner','nh-foreign']){
  const email=uid+'@example.test',password=randomBytes(24).toString('base64url');
  await adminAuth(app).createUser({uid,email,password,emailVerified:true});
  await db.doc('users/'+uid).set({role:'customer',accountStatus:'active',emailVerified:true});
  const client=initializeApp({projectId,apiKey:'emulator-only'},uid),auth=getAuth(client),database=fsdk.getFirestore(client);
  connectAuthEmulator(auth,'http://'+hosts[1],{disableWarnings:true});fsdk.connectFirestoreEmulator(database,hosts[0].split(':')[0],Number(hosts[0].split(':')[1]));
  await signInWithEmailAndPassword(auth,email,password);clients.push({app:client,auth,db:database});
 }
 const batch=db.batch();
 for(let i=0;i<45;i++)batch.set(db.doc(`notifications/nh-${String(i).padStart(2,'0')}`),{userId:'nh-owner',type:'system',title:'Local history fixture',message:'Local test',priority:'normal',read:false,createdAt:Timestamp.fromMillis(Date.now()-100000+i*100)});
 for(let i=0;i<25;i++)batch.set(db.doc(`system_messages/nh-${i}`),{senderId:'local-admin',senderName:'Local administrator',senderRole:'super_admin',audienceRoles:['customer'],status:i%2?'active':'sent',title:'Local system history fixture',message:'Local test',priority:'normal',createdAt:Timestamp.fromMillis(Date.now()-100000+i*100),updatedAt:Timestamp.now()});
 await batch.commit();
});
after(async()=>{
 for(const c of clients){await fsdk.terminate(c.db);await deleteApp(c.app);}
 const cleanup=db.batch();
 for(let i=0;i<45;i++)cleanup.delete(db.doc(`notifications/nh-${String(i).padStart(2,'0')}`));
 for(let i=0;i<25;i++){cleanup.delete(db.doc(`system_messages/nh-${i}`));cleanup.delete(db.doc(`message_reads/nh-owner_nh-${i}`));}
 await cleanup.commit();await db.terminate();await deleteAdmin(app);
});
test('bounded real queries and receipt joins load history and mark all unloaded records without widening recipient permissions',async()=>{
 const c=clients[0],events=[],errors=[];
 assert.ok((await fsdk.getDocFromServer(fsdk.doc(c.db,'system_messages','nh-0'))).exists(),'authorized system get');
 for(const [label,extra] of [['limited',[fsdk.limit(1)]],['ordered',[fsdk.orderBy('createdAt','desc'),fsdk.orderBy(fsdk.documentId(),'desc'),fsdk.limit(20)]]]){
  const page=await fsdk.getDocsFromServer(fsdk.query(fsdk.collection(c.db,'system_messages'),fsdk.where('audienceRoles','array-contains','customer'),fsdk.where('status','==','sent'),...extra));
  assert.ok(page.size>0,label);
 }
 const {connectNotificationHistory}=loadService('src/services/notificationHistory.ts',{'firebase/firestore':fsdk,'@/src/firebase/config':c});
 const stream=connectNotificationHistory('nh-owner','customer',(id,data)=>({id,...data,source:'personal'}),(id,data)=>({id,...data}),
  (items,status)=>events.push({items,status}),e=>errors.push(e));
 try{
  await wait(()=>events.at(-1)&&!events.at(-1).status.loading);assert.deepEqual(errors,[]);
  assert.equal(events.at(-1).items.filter(i=>i.source==='personal').length,20);
  await stream.loadMore();await stream.loadMore();await wait(()=>!events.at(-1).status.loading&&events.at(-1).items.filter(i=>i.source==='personal').length===45);
  const system=(await db.collection('system_messages').get()).docs.filter(d=>['active','sent'].includes(d.data().status)&&d.data().audienceRoles?.includes('customer')).length;
  await stream.refreshTotal();assert.equal(events.at(-1).status.unreadTotal,45+system);
  await stream.markAll();await wait(()=>events.at(-1).items.every(i=>i.read));
  await stream.refreshTotal();assert.equal(events.at(-1).status.unreadTotal,0);
  const personal=await db.collection('notifications').where('userId','==','nh-owner').get();assert.ok(personal.docs.every(d=>d.data().read));
  await assert.rejects(fsdk.getDocFromServer(fsdk.doc(clients[1].db,'notifications','nh-00')),e=>e.code==='permission-denied');
  await assert.rejects(fsdk.setDoc(fsdk.doc(clients[1].db,'message_reads','nh-owner_nh-0'),{userId:'nh-owner',messageId:'nh-0',readAt:fsdk.serverTimestamp()}),e=>e.code==='permission-denied');
 }finally{stream.stop();}
});
