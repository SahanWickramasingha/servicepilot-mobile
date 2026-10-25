// Local checks only. Logs/manifests intentionally exclude .env, credentials and device data.
import { spawn, execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const output=join(root,'.expo','workflow-final',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(output,{recursive:true});
function filesAt(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
 const path=join(directory,entry.name);return entry.isDirectory()?filesAt(path):[path];
});}
function hashes(){
 const files=['app','src','functions/src','scripts/tests','scripts/lib','public/auth'].flatMap(p=>filesAt(join(root,p))).filter(p=>/\.(tsx?|mjs|js|json)$/.test(p));
 for(const file of ['AGENTS.md','package.json','package-lock.json','tsconfig.json','app.json','app.config.ts','firebase.json','firebase.workflow-test.json','firestore.rules','storage.rules','firestore.indexes.json',
  'functions/package.json','functions/package-lock.json','functions/tsconfig.json','functions/tsconfig.dev.json','functions/.eslintrc.js','functions/eslint.config.js','eslint.config.js','scripts/check-workflow-types.mjs','scripts/validate-workflow-snapshot.mjs'])if(existsSync(join(root,file)))files.push(join(root,file));
 return Object.fromEntries([...new Set(files)].sort().map(file=>[relative(root,file).replaceAll('\\','/'),createHash('sha256').update(readFileSync(file)).digest('hex')]));
}
const manifest={startedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']),gitStatusBefore:git(['status','--short']),
 upstream:git(['rev-parse','--abbrev-ref','--symbolic-full-name','@{upstream}']),aheadBehind:git(['rev-list','--left-right','--count','HEAD...@{upstream}']),
 hashes:hashes(),commands:[],toolVersions:{node:process.version},snapshotUnchanged:false};
const save=()=>writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');save();
const quote=s=>'"'+s+'"';
const stopOwnedJava=pid=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
 `Stop-Process -Id ${Number(pid)} -Force -ErrorAction Stop`],{windowsHide:true,stdio:'ignore',timeout:10000});
const headless=['job-evidence','work-timer','gps-lifecycle','notification-recovery','foreground-sharing','device-location','customer-map-location','booking-policy','service-areas-distance','map-view-actions','rating-recovery','review-photo-picker','review-submission','subscription-reliability','account-session','technician-rating','signature-coordinates','auth-switch-location','notification-history','scheduling','auth-persistence','review-sync','review-indexes','technician-reviews-list','availability','performance','change-password','forgot-password'];
const integration=['job-evidence-emulator','availability-booking','map-location','reviewer-names','review-storage','scheduling-emulator','notification-history-emulator'];
const changed=git(['diff','--name-only']).split('\n').concat(git(['ls-files','--others','--exclude-standard']).split('\n')).filter(Boolean);
manifest.changedFiles=[...new Set(changed)].sort();save();
const mobile=changed.filter(p=>/^(app|src)\/.*\.tsx?$/.test(p));
const scripts=changed.filter(p=>/^scripts\/.*\.mjs$/.test(p));
const domains=changed.filter(p=>/^functions\/src\/.*\.ts$/.test(p)).map(p=>p.slice('functions/'.length));
const emulatorCommand='node --test --test-concurrency=1 --test-force-exit --test-timeout=90000 '+integration.map(p=>'scripts/tests/'+p+'.test.mjs').map(quote).join(' ');
const checks=[
 ['workflow-types','node scripts/check-workflow-types.mjs',root,true],
 ...(mobile.length?[['mobile-changed-lint','npx.cmd --no-install eslint '+mobile.map(quote).join(' '),root,true]]:[]),
 ...(scripts.length?[['scripts-changed-lint','npx.cmd --no-install eslint '+scripts.map(quote).join(' '),root,true]]:[]),
 ['functions-build','npm.cmd run build',join(root,'functions'),true],
 ...(domains.length?[['functions-changed-lint','.\\node_modules\\.bin\\eslint.cmd '+domains.map(quote).join(' '),join(root,'functions'),true]]:[]),
 ['headless','node --test '+headless.map(p=>'scripts/tests/'+p+'.test.mjs').map(quote).join(' '),root,true],
 ['emulators','firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.workflow-test.json --only auth,firestore,storage --log-verbosity QUIET '+quote(emulatorCommand.replaceAll('"','')),root,true],
 ['account-lifecycle-emulators','firebase.cmd emulators:exec --project demo-servicepilot-dispatcher --config firebase.workflow-test.json --only auth,firestore,storage --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/account-lifecycle.test.mjs"',root,true],
 ['password-reset-stage','node scripts/prepare-password-reset-emulator.mjs',root,true],
 ['password-reset-emulators','firebase.cmd emulators:exec --project demo-servicepilot-review-author --config firebase.workflow-test.json --only auth,hosting --log-verbosity QUIET "node --test --test-force-exit --test-timeout=90000 scripts/tests/password-reset-emulator.test.mjs"',root,true],
 ['diff-check','git diff --check',root,true],
 ['full-root-types','npx.cmd tsc --noEmit --incremental false',root,false],
 ['full-functions-lint','npm.cmd run lint',join(root,'functions'),false],
];
for(const [name,command,cwd,required]of checks){
 const javaIds=()=>new Set(execFileSync('powershell.exe',['-NoProfile','-Command','Get-Process -Name java -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'],{encoding:'utf8',windowsHide:true}).trim().split(/\s+/));
 const javaBefore=name.endsWith('emulators')?javaIds():new Set();
 const started=Date.now(),record={name,command,cwd:relative(root,cwd)||'.',required,startedAt:new Date(started).toISOString(),log:name+'.log'};
 const chunks=[];let cleanupTimer,forcedShutdown=false,ownedFirestorePid;
 const code=await new Promise(done=>{
  const child=spawn(command,{cwd,shell:true,windowsHide:true,env:{...process.env,DEBUG:'',CI:'1',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'1',XDG_CONFIG_HOME:join(root,'.firebase','review-config')}});
  const collect=chunk=>{
   chunks.push(chunk);const text=chunk.toString();
   if(name.endsWith('emulators')&&/Running script:/.test(text)){
    // Capture ownership while the test server is definitely listening. A Java 24
    // shutdown can briefly close/reopen its socket after the CLI itself exits.
    const running=javaIds(),connections=execFileSync('netstat.exe',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true});
    for(const line of connections.split('\n')){
     const match=/^\s*TCP\s+(?:127\.0\.0\.1|0\.0\.0\.0):8387\s+\S+\s+LISTENING\s+(\d+)/.exec(line);
     if(match&&running.has(match[1])&&!javaBefore.has(match[1]))ownedFirestorePid=match[1];
    }
   }
   if(name.endsWith('emulators')&&/Script exited (successfully|unsuccessfully)/.test(text)&&!cleanupTimer){
    // Java 24 can retain Firestore after the CLI reports the script outcome.
    // Kill only this spawned command's process tree if its shutdown stalls.
    cleanupTimer=setTimeout(()=>{forcedShutdown=true;spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},30000);
   }
  };
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.on('error',error=>{chunks.push(Buffer.from(error.message));done(-1);});
  child.on('close',exit=>{clearTimeout(cleanupTimer);done(exit??-1);});
 });
 const log=Buffer.concat(chunks).toString()
  .replace(/((?:oobCode|access_token|refresh_token|id_token)=)[^\s&"<>]+/gi,'$1[REDACTED]')
  .replace(/Bearer\s+[^\s"']+/g,'Bearer [REDACTED]')
  .replace(/(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]/g,'[REDACTED PUSH TOKEN]')
  .replace(/("(?:password|refreshToken|idToken|accessToken)"\s*:\s*")[^"]*(")/gi,'$1[REDACTED]$2');
 writeFileSync(join(output,name+'.log'),log);
 const orphanJavaCleanup=[],cleanupErrors=[];
 if(name.endsWith('emulators')&&/Running script:/.test(log)){
  const after=javaIds(),connections=execFileSync('netstat.exe',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true});
  if(ownedFirestorePid&&after.has(ownedFirestorePid)){
   try { stopOwnedJava(ownedFirestorePid);orphanJavaCleanup.push(Number(ownedFirestorePid)); }
   catch (error) { cleanupErrors.push({pid:Number(ownedFirestorePid),code:error.code??error.status}); }
  }
  for(const line of connections.split('\n')){
   const match=/^\s*TCP\s+(?:127\.0\.0\.1|0\.0\.0\.0):8387\s+\S+\s+LISTENING\s+(\d+)/.exec(line);
   if(match&&after.has(match[1])&&!javaBefore.has(match[1])&&!orphanJavaCleanup.includes(Number(match[1]))){
    try { stopOwnedJava(match[1]);orphanJavaCleanup.push(Number(match[1])); }
    catch (error) { cleanupErrors.push({pid:Number(match[1]),code:error.code??error.status}); }
   }
  }
 }
 const scriptPassed=name.endsWith('emulators')&&/Script exited successfully \(code 0\)/.test(log)&&/# fail 0\b/.test(log);
 Object.assign(record,{finishedAt:new Date().toISOString(),durationMs:Date.now()-started,processExitCode:code,
  exitCode:scriptPassed?0:code,forcedShutdownAfterReportedOutcome:forcedShutdown,ownedFirestorePid,orphanJavaCleanup,cleanupErrors});
 manifest.commands.push(record);save();console.log(`${name}: ${record.exitCode} (${record.durationMs} ms)`);
}
manifest.finishedAt=new Date().toISOString();manifest.gitStatusAfter=git(['status','--short']);
manifest.snapshotUnchanged=JSON.stringify(manifest.hashes)===JSON.stringify(hashes());
manifest.requiredChecksPassed=manifest.snapshotUnchanged&&manifest.commands.every(r=>!r.required||r.exitCode===0);save();
console.log('Recorded snapshot: '+relative(root,join(output,'manifest.json')));
process.exitCode=manifest.requiredChecksPassed?0:1;
