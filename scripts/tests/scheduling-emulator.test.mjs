import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,beforeAuthStateChanged,updateCurrentUser,signOut} from 'firebase/auth';
import * as fsdk from 'firebase/firestore';
import {loadService} from '../lib/subscription-reliability-workloads.mjs';
const hosts=[process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_AUTH_EMULATOR_HOST];
if(!hosts.every(h=>/^(127\.0\.0\.1|localhost):\d+$/.test(h??'')))throw Error('Loopback demo emulators required.');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp:adminApp,deleteApp:deleteAdmin}=require('firebase-admin/app'),{getAuth:adminAuth}=require('firebase-admin/auth');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=adminApp({projectId:'demo-servicepilot-review-author'},'scheduling-tests'),db=getFirestore(app),auth=adminAuth(app),clients=new Map();
const {createBookingScheduleService}=require('./lib/services/booking-schedule.service.js'),{bookingInterval}=require('./lib/domain/scheduling.js');
const service=createBookingScheduleService({auth,db});
const call=async(uid,input)=>service.change('Bearer '+await clients.get(uid).auth.currentUser.getIdToken(),input);
const schedule=(date='2099-10-10',time='10:00 AM',durationMinutes=60)=>{
 const interval=bookingInterval(date,time,durationMinutes);return{preferredDate:date,preferredTime:time,durationMinutes,
  scheduledAt:Timestamp.fromMillis(interval.start),scheduledEndAt:Timestamp.fromMillis(interval.end),schedulingVersion:1,bookingTimeZone:'Asia/Colombo',scheduleRevision:0};
};
async function seed(id,technicianId,time='10:00 AM',status='requested',legacy=false){
 await db.doc(`service_requests/${id}`).set({customerId:'sc-customer',technicianId,title:'Local schedule test',status,
  ...(legacy?{}:schedule('2099-10-10',time)),createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
}
before(async()=>{
 fsdk.setLogLevel('silent');
 for(const uid of ['sc-tech-a','sc-tech-b','sc-tech-c','sc-tech-d','sc-tech-e','sc-customer','sc-foreign']){
  const role=uid.startsWith('sc-tech')?'technician':'customer',email=uid+'@example.test',password=randomBytes(24).toString('base64url');
  await auth.createUser({uid,email,password,emailVerified:true});
  await db.doc(`users/${uid}`).set({uid,role,accountStatus:'active',emailVerified:true,technicianApprovalStatus:'approved',availability:'available'});
  if(role==='technician')await db.doc(`technician_map_profiles/${uid}`).set({technicianId:uid,approved:true,availability:'available'});
  const client=initializeApp({projectId:'demo-servicepilot-review-author',apiKey:'emulator-only'},uid),clientAuth=getAuth(client),clientDb=fsdk.getFirestore(client);
  connectAuthEmulator(clientAuth,'http://'+hosts[1],{disableWarnings:true});fsdk.connectFirestoreEmulator(clientDb,hosts[0].split(':')[0],Number(hosts[0].split(':')[1]));
  await signInWithEmailAndPassword(clientAuth,email,password);clients.set(uid,{app:client,auth:clientAuth,db:clientDb});
 }
});
after(async()=>{for(const c of clients.values()){await fsdk.terminate(c.db);await deleteApp(c.app);}await db.terminate();await deleteAdmin(app);});
test('simultaneous overlapping accepts serialize on the technician lock; adjacent reservations and idempotent retry work',async()=>{
 await seed('sc-overlap-a','sc-tech-a');await seed('sc-overlap-b','sc-tech-a');
 const outcomes=await Promise.allSettled(['sc-overlap-a','sc-overlap-b'].map(requestId=>call('sc-tech-a',{action:'accept',requestId})));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.ok(outcomes.some(r=>r.reason?.code==='booking/overlap'));
 const id=outcomes[0].status==='fulfilled'?'sc-overlap-a':'sc-overlap-b';await call('sc-tech-a',{action:'accept',requestId:id});
 assert.equal((await db.collection('notifications').where('requestId','==',id).get()).size,1);
 await seed('sc-adjacent','sc-tech-a','11:00 AM');await call('sc-tech-a',{action:'accept',requestId:'sc-adjacent'});
 assert.equal((await db.doc('users/sc-tech-a').get()).data().availability,'available');
 const proposal={action:'propose',requestId:id,date:'2099-10-10',time:'12:00 PM',durationMinutes:60};
 await call('sc-customer',proposal);await call('sc-tech-a',{action:'approve',requestId:id,proposalRevision:1});
 const notices=(await db.collection('notifications').where('requestId','==',id).get()).size;
 await call('sc-customer',proposal);assert.equal((await db.doc('service_requests/'+id).get()).data().scheduleProposal,undefined);
 assert.equal((await db.collection('notifications').where('requestId','==',id).get()).size,notices,'lost proposal acknowledgement after approval must not recreate it');
});
test('pending requests reserve no time; rescheduling swaps reservations only after technician approval and rechecks competing accepts',async()=>{
 await seed('sc-rescheduled','sc-tech-b','09:00 AM');await call('sc-tech-b',{action:'accept',requestId:'sc-rescheduled'});
 await seed('sc-reschedule-competitor','sc-tech-b','01:00 PM');
 const proposal={action:'propose',requestId:'sc-rescheduled',date:'2099-10-10',time:'01:00 PM',durationMinutes:60};
 await call('sc-customer',proposal);await call('sc-customer',proposal);
 let saved=(await db.doc('service_requests/sc-rescheduled').get()).data();assert.equal(saved.preferredTime,'09:00 AM');assert.equal(saved.scheduleProposal.revision,1);
 const outcomes=await Promise.allSettled([call('sc-tech-b',{action:'approve',requestId:'sc-rescheduled',proposalRevision:1}),call('sc-tech-b',{action:'accept',requestId:'sc-reschedule-competitor'})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 await call('sc-customer',{...proposal,time:'03:00 PM'});await call('sc-customer',{...proposal,time:'04:00 PM'});
 saved=(await db.doc('service_requests/sc-rescheduled').get()).data();assert.ok(saved.scheduleProposal.revision>1);
 await assert.rejects(call('sc-tech-b',{action:'approve',requestId:'sc-rescheduled',proposalRevision:1}),e=>e.code==='booking/conflict');
});
test('legacy unknown intervals block acceptance until explicitly reviewed; no inferred duration or migration',async()=>{
 await seed('sc-legacy','sc-tech-c','10:00 AM','assigned',true);await seed('sc-after-legacy','sc-tech-c');
 await assert.rejects(call('sc-tech-c',{action:'accept',requestId:'sc-after-legacy'}),e=>e.code==='booking/schedule-review');
 assert.equal((await db.doc('service_requests/sc-legacy').get()).data().durationMinutes,undefined);
 const review={action:'review-legacy',requestId:'sc-legacy',date:'2099-10-10',time:'02:00 PM',durationMinutes:60};
 await call('sc-tech-c',review);
 const saved=(await db.doc('service_requests/sc-legacy').get()).data(),lock=(await db.doc('booking_schedule_locks/sc-tech-c').get()).data();
 const notices=(await db.collection('notifications').where('requestId','==','sc-legacy').get()).size;
 await call('sc-tech-c',review);
 assert.deepEqual((await db.doc('service_requests/sc-legacy').get()).data(),saved);
 assert.deepEqual((await db.doc('booking_schedule_locks/sc-tech-c').get()).data(),lock);
 assert.equal((await db.collection('notifications').where('requestId','==','sc-legacy').get()).size,notices);
 await assert.rejects(call('sc-tech-c',{...review,time:'03:00 PM'}),e=>e.code==='booking/conflict');
 await call('sc-tech-c',{action:'accept',requestId:'sc-after-legacy'});
});
test('terminal cancellation releases its reservation and new adjacent work can be accepted while manual availability stays unchanged',async()=>{
 await seed('sc-cancel','sc-tech-d');await call('sc-tech-d',{action:'accept',requestId:'sc-cancel'});
 const c=clients.get('sc-tech-d'),requests=loadService('src/services/request.service.ts',{'@/src/firebase/config':c,'firebase/firestore':fsdk,
  '@/functions/src/domain/availability':require('./lib/domain/availability.js'),'@/src/constants/serviceRequests':loadService('src/constants/serviceRequests.ts',{})});
 await requests.updateTechnicianRequestStatus('sc-cancel','cancelled',{reason:'Local cancellation'});
 await seed('sc-released','sc-tech-d');await call('sc-tech-d',{action:'accept',requestId:'sc-released'});
});
test('foreign accounts, disabled/approval-revoked technicians, invalid durations and direct client acceptance cannot bypass the trusted boundary',async()=>{
 await seed('sc-boundary','sc-tech-e');
 await assert.rejects(call('sc-tech-e',{action:'approve',requestId:'sc-boundary',proposalRevision:0}),e=>e.code==='booking/conflict');
 await assert.rejects(call('sc-foreign',{action:'accept',requestId:'sc-boundary'}),e=>e.code==='permission-denied');
 await assert.rejects(call('sc-customer',{action:'propose',requestId:'sc-boundary',date:'2099-10-10',time:'10:00 AM',durationMinutes:0}));
 const tech=clients.get('sc-tech-e');
 await assert.rejects(fsdk.updateDoc(fsdk.doc(tech.db,'service_requests','sc-boundary'),{status:'accepted',acceptedAt:fsdk.serverTimestamp(),updatedAt:fsdk.serverTimestamp()}),e=>e.code==='permission-denied');
 for(const patch of [{accountStatus:'disabled'},{accountStatus:'deleted'},{technicianApprovalStatus:'revoked'},{lifecyclePending:true}]){
  await db.doc('users/sc-tech-e').update(patch);await assert.rejects(call('sc-tech-e',{action:'accept',requestId:'sc-boundary'}),e=>e.code==='permission-denied');
  await db.doc('users/sc-tech-e').update({accountStatus:'active',technicianApprovalStatus:'approved',lifecyclePending:false});
 }
 assert.equal((await db.doc('service_requests/sc-boundary').get()).data().status,'requested');
});
test('real Firebase beforeAuthStateChanged middleware blocks direct replacement/sign-out until old-identity cleanup completes',async()=>{
 const a=clients.get('sc-tech-e').auth,b=clients.get('sc-foreign').auth,original=a.currentUser,seen=[];
 const {installLocationAuthGuard}=loadService('src/firebase/locationAuthGuard.ts',{});
 let fail=true;
 const stop=installLocationAuthGuard(a,beforeAuthStateChanged,async()=>({prepareAuthChange:async uid=>{
  assert.equal(a.currentUser.uid,uid);seen.push(uid);if(fail)throw Error('Local cleanup unavailable');
 }}));
 try{
  await assert.rejects(updateCurrentUser(a,b.currentUser));assert.equal(a.currentUser.uid,original.uid);
  fail=false;await updateCurrentUser(a,b.currentUser);assert.equal(a.currentUser.uid,'sc-foreign');
  await signOut(a);assert.equal(a.currentUser,null);assert.deepEqual(seen,['sc-tech-e','sc-tech-e','sc-foreign']);
 }finally{stop();await updateCurrentUser(a,original);}
});
