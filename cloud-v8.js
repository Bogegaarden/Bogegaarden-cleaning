/* Bøgegården 8.0: Supabase Auth + guarded shared JSON persistence. */
(()=>{'use strict';
const BASE='https://hzzidngvnwohecsmngqt.supabase.co';
const KEY='sb_publishable_0lCS1maq9zSOmI0tgg6w9A_fi1xomVK';
const TOKEN_KEY='boegegaarden_auth_v8';
const msg=document.getElementById('cloudmsg'),imp=document.getElementById('cloudImport'),reload=document.getElementById('cloudReload'),login=document.getElementById('cloudLogin'),logout=document.getElementById('cloudLogout');
let auth=null,house=null,rev=null,mode='local',busy=false,pending=false,saveTimer=null,editing=false;
const note=(t,cl='')=>{msg.textContent=t;msg.className=cl};
const snapshot=()=>JSON.parse(JSON.stringify(db));
function storeAuth(a){auth=a;if(a)localStorage.setItem(TOKEN_KEY,JSON.stringify(a));else localStorage.removeItem(TOKEN_KEY)}
async function request(path,{method='GET',body,token=auth?.access_token}={}){
const headers={'apikey':KEY,'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
const res=await fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
const txt=await res.text();let data;try{data=txt?JSON.parse(txt):null}catch{data=txt}
if(!res.ok)throw Error((data?.message||data?.error_description||data?.error||data?.details||txt||'HTTP '+res.status).slice(0,350));return data;
}
async function refresh(){if(!auth?.refresh_token)throw Error('Log ind igen');const a=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:auth.refresh_token},token:null});storeAuth(a)}
async function validAuth(){if(!auth)return false;if(auth.expires_at && Date.now()/1000>auth.expires_at-90)await refresh();return true}
async function loadShared(){
await validAuth();const members=await request('/rest/v1/boegegaarden_members?select=household_id,display_name&user_id=eq.'+encodeURIComponent(auth.user.id));
if(!Array.isArray(members)||members.length!==1){mode='local';note('Ingen entydig husstand knyttet til denne bruger. Lokale data er bevaret.','warning');return}
house=members[0].household_id;const rows=await request('/rest/v1/boegegaarden_data?select=content,revision&household_id=eq.'+house);
if(!Array.isArray(rows)||rows.length>1)throw Error('Uventet svar fra databasen');
if(rows.length===0){mode='await-import';imp.hidden=false;reload.hidden=true;note('Fælles database er tom. Overfør data fra én telefon først.','warning');return}
const remote=rows[0];if(!remote.content||!Array.isArray(remote.content.rooms)||!Array.isArray(remote.content.tasks)||!Array.isArray(remote.content.history))throw Error('Fælles data har et ukendt format');
// Never silently overwrite unuploaded edits or the only local copy.
if(mode==='conflict'||pending){note('Lokale ændringer afventer. Hent sikkerhedskopi før du fortsætter.','warning');return}
const local=localStorage.getItem('boegegaarden_v1');if(local&&mode==='local'&&local!==JSON.stringify(remote.content)){
try{localStorage.setItem('boegegaarden_before_cloud_v8',local)}catch{}
}
db=remote.content;db.dismissedSuggestions??=[];localStorage.setItem('boegegaarden_v1',JSON.stringify(db));rev=Number(remote.revision);mode='shared';imp.hidden=true;reload.hidden=false;note('Fælles data er opdateret · '+(members[0].display_name||'Logget ind'),'good');render();
}
async function sendSave(){if(mode!=='shared'||busy||!pending)return;busy=true;const content=snapshot(),oldRev=rev;try{
await validAuth();const result=await request('/rest/v1/rpc/boegegaarden_save',{method:'POST',body:{p_household_id:house,p_expected_revision:oldRev,p_content:content}});
if(typeof result!=='number')throw Error('Uventet svar fra gemmefunktionen');rev=result;pending=JSON.stringify(content)!==JSON.stringify(db);note(pending?'Gemmer flere ændringer…':'Gemt i fælles database','good');busy=false;if(pending)sendSave();
}catch(e){busy=false;mode='conflict';note('IKKE gemt i fælles database: '+e.message+'. Eksportér sikkerhedskopi, før du henter nyeste.','warning');reload.hidden=false;}
}
window.cloudQueueSave=()=>{if(mode!=='shared')return;pending=true;note('Gemmer…');clearTimeout(saveTimer);saveTimer=setTimeout(sendSave,500)};
async function connect(){try{note('Forbinder…');await loadShared()}catch(e){mode='local';note('Forbindelse mislykkedes: '+e.message+'. Lokale data er bevaret.','warning')}}
login.onclick=async()=>{const email=document.getElementById('cloudEmail').value.trim(),password=document.getElementById('cloudPassword').value;if(!email||!password){note('Udfyld e-mail og adgangskode.','warning');return}login.disabled=true;try{const a=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},token:null});storeAuth(a);document.getElementById('cloudPassword').value='';login.hidden=true;logout.hidden=false;await connect()}catch(e){note('Login mislykkedes: '+e.message,'warning')}finally{login.disabled=false}};
logout.onclick=()=>{if(pending||mode==='conflict'){note('Eksportér først en sikkerhedskopi af dine lokale ændringer.','warning');return}storeAuth(null);mode='local';house=null;rev=null;login.hidden=false;logout.hidden=true;imp.hidden=true;reload.hidden=true;note('Logget ud. Lokale data er bevaret.')};
imp.onclick=async()=>{if(mode!=='await-import'||!house)return;if(!confirm('Overfør alle opgaver, områder og historik fra DENNE telefon til den fælles database? Kontrollér først, at denne telefon har de korrekte data.'))return;imp.disabled=true;try{await validAuth();const result=await request('/rest/v1/rpc/boegegaarden_initialize',{method:'POST',body:{p_household_id:house,p_content:snapshot()}});if(typeof result!=='number')throw Error('Uventet svar');mode='local';await connect()}catch(e){note('Overførsel ikke gennemført: '+e.message,'warning')}finally{imp.disabled=false}};
reload.onclick=async()=>{if(pending||mode==='conflict'){if(!confirm('Dine lokale ændringer er muligvis ikke gemt i Supabase. Download først sikkerhedskopi. Vil du alligevel hente den fælles version?'))return;pending=false;mode='local'}await connect()};
document.getElementById('cloudExport').onclick=()=>{const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),version:'8.0',data:snapshot()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Boegegaarden_sikkerhedskopi_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000)};
try{auth=JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')}catch{}
if(auth){login.hidden=true;logout.hidden=false;connect()}
window.addEventListener('focus',()=>{if(mode==='shared'&&!pending&&!busy)connect()});
})();