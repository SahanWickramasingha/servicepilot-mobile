import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const {colomboStart,bookingInterval,intervalsOverlap}=loadService('functions/src/domain/scheduling.ts',{});
test('Colombo scheduling is timezone-independent, validates real dates and requires explicit whole-minute duration',()=>{
 for(const zone of ['Asia/Colombo','UTC','America/Los_Angeles']){
  const old=process.env.TZ;process.env.TZ=zone;
  assert.equal(colomboStart('2099-10-10','10:00 AM'),Date.parse('2099-10-10T04:30:00Z'));
  assert.equal(colomboStart('2099-10-10','12:00 AM'),Date.parse('2099-10-09T18:30:00Z'));
  assert.equal(colomboStart('2099-10-10','12:00 PM'),Date.parse('2099-10-10T06:30:00Z'));process.env.TZ=old;
 }
 for(const date of ['2099-02-30','not-a-date','2099-13-01'])assert.throws(()=>colomboStart(date,'10:00 AM'));
 for(const time of ['00:00 AM','13:00 PM','10:65 AM'])assert.throws(()=>colomboStart('2099-10-10',time));
 for(const duration of [undefined,0,-1,1.5,NaN,Infinity])assert.throws(()=>bookingInterval('2099-10-10','10:00 AM',duration));
 const a=bookingInterval('2099-10-10','10:00 AM',60), adjacent=bookingInterval('2099-10-10','11:00 AM',60);
 assert.equal(intervalsOverlap(a,adjacent),false);assert.equal(intervalsOverlap(a,{start:a.end-1,end:a.end+1}),true);
});
