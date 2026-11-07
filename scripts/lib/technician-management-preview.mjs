// Local browser fixtures only. This Vite instance never initializes Firebase or
// contacts a backend. These module substitutions are not part of the app build.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from '../../admin-web/node_modules/vite/dist/node/index.js';
import ts from 'typescript';
const tsx = source => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;

const fixture = `
const base = {role:'technician', emailVerified:true, accountStatus:'active', phone:'0710000000', address:'Synthetic private test address',
  specialization:'Electrical', serviceDistrictIds:['kandy'], serviceAreasByDistrict:{kandy:'lk-postal-20400-peradeniya'},
  experience:'7 years in residential electrical maintenance', qualifications:'BSE degree', certifications:'Electrical safety training',
  technicianApprovalStatus:'pending', createdAt:new Date('2026-11-01T06:30:00Z'), availability:'offline'};
const row=(id,fullName,patch={})=>({...base,id,uid:id,fullName,email:id+'@example.test',...patch});
export const fixture = window.__technicianUi = {
 rows:[row('01-amal','Amal Perera'),row('02-kasun','Kasun Silva'),
 row('03-legacy','Tharindu Fernando',{experience:'BSE degree',qualifications:'Technical training',serviceAreasByDistrict:undefined}),
 row('04-approved','Nimali Jayasinghe',{technicianApprovalStatus:'approved',reviewedBy:'other-reviewer',reviewedAt:new Date('2026-11-03T06:30:00Z')}),
 row('05-rejected','Ruwan Senanayake',{technicianApprovalStatus:'rejected',reviewedBy:'reviewer',reviewedAt:new Date('2026-11-03T06:30:00Z'),rejectionReason:'Please provide your certificate.'}),
 row('06-incomplete','Incomplete applicant',{phone:''}),row('07-disabled','Disabled applicant',{accountStatus:'disabled'}),
 ...Array.from({length:52},(_,i)=>row('bulk-'+String(i).padStart(2,'0'),'Test Technician '+(i+1)))],
 state:'ready', conflict:false, submissions:[], lifecycle:[], listeners:new Set(),
 loginActualRole:'dispatcher',loginDenied:'',loginCalls:0,decisionEmails:[],emailStatus:'not_configured',
 emit(){for(const update of [...this.listeners])update();},
 setState(state){this.state=state;this.emit();}
};
`;
const sdk = `
import {fixture as f} from '/__tm_fixture.js';
export const collection=(_,path)=>({path});
export const doc=(_,collection,id)=>({path:collection+'/'+id,id});
export const where=(field,op,value)=>({type:'where',field,op,value});
export const documentId=()=>'id';
export const orderBy=field=>({type:'order',field});
export const startAfter=value=>({type:'after',value});
export const limit=value=>({type:'limit',value});
export const query=(collection,...constraints)=>({collection,constraints});
export async function getDocFromServer(ref){const data=f.rows.find(r=>r.id===ref.id);return{id:ref.id,exists:()=>!!data,data:()=>data};}
export function onSnapshot(q,options,next,error){
 let active=true;
 const update=()=>{if(!active||f.state==='loading')return;
 if(f.state==='error'){error({code:'unavailable'});return;}
 let rows=[...f.rows].sort((a,b)=>a.id.localeCompare(b.id));
 for(const c of q.constraints){if(c.type==='where')rows=rows.filter(r=>r[c.field]===c.value);if(c.type==='after')rows=rows.filter(r=>r.id>c.value);if(c.type==='limit')rows=rows.slice(0,c.value);}
 next({metadata:{fromCache:false},size:rows.length,docs:rows.map(r=>({id:r.id,data:()=>r}))});};
 f.listeners.add(update);const timer=setTimeout(update,20);
 return()=>{active=false;clearTimeout(timer);f.listeners.delete(update);};
}
`;

export async function startTechnicianPreview() {
  const root = resolve('admin-web');
  const plugin = {
    name: 'local-technician-review-fixtures', enforce: 'pre',
    resolveId(id) { if (id.startsWith('/__tm_')) return '\0' + id; },
    transformIndexHtml(html) { return html.replace('/src/main.tsx', '/__tm_entry.tsx'); },
    load(id) {
      if (id === '\0/__tm_fixture.js') return fixture;
      if (id === '\0/__tm_firestore.js') return sdk;
      if (id === '\0/__tm_entry.tsx') return tsx(`
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';
import '/src/index.css';import AdminLayout from '/src/layouts/AdminLayout.tsx';
import Applications from '/src/pages/dispatcher/DispatcherApplications.tsx';
import Login from '/src/pages/Login.tsx';
import AdminTechnicians from '/src/pages/Technicians.tsx';import DispatcherTechnicians from '/src/pages/dispatcher/DispatcherTechnicians.tsx';
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
<Route path="/login" element={<Login/>}/>
<Route path="/admin/dashboard" element={<p>Local Super Admin destination fixture</p>}/>
<Route path="/dispatcher/dashboard" element={<p>Local Dispatcher destination fixture</p>}/>
<Route element={<AdminLayout portal="admin"/>}><Route path="/admin/applications" element={<Applications/>}/><Route path="/admin/technicians" element={<AdminTechnicians/>}/></Route>
<Route element={<AdminLayout portal="dispatcher"/>}><Route path="/dispatcher/applications" element={<Applications/>}/><Route path="/dispatcher/technicians" element={<DispatcherTechnicians/>}/></Route>
</Routes></BrowserRouter>);`);
      const path = id.replaceAll('\\', '/').split('?')[0];
      if (path.endsWith('/src/auth/AdminAuthContext.tsx')) return `import{fixture as f}from'/__tm_fixture.js';export function useAdminAuth(){return{
        firebaseUser:{uid:'reviewer'},profile:location.pathname==='/login'?null:{id:'reviewer',uid:'reviewer',fullName:'Test Reviewer',email:'reviewer@example.test',
        role:location.pathname.startsWith('/admin/')?'super_admin':'dispatcher',accountStatus:'active'},loading:false,accessDenied:'',logout:async()=>{},
        signIn:async(email,password,requested)=>{f.loginCalls++;await new Promise(r=>setTimeout(r,80));if(f.loginDenied)throw Error(f.loginDenied);
        if(requested!==f.loginActualRole)throw Object.assign(Error('This account uses the '+(f.loginActualRole==='dispatcher'?'Dispatcher':'Super Admin')+' portal. Switch your selection and sign in again.'),{code:'auth/portal-mismatch',actualRole:f.loginActualRole});
        return{role:f.loginActualRole};}};}`;
      if (path.endsWith('/src/firebase/config.ts')) return `export const auth={currentUser:{uid:'reviewer'}};export const db={};`;
      if (path.endsWith('/src/hooks/useTechnicianUsers.ts') || path.endsWith('/src/components/technicians/TechnicianManagement.tsx'))
        return readFileSync(id, 'utf8').replace('"firebase/firestore"', '"/__tm_firestore.js"');
      if (path.endsWith('/src/components/WebNotificationBell.tsx')) return `export default function Bell(){return null;}`;
      if (path.endsWith('/src/components/TechnicianRating.tsx')) return `export function TechnicianRating(){return <span>No reviews yet</span>;}`;
      if (path.endsWith('/src/services/technicianApprovalService.ts')) return `import{fixture as f}from'/__tm_fixture.js';export async function reviewTechnicianApplication(input){
        f.submissions.push(input);await new Promise(r=>setTimeout(r,120));const row=f.rows.find(r=>r.uid===input.technicianUid);
        if(f.conflict){f.conflict=false;row.technicianApprovalStatus='approved';row.reviewedBy='another-reviewer';f.emit();throw new Error('Application already reviewed, unverified or incomplete. Refresh the applications list.');}
        row.technicianApprovalStatus=input.status;row.reviewedBy='reviewer';row.reviewedAt=new Date();row.rejectionReason=input.rejectionReason;f.emit();}`;
      if (path.endsWith('/src/services/accountLifecycleService.ts')) return `import{fixture as f}from'/__tm_fixture.js';
        export function getEffectiveAccountStatus(s){return s==='disabled'||s==='deleted'?s:'active';}
        export function accountRoleLabel(){return'Technician';}
        export async function updateManagedAccountLifecycle(input){f.lifecycle.push(input);const row=f.rows.find(r=>r.uid===input.target.uid);row.accountStatus=input.action==='enable'?'active':input.action==='disable'?'disabled':'deleted';f.emit();}`;
      if (path.endsWith('/src/services/dispatcherProvisioningService.ts')) return `import{fixture as f}from'/__tm_fixture.js';
        const result=uid=>({technicianUid:uid,revision:'a'.repeat(64),status:f.emailStatus,retryable:f.emailStatus!=='submitted'});
        export const getTechnicianDecisionEmailStatus=async uid=>result(uid);
        export const requestTechnicianDecisionEmail=async(uid,revision)=>{f.decisionEmails.push({uid,revision});return result(uid);};`;
    },
  };
  const server = await createServer({ root, plugins: [plugin], server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  await server.listen();
  return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` };
}
