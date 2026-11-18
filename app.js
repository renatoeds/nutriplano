"use strict";
/* ============ utilidades ============ */
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const r0=n=>Math.round(n||0), r1=n=>Math.round((n||0)*10)/10;
const nf=(n,d=0)=>(n==null||isNaN(n))?"—":Number(n).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const clone=o=>JSON.parse(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uid=()=>Math.random().toString(36).slice(2,10);
function ymd(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function parseYmd(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)}
function diffDays(a,b){return Math.round((parseYmd(b)-parseYmd(a))/864e5)}
const TODAY=()=>ymd(new Date());
function fmtDate(s,o){return parseYmd(s).toLocaleDateString("pt-BR",o||{weekday:"long",day:"numeric",month:"long"})}
const short=s=>parseYmd(s).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
function weekStart(s){const d=parseYmd(s);const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return ymd(d)}
function toast(msg,ms=2600){let box=$("#toasts");if(!box){box=document.createElement("div");box.id="toasts";document.body.appendChild(box)}const t=document.createElement("div");t.className="toast";t.textContent=msg;box.appendChild(t);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>t.remove(),ms)}
const numv=v=>{const n=parseFloat(String(v??"").replace(",","."));return isNaN(n)?null:n};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function paceTxt(min,km){if(!(min>0&&km>0))return "";const p=min/km;const m=Math.floor(p),s=Math.round((p-m)*60);return `${m}:${String(s===60?0:s).padStart(2,"0")} /km · ${nf(km/(min/60),1)} km/h`}
function mdLite(t){ // markdown simples e seguro (texto da IA)
  const lines=esc(t).split(/\n/);let out="",inList=false;
  for(let l of lines){l=l.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
    if(/^\s*[-•*]\s+/.test(l)){if(!inList){out+="<ul>";inList=true}out+=`<li>${l.replace(/^\s*[-•*]\s+/,"")}</li>`;continue}
    if(inList){out+="</ul>";inList=false}
    if(/^#{1,4}\s/.test(l))out+=`<h4>${l.replace(/^#+\s/,"")}</h4>`;else if(l.trim())out+=`<p style="margin:4px 0">${l}</p>`;}
  if(inList)out+="</ul>";return out;
}

/* ============ Supabase ============ */
const CFG=window.NP_CONFIG||{};
let sb=null;
const S={user:null,profile:null,days:{},date:TODAY(),period:30,admin:false,ai:false,booted:false};
const timers={},pending={},writing={};
let hadError=false;
function setSync(){
  const el=$("#sync");if(!el)return;
  if(!S.user){el.innerHTML="";return}
  const saving=Object.keys(pending).length||Object.values(writing).some(Boolean);
  el.className="sync"+(hadError?" err":saving?" saving":"");
  el.innerHTML=`<i></i><span>${hadError?"Erro ao salvar":saving?"Salvando…":"Salvo"}</span>`;
}
async function loadData(){
  const pr=await sb.from("profiles").select("data").eq("user_id",S.user.id).maybeSingle();
  if(pr.error)throw pr.error;
  S.profile=pr.data&&pr.data.data&&Object.keys(pr.data.data).length?pr.data.data:null;
  S.days={};let from=0;const PAGE=1000;
  for(;;){
    const r=await sb.from("days").select("day,data").eq("user_id",S.user.id).order("day").range(from,from+PAGE-1);
    if(r.error)throw r.error;
    (r.data||[]).forEach(row=>{S.days[row.day]=row.data||{}});
    if(!r.data||r.data.length<PAGE)break;from+=PAGE;
  }
}
function save(docId,data){
  pending[docId]=clone(data);
  clearTimeout(timers[docId]);timers[docId]=setTimeout(()=>flush(docId),600);
  setSync();
}
async function writeDoc(docId,data){
  const now=new Date().toISOString();
  if(docId==="profile")return sb.from("profiles").upsert({user_id:S.user.id,data,updated_at:now});
  return sb.from("days").upsert({user_id:S.user.id,day:docId.slice(2),data,updated_at:now});
}
async function flush(docId){
  if(writing[docId])await writing[docId];
  const data=pending[docId];if(!data)return;delete pending[docId];
  writing[docId]=(async()=>{
    let r=await writeDoc(docId,data).catch(e=>({error:e}));
    if(r&&r.error){await sleep(800+Math.random()*800);r=await writeDoc(docId,data).catch(e=>({error:e}))}
    if(r&&r.error){hadError=true;console.warn(r.error);toast("Não consegui salvar. Verifique a internet.",4000);pending[docId]=pending[docId]||data}
    else hadError=false;
  })();
  setSync();await writing[docId];writing[docId]=null;
  if(pending[docId]&&!hadError)flush(docId);else setSync();
}
const saveDay=d=>save("d-"+d,S.days[d]);
const saveProfile=()=>save("profile",S.profile);
window.addEventListener("beforeunload",e=>{if(Object.keys(pending).length){Object.keys(pending).forEach(k=>flush(k));e.preventDefault();e.returnValue=""}});
async function aiCall(body){
  const {data,error}=await sb.functions.invoke("ai",{body});
  if(error){let code="ai_failed";try{const j=await error.context.json();code=j.error||code}catch(e){}throw {code}}
  return data;
}

/* ============ dias e cálculos ============ */
function newDay(){const m={};MEALS.forEach(([k])=>m[k]=[]);return {meals:m,workouts:[],wname:"",wmin:null,weight:null,water:0,note:"",incomplete:false}}
function getDay(d,create){if(!S.days[d]){if(!create)return null;S.days[d]=newDay()}const x=S.days[d];x.meals=x.meals||{};MEALS.forEach(([k])=>{if(!x.meals[k])x.meals[k]=[]});x.workouts=x.workouts||[];return x}
function allFoods(){return FOODS.concat((S.profile&&S.profile.customFoods)||[])}
function foodById(id){return allFoods().find(f=>f.id===id)}
function sumItems(items){const t={kcal:0,p:0,c:0,g:0,fib:0};(items||[]).forEach(i=>{t.kcal+=i.kcal||0;t.p+=i.p||0;t.c+=i.c||0;t.g+=i.g||0;t.fib+=i.fib||0});return t}
function dayTotals(d){const day=S.days[d];const t={kcal:0,p:0,c:0,g:0,fib:0};if(!day||!day.meals)return t;Object.values(day.meals).forEach(arr=>{const s=sumItems(arr);for(const k in t)t[k]+=s[k]});return t}
const dayKcal=d=>dayTotals(d).kcal;
const isLogged=d=>{const day=S.days[d];return !!day&&!day.incomplete&&dayKcal(d)>0};
function bmr(p,w){return 10*w+6.25*p.height-5*p.age+(p.sex==="m"?5:-161)}
function formulaTDEE(p,w){return bmr(p,w)*p.activity}
function minKcal(p){return p.sex==="m"?1500:1200}
function weightSeries(){
  const dates=Object.keys(S.days).filter(d=>S.days[d]&&S.days[d].weight>0).sort();
  if(!dates.length)return [];
  const end=dates[dates.length-1]>TODAY()?dates[dates.length-1]:TODAY();
  const out=[];let t=null,k=0;
  for(let d=dates[0];d<=end;d=addDays(d,1)){const w=S.days[d]&&S.days[d].weight>0?S.days[d].weight:null;if(w){k++;const a=Math.max(0.1,1/k);t=t==null?w:t+a*(w-t)}out.push({d,w,t})}
  return out;
}
function currentWeight(){const s=weightSeries();return s.length?s[s.length-1].t:(S.profile&&S.profile.weight)}
function refWeight(p,w){const h=p.height/100;const lim=25*h*h;return w>lim?lim+0.5*(w-lim):w}
function dailyDelta(p,w){return GOALS[p.goal].sign*(p.rate/100)*w*7700/7}
function buildTargets(p,tdee,w){
  let kcal=tdee+dailyDelta(p,w);let floored=false;
  if(kcal<minKcal(p)){kcal=minKcal(p);floored=true}
  kcal=Math.round(kcal/10)*10;const rw=refWeight(p,w);
  const prot=Math.round((p.protPerKg||GOALS[p.goal].prot)*rw);
  let fat=Math.round(Math.max((p.fatPerKg||GOALS[p.goal].fat)*rw,0.2*kcal/9));
  let carb=Math.round((kcal-prot*4-fat*9)/4);
  if(carb<50){fat=Math.round(Math.max(0.2*kcal/9,(kcal-prot*4-50*4)/9));carb=Math.max(0,Math.round((kcal-prot*4-fat*9)/4))}
  return {kcal,p:prot,c:carb,g:fat,floored};
}
function targetFor(d){
  const p=S.profile;const cs=(p.checkins||[]).filter(c=>c.date<=d);const c=cs.length?cs[cs.length-1]:null;
  if(!c||d>=(p.lastCheckin||""))return p.targets;return {kcal:c.kcal,p:c.p,c:c.c,g:c.g};
}
function cardioKcal(x){return x.kcalManual!=null&&x.kcalManual>0?x.kcalManual:(x.kcal||0)}
function exKcal(d){const day=S.days[d];if(!day)return 0;const w=currentWeight()||70;let k=0;(day.workouts||[]).forEach(x=>{if(x.type==="cardio")k+=cardioKcal(x)});if(day.wmin&&(day.workouts||[]).some(x=>x.type==="forca"))k+=STRENGTH_MET*w*day.wmin/60;return Math.round(k)}
function isTrainDay(d){const day=S.days[d];if(day&&day.train!=null)return !!day.train;return !!(day&&(day.workouts||[]).length)}
function dayTarget(d){
  const p=S.profile;const t=Object.assign({},targetFor(d));t.mode=null;
  const cy=p.cycle;
  if(cy&&cy.on&&cy.shift>0){const td=clamp(cy.trainDays||4,1,6);const train=isTrainDay(d);
    const delta=train?cy.shift:-Math.round(cy.shift*td/(7-td));t.kcal=Math.round((t.kcal+delta)/10)*10;t.c=Math.max(0,t.c+Math.round(delta/4));t.mode=train?"treino":"descanso"}
  if(p.addExercise){const e=exKcal(d);t.kcal+=e;t.c+=Math.round(e/4)}
  return t;
}
function estimateTDEE(){
  const p=S.profile;const end=addDays(TODAY(),-1);const W=28;
  const ser=weightSeries();const tmap={};ser.forEach(x=>tmap[x.d]=x.t);
  const w=currentWeight()||p.weight;const formula=formulaTDEE(p,w);const prior=p.tdee||formula;
  const winStart=addDays(end,-(W-1));const first=ser.length?ser[0].d:null;
  const start=first&&first>winStart?first:winStart;
  let logged=0,sum=0;for(let d=start;d<=end;d=addDays(d,1)){if(isLogged(d)){logged++;sum+=dayKcal(d)}}
  const span=diffDays(start,end);
  const weighins=Object.keys(S.days).filter(d=>d>=start&&d<=end&&S.days[d].weight>0).length;
  const base={ok:false,logged,span:Math.max(0,span),weighins,prior,formula,w};
  if(!first||span<7||logged<7||weighins<2||tmap[start]==null||tmap[end]==null)return base;
  const avg=sum/logged;const dKg=tmap[end]-tmap[start];const obs=avg-dKg*7700/span;
  const obsC=clamp(obs,formula*0.65,formula*1.45);
  const conf=Math.min(1,logged/21)*Math.min(1,(logged/(span+1))/0.8)*Math.min(1,weighins/8);
  let est=prior+(obsC-prior)*Math.max(0.15,conf)*0.7;est=clamp(est,prior-250,prior+250);
  return Object.assign(base,{ok:true,avg,dKg,obs,obsC,conf,est:Math.round(est)});
}
function checkinPreview(){
  const p=S.profile;const e=estimateTDEE();const w=currentWeight()||p.weight;let tdee;
  if(e.ok)tdee=e.est;else{const f=formulaTDEE(p,w);tdee=p.tdee?Math.round(p.tdee+(f-formulaTDEE(p,p.lastWeight||w))):Math.round(f)}
  return {e,tdee,w,targets:buildTargets(p,tdee,w)};
}
function applyCheckin(auto){
  const p=S.profile;const pv=checkinPreview();
  p.tdee=pv.tdee;p.targets=pv.targets;p.lastCheckin=TODAY();p.lastWeight=pv.w;
  p.checkins=(p.checkins||[]).filter(c=>c.date!==TODAY());
  p.checkins.push({date:TODAY(),tdee:pv.tdee,kcal:pv.targets.kcal,p:pv.targets.p,c:pv.targets.c,g:pv.targets.g,weight:r1(pv.w),obs:pv.e.ok?Math.round(pv.e.obs):null,conf:pv.e.ok?r1(pv.e.conf*100)/100:0,auto:!!auto});
  saveProfile();return pv;
}
const checkinDue=()=>S.profile&&S.profile.lastCheckin&&diffDays(S.profile.lastCheckin,TODAY())>=7;
function streak(){let d=TODAY();if(!(dayKcal(d)>0))d=addDays(d,-1);let n=0;while(dayKcal(d)>0){n++;d=addDays(d,-1)}return n}
function dayKm(d){const day=S.days[d];if(!day)return 0;return (day.workouts||[]).reduce((a,x)=>a+(x.type==="cardio"&&x.km>0?x.km:0),0)}

/* ============ rotas ============ */
const VIEWS=["diario","treino","progresso","corpo","coach","alimentos","calculadora","relatorio","perfil"];
let VIEW="diario";const charts={};
function killCharts(){Object.keys(charts).forEach(k=>{try{charts[k].destroy()}catch(e){}delete charts[k]})}
function route(){const h=location.hash.slice(1);VIEW=VIEWS.includes(h)?h:"diario";render()}
window.addEventListener("hashchange",()=>{if(S.user&&S.booted)route()});
function render(){
  killCharts();
  $("#topbar").style.display=S.user?"":"none";
  $$("#tabs a").forEach(a=>a.classList.toggle("on",a.dataset.v===VIEW));
  $("#tabs").style.visibility=S.profile?"visible":"hidden";
  if(!S.profile){$("#app").innerHTML=onboardingHTML();bindProfileForm(true);const f=$("#impf");if(f)f.addEventListener("change",importFile);setSync();return}
  ({diario:renderDiario,treino:renderTreino,progresso:renderProgresso,corpo:renderCorpo,coach:renderCoach,alimentos:renderAlimentos,calculadora:renderCalc,relatorio:renderRelatorio,perfil:renderPerfil})[VIEW]();
  setSync();window.scrollTo&&window.scrollTo(0,0);
}
function dayBar(){
  const d=S.date,isT=d===TODAY();
  const lbl=isT?"Hoje":d===addDays(TODAY(),-1)?"Ontem":fmtDate(d,{weekday:"short",day:"numeric",month:"short"});
  return `<div class="daybar"><button class="btn sm" data-act="day" data-n="-1" aria-label="Dia anterior">${ic("chevL")}</button><span class="dl">${esc(lbl)}</span><button class="btn sm" data-act="day" data-n="1" aria-label="Próximo dia">${ic("chevR")}</button><input type="date" id="dpick" value="${d}" max="${addDays(TODAY(),30)}">${isT?"":`<button class="btn sm ghost" data-act="today">Ir para hoje</button>`}</div>`;
}
function bindDayPicker(){const dp=$("#dpick");if(dp)dp.addEventListener("change",e=>{if(e.target.value){S.date=e.target.value;render()}})}

/* ============ LOGIN ============ */
const AUTH={mode:"login",msg:"",ok:""};
function renderAuth(){
  $("#topbar").style.display="none";
  const m=AUTH.mode;
  const title={login:"Entrar",signup:"Primeiro acesso",forgot:"Recuperar senha",recovery:"Definir nova senha",denied:"Acesso não liberado"}[m];
  let body="";
  if(m==="login")body=`<label class="f">E-mail<input type="text" id="au_email" autocomplete="email" inputmode="email"></label><label class="f" style="margin-top:10px">Senha<input type="password" id="au_pass" autocomplete="current-password"></label>
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:14px" data-act="au_login">Entrar</button>
    <div class="row" style="margin-top:12px;justify-content:space-between"><button class="linkbtn" data-act="au_mode" data-m="signup">Primeiro acesso? Criar senha</button><button class="linkbtn" data-act="au_mode" data-m="forgot">Esqueci a senha</button></div>`;
  if(m==="signup")body=`<p class="small muted" style="margin-top:0">Use o e-mail que o administrador liberou para você e escolha uma senha.</p><label class="f">E-mail<input type="text" id="au_email" autocomplete="email" inputmode="email"></label><label class="f" style="margin-top:10px">Crie uma senha (mín. 8 caracteres)<input type="password" id="au_pass" autocomplete="new-password"></label>
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:14px" data-act="au_signup">Criar acesso</button><div style="margin-top:12px"><button class="linkbtn" data-act="au_mode" data-m="login">‹ Voltar para entrar</button></div>`;
  if(m==="forgot")body=`<label class="f">E-mail<input type="text" id="au_email" autocomplete="email" inputmode="email"></label><button class="btn pri" style="width:100%;justify-content:center;margin-top:14px" data-act="au_forgot">Enviar link de recuperação</button><div style="margin-top:12px"><button class="linkbtn" data-act="au_mode" data-m="login">‹ Voltar</button></div>`;
  if(m==="recovery")body=`<label class="f">Nova senha (mín. 8 caracteres)<input type="password" id="au_pass" autocomplete="new-password"></label><button class="btn pri" style="width:100%;justify-content:center;margin-top:14px" data-act="au_newpass">Salvar nova senha</button>`;
  if(m==="denied")body=`<p class="small">O e-mail <b>${esc(S.user&&S.user.email||"")}</b> não está na lista de acesso do Nutri Plano. Peça ao administrador para liberar.</p><button class="btn" data-act="logout">Sair</button>`;
  $("#app").innerHTML=`<div class="auth"><div class="auth-brand">${brandLockup("brand-lg")}<div class="small muted" style="margin-top:10px">Dieta, treino e evolução — acesso restrito</div></div>
  <div class="card"><h1>${title}</h1>${body}<div class="err" id="au_err">${esc(AUTH.msg)}</div>${AUTH.ok?`<div class="ok">${esc(AUTH.ok)}</div>`:""}</div></div>`;
  const pw=$("#au_pass");if(pw)pw.addEventListener("keydown",e=>{if(e.key==="Enter"){const b=$(".auth .btn.pri");b&&b.click()}});
  const em=$("#au_email");if(em&&!em.value)em.focus();
}
function authErr(e){
  const m=String(e&&e.message||e||"");
  if(/Invalid login/i.test(m))return "E-mail ou senha incorretos.";
  if(/Email not confirmed/i.test(m))return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if(/Database error|não autorizado|saving new user/i.test(m))return "Este e-mail não está liberado. Peça ao administrador para incluir você.";
  if(/already registered|already been registered/i.test(m))return "Este e-mail já tem acesso — use “Entrar” ou “Esqueci a senha”.";
  if(/Password should|at least/i.test(m))return "A senha precisa ter pelo menos 8 caracteres.";
  if(/rate limit|security purposes/i.test(m))return "Muitas tentativas seguidas. Aguarde alguns minutos.";
  return m||"Não foi possível concluir. Tente de novo.";
}
async function authAction(a){
  AUTH.msg="";AUTH.ok="";const email=($("#au_email")||{}).value?$("#au_email").value.trim().toLowerCase():"";const pass=($("#au_pass")||{}).value||"";
  const errEl=$("#au_err");const btn=$(".auth .btn.pri");if(btn)btn.disabled=true;
  try{
    if(a==="au_login"){if(!email||!pass)throw {message:"Preencha e-mail e senha."};const {error}=await sb.auth.signInWithPassword({email,password:pass});if(error)throw error}
    if(a==="au_signup"){if(!email)throw {message:"Informe o e-mail."};if(pass.length<8)throw {message:"A senha precisa ter pelo menos 8 caracteres."};
      const {data,error}=await sb.auth.signUp({email,password:pass,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;
      if(data&&!data.session){AUTH.mode="login";AUTH.ok="Acesso criado! Enviamos um link de confirmação para o seu e-mail — confirme e depois entre aqui.";renderAuth()}}
    if(a==="au_forgot"){if(!email)throw {message:"Informe o e-mail."};const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;AUTH.ok="Se o e-mail tiver acesso, você vai receber um link para criar uma nova senha.";renderAuth()}
    if(a==="au_newpass"){if(pass.length<8)throw {message:"A senha precisa ter pelo menos 8 caracteres."};const {error}=await sb.auth.updateUser({password:pass});if(error)throw error;toast("Senha alterada");AUTH.mode="login";const {data}=await sb.auth.getSession();if(data.session)await startApp(data.session)}
  }catch(e){if(errEl)errEl.textContent=authErr(e)}
  finally{if(btn)btn.disabled=false}
}
let starting=null;
async function startApp(session){
  if(S.booted&&S.user&&S.user.id===session.user.id)return;
  if(starting)return starting;
  starting=startAppInner(session).finally(()=>{starting=null});return starting;
}
async function startAppInner(session){
  S.user=session.user;$("#app").innerHTML=`<div class="loading">Carregando seus dados…</div>`;
  const al=await sb.rpc("is_allowed");
  if(al.error||al.data!==true){AUTH.mode="denied";renderAuth();return}
  const ad=await sb.rpc("is_admin");S.admin=ad.data===true;
  try{await loadData()}catch(e){console.warn(e);$("#app").innerHTML=`<div class="card" style="max-width:520px;margin:40px auto">Não consegui carregar seus dados agora. Verifique a internet e <a href="">recarregue a página</a>.</div>`;return}
  S.booted=true;
  aiCall({action:"ping"}).then(r=>{S.ai=!!(r&&r.configured);if(S.ai&&(VIEW==="perfil"||VIEW==="progresso"))render()}).catch(()=>{S.ai=false});
  if(S.profile&&S.profile.autoApply&&checkinDue()){const pv=applyCheckin(true);setTimeout(()=>toast(`Check-in automático: nova meta ${nf(pv.targets.kcal)} kcal`,4000),400)}
  route();
}

/* ============ DIÁRIO ============ */
function ring(cons,target){
  const pct=target>0?cons/target:0;const R=60,C=2*Math.PI*R;const over=pct>1.05;const col=over?"var(--g)":"var(--accent)";
  return `<div class="ring"><svg viewBox="0 0 150 150" width="100%" height="100%"><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--soft)" stroke-width="13"/><circle cx="75" cy="75" r="${R}" fill="none" stroke="${col}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${C*Math.min(1,pct)} ${C}" ${pct<=0?'opacity="0"':""}/></svg>
  <div class="ctr"><div class="big num">${nf(Math.abs(target-cons))}</div><div class="tiny muted">${cons>target?"kcal acima":"kcal restantes"}</div></div></div>`;
}
function mbar(label,v,t,col,unit="g"){const pct=t>0?Math.min(100,v/t*100):0;return `<div class="mb"><div class="lbl"><span><b style="color:${col}">●</b> ${label}</span><span class="num"><b>${nf(v)}</b> / ${nf(t)} ${unit}</span></div><div class="bar"><i style="width:${pct}%;background:${col}"></i></div></div>`}
function itemQty(i){if(i.u==="x")return i.ul||"porção";if(i.u==="g")return `${nf(i.n,0)} g`;return `${nf(i.n,i.n%1?1:0)} ${i.ul} · ${nf(i.q)} g`}
function pcg(o){return `<span class="pcg"><b class="P">P</b> ${nf(o.p)} · <b class="C">C</b> ${nf(o.c)} · <b class="G">G</b> ${nf(o.g)}</span>`}
function renderDiario(){
  const p=S.profile,d=S.date,day=getDay(d,false)||newDay();
  const tot=dayTotals(d),tg=dayTarget(d),ex=exKcal(d);
  const waterT=p.waterMl||Math.round((currentWeight()||70)*35/250)*250;const cups=Math.ceil(waterT/250),have=Math.round((day.water||0)/250);
  const st=streak();const prev=addDays(d,-1);const prevDay=S.days[prev];
  const banner=checkinDue()&&d===TODAY()?`<div class="banner"><div class="sp"><b>Seu check-in semanal está pronto.</b><div class="small muted">Vou recalcular seu gasto real com base no que você comeu e na tendência do seu peso.</div></div><a class="btn pri" href="#coach">Ver ajuste</a></div>`:"";
  const cyc=p.cycle&&p.cycle.on;
  const meals=MEALS.map(([k,name])=>{
    const items=day.meals[k]||[];const s=sumItems(items);const canCopy=prevDay&&prevDay.meals&&(prevDay.meals[k]||[]).length;
    return `<div class="card meal"><div class="meal-h"><h3>${name}</h3><span class="kc num">${nf(s.kcal)} kcal</span>${items.length?pcg(s):""}<span class="sp"></span><button class="btn sm pri" data-act="add" data-meal="${k}">${ic("plus",15)} Adicionar</button></div>
      ${items.length?`<ul class="items">${items.map((i,ix)=>`<li data-act="edit" data-meal="${k}" data-ix="${ix}"><div class="nm"><div>${esc(i.name)}</div><div class="q">${esc(itemQty(i))}</div></div>${pcg(i)}<span class="kc num">${nf(i.kcal)} kcal</span><button class="iconbtn" data-act="del" data-meal="${k}" data-ix="${ix}" title="Remover">${ic("x",16)}</button></li>`).join("")}</ul>`:`<div class="empty">Nada registrado.</div>`}
      ${canCopy||items.length?`<div class="meal-f">${canCopy?`<button class="btn sm ghost" data-act="copymeal" data-meal="${k}">${ic("repeat",15)} Repetir de ${d===TODAY()?"ontem":short(prev)} (${nf(sumItems(prevDay.meals[k]).kcal)} kcal)</button>`:""}${items.length?`<button class="btn sm ghost" data-act="savemeal" data-meal="${k}">${ic("star",15)} Salvar esta refeição</button>`:""}</div>`:""}</div>`;}).join("");
  $("#app").innerHTML=`${dayBar()}${banner}
  <div class="grid g2" style="margin-bottom:14px">
    <div class="card"><div class="sum">${ring(tot.kcal,tg.kcal)}<div class="macros">
      <div class="row small"><span><b class="num" style="font-size:18px">${nf(tot.kcal)}</b> de <b class="num">${nf(tg.kcal)}</b> kcal</span>${tg.mode?`<span class="tag">${tg.mode==="treino"?"dia de treino":"dia de descanso"}</span>`:""}${p.addExercise&&ex?`<span class="tag">+${nf(ex)} do treino</span>`:""}</div>
      ${mbar("Proteína",tot.p,tg.p,"var(--p)")}${mbar("Carboidratos",tot.c,tg.c,"var(--c)")}${mbar("Gorduras",tot.g,tg.g,"var(--g)")}
      <div class="small muted">Fibras: <b class="num">${nf(tot.fib)}</b> / 25–35 g</div></div></div>
      ${cyc?`<div class="row" style="margin-top:12px"><span class="small muted">Hoje é dia de</span><div class="seg"><button class="${isTrainDay(d)?"on":""}" data-act="trainday" data-v="1">Treino</button><button class="${!isTrainDay(d)?"on":""}" data-act="trainday" data-v="0">Descanso</button></div></div>`:""}</div>
    <div class="card">
      <div class="kv"><span>Peso de hoje (kg)</span><input type="number" step="0.1" min="20" max="400" id="wInput" value="${day.weight||""}" placeholder="ex: 78,4" style="width:110px;text-align:right"></div>
      <div class="kv" style="display:block"><div class="row"><span>Água</span><span class="sp"></span><span class="num small"><b>${nf((day.water||0)/1000,2)}</b> / ${nf(waterT/1000,1)} L</span><button class="btn sm" data-act="water" data-n="-250">−</button><button class="btn sm" data-act="water" data-n="250">${ic("droplet",15)} + 250 ml</button></div><div class="water">${Array.from({length:cups},(_,i)=>`<i class="${i<have?"on":""}"></i>`).join("")}</div></div>
      <div class="kv"><span>Treino do dia</span><a href="#treino" class="small">${(day.workouts||[]).length?`${day.workouts.length} atividade(s) · ~${nf(ex)} kcal`:"Registrar treino →"}</a></div>
      ${(p.supps||[]).length?`<div class="kv" style="display:block"><div class="row"><span>Suplementos do dia</span><span class="sp"></span><a href="#perfil" class="tiny">editar</a></div><div class="chips" style="margin-top:6px">${p.supps.map(sp=>`<button class="chip ${(day.supps||{})[sp.id]?"on":""}" data-act="suppck" data-id="${esc(sp.id)}">${(day.supps||{})[sp.id]?ic("check",14)+" ":""}${esc(sp.name)}${sp.dose?` · ${esc(sp.dose)}`:""}</button>`).join("")}</div></div>`:`<div class="kv"><span>Suplementos do dia</span><a href="#perfil" class="small">Configurar rotina →</a></div>`}
      <div class="kv"><span>Sequência de registros</span><b class="num">${st} dia${st===1?"":"s"}</b></div>
      <label class="switch tiny muted" style="margin-top:8px"><input type="checkbox" id="incInput" ${day.incomplete?"checked":""}> Registro incompleto (não usar este dia no ajuste da dieta)</label>
    </div></div>
  <div class="grid">${meals}</div>
  <div class="card" style="margin-top:14px"><label class="f">Anotações do dia<textarea id="noteInput" rows="2" placeholder="Fome, sono, humor, eventos…">${esc(day.note||"")}</textarea></label>
  <div class="row" style="margin-top:10px"><span class="tiny muted" id="saveHint">Tudo é salvo automaticamente enquanto você usa.</span><span class="sp"></span><button class="btn pri" data-act="saveall">${ic("save")} Salvar dia</button></div></div>`;
  bindDayPicker();
  $("#wInput").addEventListener("change",e=>{const v=numv(e.target.value);const dd=getDay(d,true);dd.weight=v&&v>20?r1(v):null;saveDay(d);toast(dd.weight?"Peso registrado":"Peso removido")});
  $("#noteInput").addEventListener("input",e=>{getDay(d,true).note=e.target.value;saveDay(d)});
  $("#incInput").addEventListener("change",e=>{getDay(d,true).incomplete=e.target.checked;saveDay(d)});
}

/* ============ MODAL (adicionar alimento, rápido, criar, salvos, foto, receita) ============ */
const M={meal:null,food:null,edit:null,q:"",mode:"search"};
function showModal(){$("#modal").classList.remove("hidden")}
function closeModal(){$("#modal").classList.add("hidden");M.food=null;M.edit=null;M.photo=null;M.recipe=null}
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
const mealName=k=>(MEALS.find(m=>m[0]===k)||[,""])[1];
function openAdd(meal){M.meal=meal;M.food=null;M.edit=null;M.q="";M.mode="search";showModal();renderModal()}
function mhead(t,back=true){return `<div class="mhead">${back?`<button class="iconbtn" data-act="mback" aria-label="Voltar">${ic("chevL")}</button>`:""}<h3>${t}</h3><button class="iconbtn" data-act="close" aria-label="Fechar">${ic("x")}</button></div>`}
function renderModal(){
  const fn={qty:renderQty,quick:renderQuick,create:renderCreate,saved:renderSaved,photo:renderPhoto,recipe:renderRecipe,savemeal:renderSaveMeal}[M.mode];
  if(fn)return fn();
  const nSaved=(S.profile.saved||[]).length;
  $("#mbody").innerHTML=`${mhead("Adicionar em "+esc(mealName(M.meal)),false)}
  <input type="search" id="fsearch" placeholder="Buscar alimento — ex: arroz, frango, açaí, whey growth" value="${esc(M.q)}" autocomplete="off">
  <div class="chips" style="margin-top:10px">${S.ai?`<button class="chip" data-act="mphoto">${ic("camera",15)} Foto do prato</button>`:""}${nSaved?`<button class="chip" data-act="msaved">${ic("star",15)} Refeições salvas (${nSaved})</button>`:""}<button class="chip" data-act="mquick">${ic("zap",15)} Lançamento rápido</button><button class="chip" data-act="mcreate">${ic("plus",15)} Criar alimento</button>${S.ai?`<button class="chip" data-act="mcreate" data-ai="1">${ic("sparkles",15)} Estimar com IA</button>`:""}</div>
  <div id="fresults" class="flist"></div>`;
  const inp=$("#fsearch");inp.addEventListener("input",e=>{M.q=e.target.value;renderResults()});setTimeout(()=>inp.focus(),30);renderResults();
}
function searchFoods(q,limit=40){
  q=norm(q);if(!q)return [];const words=q.split(/\s+/);
  return allFoods().filter(f=>{const n=norm(f.name+" "+f.cat);return words.every(w=>n.includes(w))}).sort((a,b)=>{const an=norm(a.name).startsWith(q)?0:1,bn=norm(b.name).startsWith(q)?0:1;return an-bn||a.name.localeCompare(b.name)}).slice(0,limit);
}
function foodRow(f,act){return `<button class="fitem" data-act="${act}" data-fid="${esc(f.id)}"><div class="nm"><div>${esc(f.name)} ${f.recipe?'<span class="tag">receita</span>':f.ai?'<span class="tag ai">IA</span>':f.custom?'<span class="tag">meu</span>':""}</div><div class="tiny muted">${nf(f.kcal)} kcal · P ${nf(f.p,1)} · C ${nf(f.c,1)} · G ${nf(f.g,1)} por 100 g</div></div><span class="muted">${ic("chevR",16)}</span></button>`}
function renderResults(){
  const q=norm(M.q);let list;
  if(!q){const rec=(S.profile.recent||[]).map(foodById).filter(Boolean);list=rec.length?rec:FOODS.slice(0,12)}else list=searchFoods(q);
  $("#fresults").innerHTML=(!q?`<div class="tiny muted" style="margin:4px 8px">${(S.profile.recent||[]).length?"Usados recentemente":"Sugestões"}</div>`:"")+
  (list.length?list.map(f=>foodRow(f,"pick")).join(""):`<div class="empty">Nenhum alimento encontrado para “${esc(M.q)}”. Use “Criar alimento”${S.ai?" ou “Estimar com IA”":""}.</div>`);
}
function unitsFor(f){return [["g",1,"gramas (g) / ml"]].concat((f.portions||[]).map(([l,g],i)=>["p"+i,g,`${l} (${nf(g,g%1?1:0)} g)`]))}
function calcItem(f,n,u){
  const units=unitsFor(f);const un=units.find(x=>x[0]===u)||units[0];const q=n*un[1];const k=q/100;
  return {fid:f.id,name:f.name,n,u:un[0],ul:un[0]==="g"?"g":(f.portions[+un[0].slice(1)]||[""])[0],q:r1(q),kcal:r0(f.kcal*k),p:r1(f.p*k),c:r1(f.c*k),g:r1(f.g*k),fib:r1(f.fib*k)};
}
function renderQty(){
  const f=M.food;const units=unitsFor(f);let n,u;
  if(M.edit){n=M.edit.item.n;u=M.edit.item.u}else if(units.length>1){n=1;u="p0"}else{n=100;u="g"}
  $("#mbody").innerHTML=`${mhead(esc(f.name))}
  <div class="tiny muted">Por 100 g: ${nf(f.kcal)} kcal · P ${nf(f.p,1)} g · C ${nf(f.c,1)} g · G ${nf(f.g,1)} g · fibra ${nf(f.fib,1)} g${f.ai?" · valores estimados por IA":""}</div>
  <div class="row" style="margin-top:14px;flex-wrap:nowrap"><input type="number" id="qn" step="any" min="0" inputmode="decimal" value="${n}" style="max-width:120px;font-size:18px;font-weight:700"><select id="qu">${units.map(x=>`<option value="${x[0]}" ${x[0]===u?"selected":""}>${esc(x[2])}</option>`).join("")}</select></div>
  <div class="chips" style="margin-top:8px" id="qfast"></div><div class="preview" id="qprev"></div><div class="small muted" id="qpct"></div>
  <div class="row" style="margin-top:14px"><span class="sp"></span>${M.edit?`<button class="btn danger" data-act="mdel">Remover</button>`:""}<button class="btn pri" data-act="mconfirm">${M.edit?"Salvar":"Adicionar à refeição"}</button></div>`;
  const upd=()=>{
    const it=calcItem(f,numv($("#qn").value)||0,$("#qu").value);M.cur=it;
    $("#qprev").innerHTML=`<div><b class="num">${nf(it.kcal)}</b><span>kcal</span></div><div><b class="num" style="color:var(--p)">${nf(it.p,1)}</b><span>proteína g</span></div><div><b class="num" style="color:var(--c)">${nf(it.c,1)}</b><span>carbo g</span></div><div><b class="num" style="color:var(--g)">${nf(it.g,1)}</b><span>gordura g</span></div>`;
    const tg=dayTarget(S.date);const tot=dayTotals(S.date);const already=M.edit?M.edit.item.kcal:0;
    $("#qpct").innerHTML=`${nf(it.q)} g · ${nf(it.kcal/tg.kcal*100)}% da meta do dia. Depois disso: <b>${nf(tg.kcal-(tot.kcal-already+it.kcal))}</b> kcal restantes.`;
    const fast=$("#qu").value==="g"?[50,100,150,200,250]:[0.5,1,2,3];
    $("#qfast").innerHTML=fast.map(v=>`<button class="chip ${v==numv($("#qn").value)?"on":""}" data-act="qset" data-v="${v}">${nf(v,v%1?1:0)}${$("#qu").value==="g"?" g":""}</button>`).join("");
  };
  $("#qn").addEventListener("input",upd);$("#qu").addEventListener("change",()=>{$("#qn").value=$("#qu").value==="g"?100:1;upd()});
  $("#qn").addEventListener("keydown",e=>{if(e.key==="Enter")confirmQty()});upd();setTimeout(()=>$("#qn").select(),30);
}
function pushRecent(fid){if(!fid)return;const p=S.profile;p.recent=[fid].concat((p.recent||[]).filter(x=>x!==fid)).slice(0,20)}
function confirmQty(){
  const it=M.cur;if(!it||!(it.n>0)){toast("Informe a quantidade");return}
  const d=S.date,day=getDay(d,true);
  if(M.edit)day.meals[M.edit.meal][M.edit.ix]=it;else day.meals[M.meal].push(it);
  saveDay(d);pushRecent(it.fid);saveProfile();toast(`${it.name}: ${nf(it.kcal)} kcal ${M.edit?"atualizado":"adicionado"}`);closeModal();render();
}
function renderQuick(){
  $("#mbody").innerHTML=`${mhead("Lançamento rápido")}<p class="small muted" style="margin-top:0">Para quando você já sabe os valores (rótulo, restaurante com tabela).</p>
  <div class="form"><label class="f">Descrição<input type="text" id="kn" placeholder="ex: Marmita do restaurante"></label><label class="f">Calorias (kcal)<input type="number" id="kk" step="any"></label><label class="f">Proteína (g)<input type="number" id="kp" step="any"></label><label class="f">Carboidratos (g)<input type="number" id="kc" step="any"></label><label class="f">Gorduras (g)<input type="number" id="kg" step="any"></label></div>
  <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn pri" data-act="quicksave">Adicionar</button></div>`;
}
function quickSave(){
  const k=numv($("#kk").value),p=numv($("#kp").value)||0,c=numv($("#kc").value)||0,g=numv($("#kg").value)||0;
  const kcal=k!=null?k:p*4+c*4+g*9;if(!kcal){toast("Informe as calorias ou os macros");return}
  getDay(S.date,true).meals[M.meal].push({fid:null,name:$("#kn").value.trim()||"Lançamento rápido",n:1,u:"x",ul:"porção",q:0,kcal:r0(kcal),p:r1(p),c:r1(c),g:r1(g),fib:0});
  saveDay(S.date);closeModal();render();toast("Adicionado");
}
function createFormHTML(ai){
  return `${ai?`<div class="card" style="background:var(--accent-soft);border-color:transparent;margin-bottom:12px"><label class="f">Descreva o alimento<input type="text" id="aiq" placeholder="ex: tacacá, maniçoba, pão integral da padaria X"></label><div class="row" style="margin-top:8px"><button class="btn pri sm" data-act="aiask">${ic("sparkles",15)} Estimar valores</button><span class="tiny muted" id="aist">A IA estima os valores por 100 g (TACO/TBCA). Confira antes de salvar.</span></div></div>`:""}
  <div class="form"><label class="f" style="grid-column:1/-1">Nome do alimento<input type="text" id="cn" placeholder="ex: Pão integral da padaria"></label>
    <label class="f">Valores referentes a (g ou ml)<input type="number" id="cb" value="100" step="any"><span class="hint">Use a porção do rótulo, ex: 30</span></label>
    <label class="f">Calorias (kcal)<input type="number" id="ck" step="any"></label><label class="f">Proteína (g)<input type="number" id="cp" step="any"></label><label class="f">Carboidratos (g)<input type="number" id="cc" step="any"></label>
    <label class="f">Gorduras totais (g)<input type="number" id="cg" step="any"></label><label class="f">Fibras (g)<input type="number" id="cf" step="any"></label>
    <label class="f">Nome da porção (opcional)<input type="text" id="cpn" placeholder="ex: fatia, unidade, scoop"></label><label class="f">Peso da porção (g)<input type="number" id="cpg" step="any"></label></div>`;
}
function renderCreate(){
  $("#mbody").innerHTML=`${mhead(M.ai?"Estimar com IA":"Criar alimento")}${createFormHTML(M.ai)}<div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn pri" data-act="createsave">${M.meal?"Salvar e usar":"Salvar"}</button></div>`;
  if(M.q){$("#cn").value=M.q;const a=$("#aiq");if(a)a.value=M.q}
}
function readCreateForm(){
  const name=$("#cn").value.trim();const base=numv($("#cb").value)||100;const k=numv($("#ck").value);
  if(!name||k==null){toast("Preencha nome e calorias");return null}
  const f=100/base;const pn=$("#cpn").value.trim();const pg=numv($("#cpg").value);
  const portions=[];if(pn&&pg)portions.push([pn,pg]);else if(base!==100)portions.push(["porção",base]);
  return {id:"u-"+uid(),name,cat:"Meus alimentos",custom:true,ai:!!M.aiFilled,kcal:r1(k*f),p:r1((numv($("#cp").value)||0)*f),c:r1((numv($("#cc").value)||0)*f),g:r1((numv($("#cg").value)||0)*f),fib:r1((numv($("#cf").value)||0)*f),portions};
}
async function aiAsk(){
  const q=($("#aiq").value||"").trim();if(!q){toast("Descreva o alimento");return}
  const st=$("#aist");st.textContent="Estimando…";
  try{const o=await aiCall({action:"food",text:q});
    $("#cn").value=o.nome||q;$("#cb").value=100;$("#ck").value=o.kcal??"";$("#cp").value=o.proteina??"";$("#cc").value=o.carboidrato??"";$("#cg").value=o.gordura??"";$("#cf").value=o.fibra??"";
    if(o.porcao_nome&&o.porcao_g){$("#cpn").value=o.porcao_nome;$("#cpg").value=o.porcao_g}M.aiFilled=true;st.textContent="Pronto — confira os valores e salve.";
  }catch(e){st.textContent=e.code==="not_configured"?"A IA ainda não foi ativada (falta a chave da OpenAI).":"Não consegui estimar agora. Preencha manualmente."}
}
function createSave(){
  const f=readCreateForm();if(!f)return;S.profile.customFoods=(S.profile.customFoods||[]).concat([f]);saveProfile();M.aiFilled=false;
  if(M.meal){M.food=f;M.mode="qty";M.edit=null;renderModal()}else{closeModal();render()}toast("Alimento salvo em “Meus alimentos”");
}
/* refeições salvas */
function renderSaveMeal(){
  const items=getDay(S.date,true).meals[M.meal];const s=sumItems(items);
  $("#mbody").innerHTML=`${mhead("Salvar refeição",false)}<p class="small muted" style="margin-top:0">${items.length} itens · ${nf(s.kcal)} kcal · P ${nf(s.p)} · C ${nf(s.c)} · G ${nf(s.g)}</p>
  <label class="f">Nome<input type="text" id="smn" value="${esc(mealName(M.meal))} padrão"></label><div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn pri" data-act="savemealok">Salvar</button></div>`;
  setTimeout(()=>$("#smn").select(),30);
}
function renderSaved(){
  const list=S.profile.saved||[];
  $("#mbody").innerHTML=`${mhead("Refeições salvas")}<div class="flist">${list.map(sm=>{const s=sumItems(sm.items);return `<button class="fitem" data-act="usesaved" data-id="${esc(sm.id)}"><div class="nm"><div>${esc(sm.name)}</div><div class="tiny muted">${sm.items.length} itens · ${nf(s.kcal)} kcal · P ${nf(s.p)} · C ${nf(s.c)} · G ${nf(s.g)}</div></div><span class="muted">${ic("plus",16)}</span></button>`}).join("")||`<div class="empty">Nenhuma refeição salva ainda.</div>`}</div>`;
}
/* foto do prato */
async function compressImage(file,max=1024,q=0.82){
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)});
  const sc=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);
  return {dataUrl:c.toDataURL("image/jpeg",q),blob:await new Promise(r=>c.toBlob(r,"image/jpeg",q))};
}
function renderPhoto(){
  const P=M.photo||{};
  let body=`<label class="btn pri" style="cursor:pointer">${ic("camera")} Tirar foto / escolher imagem<input type="file" id="phf" accept="image/*" capture="environment" hidden></label>
  <label class="f" style="margin-top:10px">Observação (opcional)<input type="text" id="phh" placeholder="ex: arroz integral, frango grelhado, sem óleo" value="${esc(P.hint||"")}"></label>`;
  if(P.preview)body+=`<img src="${P.preview}" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-top:10px">`;
  if(P.loading)body+=`<p class="small muted">Analisando a foto…</p>`;
  if(P.err)body+=`<p class="small" style="color:var(--g)">${esc(P.err)}</p>`;
  if(P.items){body+=`<p class="small muted" style="margin-bottom:4px">Confira e ajuste as gramas — os valores acompanham:</p>`+P.items.map((it,i)=>`<div class="ing"><input type="checkbox" data-phk="${i}" ${it.on?"checked":""} style="width:18px"><div class="nm">${esc(it.nome)}<div class="tiny muted" id="phm${i}">${nf(it.kcal*it.g/it.g0)} kcal · P ${nf(it.proteina*it.g/it.g0,1)} · C ${nf(it.carboidrato*it.g/it.g0,1)} · G ${nf(it.gordura*it.g/it.g0,1)}</div></div><input type="number" data-phg="${i}" value="${it.g}"> g</div>`).join("")+(P.obs?`<p class="tiny muted">${esc(P.obs)}</p>`:"")+`<div class="row" style="margin-top:12px"><span class="sp"></span><button class="btn pri" data-act="phadd">Adicionar selecionados</button></div>`}
  $("#mbody").innerHTML=`${mhead("Foto do prato com IA")}${body}<p class="tiny muted">As quantidades são estimativas pela imagem — ajuste o que souber.</p>`;
  $("#phf").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;
    M.photo={hint:$("#phh").value,loading:true};const im=await compressImage(f,768,0.8);M.photo.preview=im.dataUrl;renderPhoto();
    try{const o=await aiCall({action:"photo",image:im.dataUrl,hint:M.photo.hint});
      M.photo.items=(o.itens||[]).filter(x=>x&&x.nome&&x.gramas>0).map(x=>({nome:x.nome,g:Math.round(x.gramas),g0:x.gramas,kcal:+x.kcal||0,proteina:+x.proteina||0,carboidrato:+x.carboidrato||0,gordura:+x.gordura||0,fibra:+x.fibra||0,on:true}));
      M.photo.obs=o.observacao||"";if(!M.photo.items.length)M.photo.err="Não identifiquei alimentos. Tente outra foto.";}
    catch(err){M.photo.err=err.code==="not_configured"?"A IA ainda não foi ativada.":"Não consegui analisar agora. Tente de novo."}
    M.photo.loading=false;renderPhoto();});
  $$("[data-phg]").forEach(el=>el.addEventListener("input",e=>{const i=+e.target.dataset.phg;const it=M.photo.items[i];it.g=numv(e.target.value)||0;$("#phm"+i).textContent=`${nf(it.kcal*it.g/it.g0)} kcal · P ${nf(it.proteina*it.g/it.g0,1)} · C ${nf(it.carboidrato*it.g/it.g0,1)} · G ${nf(it.gordura*it.g/it.g0,1)}`}));
  $$("[data-phk]").forEach(el=>el.addEventListener("change",e=>{M.photo.items[+e.target.dataset.phk].on=e.target.checked}));
}
function photoAdd(){
  const day=getDay(S.date,true);let n=0;
  M.photo.items.filter(i=>i.on&&i.g>0).forEach(it=>{const k=it.g/it.g0;day.meals[M.meal].push({fid:null,name:it.nome,n:1,u:"x",ul:`${nf(it.g)} g · estimado por foto`,q:it.g,kcal:r0(it.kcal*k),p:r1(it.proteina*k),c:r1(it.carboidrato*k),g:r1(it.gordura*k),fib:r1(it.fibra*k)});n++});
  saveDay(S.date);closeModal();render();toast(`${n} item(ns) adicionados`);
}
/* receitas */
function renderRecipe(){
  const R=M.recipe;const tot=sumItems(R.ings);const raw=R.ings.reduce((a,i)=>a+(i.q||0),0);
  $("#mbody").innerHTML=`${mhead(R.id?"Editar receita":"Nova receita",false)}
  <div class="form"><label class="f" style="grid-column:1/-1">Nome da receita<input type="text" id="rn" value="${esc(R.name)}" placeholder="ex: Bolo de banana fit"></label>
   <label class="f">Peso final pronto (g)<input type="number" id="ry" value="${R.yieldG||""}" placeholder="${nf(raw)}"><span class="hint">Pese a receita pronta; vazio = soma dos ingredientes</span></label>
   <label class="f">Rende quantas porções<input type="number" id="rs" value="${R.servings||""}" placeholder="ex: 8"></label></div>
  <h3 style="margin:14px 0 6px">Ingredientes</h3>
  ${R.ings.map((i,ix)=>`<div class="ing"><div class="nm">${esc(i.name)}<div class="tiny muted">${nf(i.kcal)} kcal</div></div><input type="number" data-rg="${ix}" value="${i.q}"> g<button class="iconbtn" data-act="rdel" data-ix="${ix}">${ic("x",16)}</button></div>`).join("")||`<div class="empty" style="padding-left:0">Busque e adicione os ingredientes abaixo.</div>`}
  <input type="search" id="rsearch" placeholder="Adicionar ingrediente…" style="margin-top:10px" autocomplete="off"><div id="rres" class="flist"></div>
  <div class="preview"><div><b class="num">${nf(tot.kcal)}</b><span>kcal total</span></div><div><b class="num" style="color:var(--p)">${nf(tot.p)}</b><span>proteína g</span></div><div><b class="num" style="color:var(--c)">${nf(tot.c)}</b><span>carbo g</span></div><div><b class="num" style="color:var(--g)">${nf(tot.g)}</b><span>gordura g</span></div></div>
  <div class="row"><span class="small muted" id="rper"></span><span class="sp"></span><button class="btn pri" data-act="rsave">Salvar receita</button></div>`;
  const per=()=>{const y=numv($("#ry").value)||raw;const s=numv($("#rs").value);$("#rper").textContent=y?`${nf(tot.kcal/y*100)} kcal por 100 g${s?` · ${nf(tot.kcal/s)} kcal por porção (${nf(y/s)} g)`:""}`:""};
  ["rn","ry","rs"].forEach(id=>$("#"+id).addEventListener("input",()=>{R.name=$("#rn").value;R.yieldG=numv($("#ry").value);R.servings=numv($("#rs").value);per()}));per();
  $$("[data-rg]").forEach(el=>el.addEventListener("change",e=>{const ix=+e.target.dataset.rg;const old=R.ings[ix];const f=foodById(old.fid);if(f)R.ings[ix]=calcItem(f,numv(e.target.value)||0,"g");renderRecipe()}));
  $("#rsearch").addEventListener("input",e=>{$("#rres").innerHTML=searchFoods(e.target.value,8).map(f=>foodRow(f,"radd")).join("")});
}
function recipeSave(){
  const R=M.recipe;R.name=$("#rn").value.trim();if(!R.name||!R.ings.length){toast("Dê um nome e adicione ingredientes");return}
  const tot=sumItems(R.ings);const raw=R.ings.reduce((a,i)=>a+(i.q||0),0);const y=numv($("#ry").value)||raw;const s=numv($("#rs").value);if(!y){toast("Informe as quantidades");return}
  const k=100/y;const id=R.id||"r-"+uid();
  const food={id,name:R.name,cat:"Minhas receitas",custom:true,recipe:true,kcal:r1(tot.kcal*k),p:r1(tot.p*k),c:r1(tot.c*k),g:r1(tot.g*k),fib:r1(tot.fib*k),portions:s?[["porção",r1(y/s)]]:[],ings:R.ings,yieldG:numv($("#ry").value),servings:s};
  S.profile.customFoods=(S.profile.customFoods||[]).filter(f=>f.id!==id).concat([food]);saveProfile();closeModal();render();toast("Receita salva — já aparece na busca de alimentos");
}

/* ============ TREINO ============ */
function exHistory(name,before){
  const key=norm(name);if(!key)return null;let last=null,best=null;
  Object.keys(S.days).filter(d=>d<before).sort().forEach(d=>{(S.days[d].workouts||[]).forEach(x=>{if(x.type!=="forca"||norm(x.name)!==key)return;const sets=(x.sets||[]).filter(s=>s.r>0);if(!sets.length)return;last={d,sets};sets.forEach(s=>{const kg=s.kg||0;const e=kg*(1+s.r/30);if(!best||e>best.e)best={d,kg,r:s.r,e}})})});
  return {last,best};
}
function setsTxt(sets){const g={};sets.forEach(s=>{const k=`${s.r}×${nf(s.kg||0,s.kg%1?1:0)} kg`;g[k]=(g[k]||0)+1});return Object.entries(g).map(([k,n])=>n>1?`${n}× ${k}`:k).join(", ")}
function treinoSummary(day){let sets=0,vol=0;(day.workouts||[]).forEach(x=>{if(x.type==="forca")(x.sets||[]).forEach(s=>{if(s.r>0){sets++;vol+=(s.r||0)*(s.kg||0)}})});return {sets,vol,kcal:exKcal(S.date),km:dayKm(S.date)}}
function cardioEstimate(x){
  const c=CARDIO.find(c=>c[0]===x.ctype)||CARDIO[0];const w=currentWeight()||70;
  if(x.km>0&&RUN_KCAL_PER_KG_KM[x.ctype])return Math.round(RUN_KCAL_PER_KG_KM[x.ctype]*w*x.km);
  return x.min?Math.round(c[2]*w*x.min/60):null;
}
function recalcCardio(x){x.kcal=cardioEstimate(x)}
function cardioHTML(x,i){
  const hasDist=DIST_CARDIO.includes(x.ctype);const pace=hasDist?paceTxt(x.min,x.km):"";
  return `<div class="ex"><div class="ex-h"><span class="tag">Cardio</span><select data-w="${i}" data-f="ctype">${CARDIO.map(c=>`<option value="${c[0]}" ${c[0]===x.ctype?"selected":""}>${c[1]}</option>`).join("")}</select><button class="iconbtn" data-act="wdel" data-i="${i}" title="Remover">${ic("x",16)}</button></div>
  <div class="form"><label class="f">Duração (min)<input type="number" data-w="${i}" data-f="min" value="${x.min||""}" min="0" inputmode="decimal"></label>
  ${hasDist?`<label class="f">Distância (km)<input type="number" step="0.01" data-w="${i}" data-f="km" value="${x.km||""}" inputmode="decimal"></label>`:""}
  <label class="f">Calorias do relógio/app<input type="number" data-w="${i}" data-f="kcalManual" value="${x.kcalManual||""}" placeholder="${x.kcal?"estimado: "+x.kcal:"ex: 420"}" inputmode="decimal"><span class="hint">${x.kcalManual?"Usando o valor que você informou":"Se deixar vazio, uso a estimativa"+(x.kcal?` (${x.kcal} kcal)`:"")}</span></label></div>
  <div class="pace" id="pace${i}">${pace}</div></div>`;
}
function renderTreino(){
  const d=S.date,day=getDay(d,false)||newDay();
  const prevW=Object.keys(S.days).filter(x=>x!==d&&(S.days[x].workouts||[]).length).sort().reverse().slice(0,15);
  const sm=treinoSummary(day);
  const exHTML=(day.workouts||[]).map((x,i)=>{
    if(x.type==="cardio")return cardioHTML(x,i);
    const h=exHistory(x.name,d);
    return `<div class="ex"><div class="ex-h"><input type="text" list="exlist" data-w="${i}" data-f="name" value="${esc(x.name)}" placeholder="Nome do exercício"><button class="iconbtn" data-act="wdel" data-i="${i}" title="Remover">${ic("x",16)}</button></div>
    <table class="sets"><thead><tr><th>Série</th><th>Repetições</th><th>Carga (kg)</th><th></th></tr></thead><tbody>
    ${(x.sets||[]).map((s,j)=>`<tr><td class="muted">${j+1}</td><td><input type="number" min="0" data-w="${i}" data-s="${j}" data-f="r" value="${s.r??""}" inputmode="numeric"></td><td><input type="number" step="0.5" min="0" data-w="${i}" data-s="${j}" data-f="kg" value="${s.kg??""}" inputmode="decimal"></td><td><button class="iconbtn" data-act="sdel" data-i="${i}" data-j="${j}">${ic("x",16)}</button></td></tr>`).join("")}</tbody></table>
    <div class="row" style="margin-top:6px"><button class="btn sm" data-act="sadd" data-i="${i}">${ic("plus",15)} Série</button></div>
    ${h&&(h.last||h.best)?`<div class="hist">${h.last?`Última vez (${short(h.last.d)}): ${esc(setsTxt(h.last.sets))}`:""}${h.best?` · <span class="pr">Recorde: ${nf(h.best.kg,h.best.kg%1?1:0)} kg × ${h.best.r}</span> (1RM est. ${nf(h.best.e)} kg)`:""}</div>`:""}</div>`;
  }).join("");
  const recent=prevW.slice(0,8).map(x=>{const dd=S.days[x];const km=dayKm(x);return `<div class="kv"><span>${esc(fmtDate(x,{weekday:"short",day:"2-digit",month:"2-digit"}))} ${dd.wname?`· <b>${esc(dd.wname)}</b>`:""}</span><span class="muted small">${(dd.workouts||[]).length} ativ.${km?` · ${nf(km,1)} km`:""} <button class="btn sm ghost" data-act="goday" data-d="${x}">abrir</button></span></div>`}).join("");
  $("#app").innerHTML=`${dayBar()}<div class="grid g2"><div>
    <div class="card" style="margin-bottom:14px"><div class="form">
      <label class="f">Nome do treino<input type="text" id="wname" value="${esc(day.wname||"")}" placeholder="ex: Treino A — Peito e tríceps"></label>
      <label class="f">Duração da musculação (min)<input type="number" id="wmin" value="${day.wmin||""}" placeholder="ex: 60"></label>
      ${prevW.length?`<label class="f">Repetir um treino anterior<select id="wcopy"><option value="">Escolher…</option>${prevW.map(x=>`<option value="${x}">${esc(short(x)+" — "+(S.days[x].wname||((S.days[x].workouts||[]).map(w=>w.name||(CARDIO.find(c=>c[0]===w.ctype)||[,"Cardio"])[1]).slice(0,3).join(", "))))}</option>`).join("")}</select></label>`:""}
    </div></div>
    ${exHTML||`<div class="card empty" style="margin-bottom:10px">Nenhuma atividade neste dia. Adicione abaixo ou repita um treino anterior.</div>`}
    <div class="row"><button class="btn pri" data-act="wadd" data-t="forca">${ic("plus",15)} Musculação</button><button class="btn" data-act="wadd" data-t="cardio">${ic("plus",15)} Corrida / cardio</button><button class="btn" data-act="wadd" data-t="luta">${ic("plus",15)} Kickboxing / luta</button></div>
    <datalist id="exlist">${EXERCISES.concat(knownExercises()).filter((v,i,a)=>a.indexOf(v)===i).map(e=>`<option value="${esc(e)}">`).join("")}</datalist>
  </div><div>
    <div class="grid g4" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      <div class="tile"><div class="t">Séries</div><div class="v num" id="tsets">${sm.sets}</div></div>
      <div class="tile"><div class="t">Volume</div><div class="v num" id="tvol">${nf(sm.vol)}</div><div class="s">kg × reps</div></div>
      <div class="tile"><div class="t">Distância</div><div class="v num" id="tkm">${nf(sm.km,1)}</div><div class="s">km</div></div>
      <div class="tile"><div class="t">Gasto</div><div class="v num" id="tkcal">${nf(sm.kcal)}</div><div class="s">kcal</div></div>
    </div>
    <div class="card"><h2>Treinos recentes</h2>${recent||`<div class="muted small">Seus treinos aparecem aqui.</div>`}
    <p class="tiny muted" style="margin-bottom:0">O gasto do treino ${S.profile.addExercise?"está sendo <b>somado</b> à sua meta do dia":"<b>não</b> é somado à meta, porque o ajuste semanal já mede seu gasto real. Dá para mudar em Perfil"}.</p></div>
  </div></div>`;
  bindDayPicker();
  $("#wname").addEventListener("change",e=>{getDay(d,true).wname=e.target.value;saveDay(d)});
  $("#wmin").addEventListener("change",e=>{getDay(d,true).wmin=numv(e.target.value);saveDay(d);updTreinoSum()});
  const wc=$("#wcopy");if(wc)wc.addEventListener("change",e=>{const src=S.days[e.target.value];if(!src)return;const dd=getDay(d,true);dd.workouts=dd.workouts.concat(clone(src.workouts||[]).map(x=>{if(x.type==="cardio"){delete x.kcalManual}return x}));if(!dd.wname)dd.wname=src.wname||"";if(!dd.wmin)dd.wmin=src.wmin||null;saveDay(d);render();toast("Treino copiado — ajuste os valores de hoje")});
  $$("[data-w]").forEach(el=>el.addEventListener("change",onWorkoutInput));
  $$("[data-w][data-f=min],[data-w][data-f=km]").forEach(el=>el.addEventListener("input",e=>{const i=e.target.dataset.w;const x=getDay(d,true).workouts[+i];const mn=$(`[data-w="${i}"][data-f=min]`),km=$(`[data-w="${i}"][data-f=km]`);const pc=$("#pace"+i);if(pc&&km)pc.textContent=paceTxt(numv(mn.value),numv(km.value))}));
}
function knownExercises(){const s=new Set();Object.values(S.days).forEach(d=>(d.workouts||[]).forEach(x=>{if(x.type==="forca"&&x.name)s.add(x.name)}));return [...s]}
function updTreinoSum(){const sm=treinoSummary(getDay(S.date,true));const a=$("#tsets");if(a){a.textContent=sm.sets;$("#tvol").textContent=nf(sm.vol);$("#tkcal").textContent=nf(sm.kcal);$("#tkm").textContent=nf(sm.km,1)}}
function onWorkoutInput(e){
  const el=e.target,d=S.date,day=getDay(d,true),x=day.workouts[+el.dataset.w];if(!x)return;const f=el.dataset.f;
  if(el.dataset.s!=null){x.sets[+el.dataset.s][f]=numv(el.value)}
  else if(f==="name"){x.name=el.value.trim();saveDay(d);render();return}
  else if(f==="ctype"){x.ctype=el.value;recalcCardio(x);saveDay(d);render();return}
  else if(f==="min"||f==="km"){x[f]=numv(el.value);recalcCardio(x);const k=$(`[data-w="${el.dataset.w}"][data-f="kcalManual"]`);if(k)k.placeholder=x.kcal?"estimado: "+x.kcal:"ex: 420"}
  else if(f==="kcalManual"){x.kcalManual=numv(el.value);saveDay(d);render();return}
  saveDay(d);updTreinoSum();
}

/* ============ PROGRESSO ============ */
function rangeDays(n){const end=TODAY();let start;if(n==="all"){const ks=Object.keys(S.days).sort();start=ks.length?ks[0]:end}else start=addDays(end,-(n-1));const out=[];for(let d=start;d<=end;d=addDays(d,1))out.push(d);return out}
function chartDefaults(){Chart.defaults.color=css("--muted");Chart.defaults.borderColor=css("--line");Chart.defaults.font.family=css("--font-ui")||"Inter,system-ui,sans-serif";Chart.defaults.font.size=12}
function groupBy(dates,fn){const m=new Map();dates.forEach(d=>{const k=fn(d);if(!m.has(k))m.set(k,[]);m.get(k).push(d)});return [...m.entries()]}
function summaryRows(groups,kind){
  const ser=weightSeries();const tmap={};ser.forEach(x=>tmap[x.d]=x.t);let prevT=null;
  return groups.map(([k,ds])=>{
    const lg=ds.filter(isLogged);const a=key=>lg.length?lg.reduce((s,d)=>s+dayTotals(d)[key],0)/lg.length:null;
    const endD=kind==="week"?addDays(k,6):ds[ds.length-1];let t=null;
    for(let d=endD<TODAY()?endD:TODAY();d>=(kind==="week"?k:k+"-01");d=addDays(d,-1)){if(tmap[d]!=null){t=tmap[d];break}}
    const ch=t!=null&&prevT!=null?t-prevT:null;if(t!=null)prevT=t;
    const tr=ds.filter(d=>(S.days[d].workouts||[]).length).length;const km=ds.reduce((s,d)=>s+dayKm(d),0);
    const label=kind==="week"?`${short(k)}–${short(addDays(k,6))}`:parseYmd(k+"-01").toLocaleDateString("pt-BR",{month:"short",year:"2-digit"});
    return {label,lg:lg.length,kcal:a("kcal"),p:a("p"),c:a("c"),g:a("g"),t,ch,tr,km};
  });
}
function summaryTable(groups,kind){
  if(!groups.length)return `<div class="muted small">Sem dados ainda.</div>`;
  const rows=summaryRows(groups,kind).reverse().slice(0,12);
  return `<table class="t"><thead><tr><th>${kind==="week"?"Semana":"Mês"}</th><th class="r">Dias</th><th class="r">kcal/dia</th><th class="r">Prot.</th><th class="r">Peso</th><th class="r">Δ</th><th class="r">Treinos</th><th class="r">Km</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${esc(r.label)}</td><td class="r num">${r.lg}</td><td class="r num">${r.kcal!=null?nf(r.kcal):"—"}</td><td class="r num">${r.p!=null?nf(r.p)+" g":"—"}</td><td class="r num">${r.t!=null?nf(r.t,1):"—"}</td><td class="r num ${r.ch>0?"up":r.ch<0?"down":""}">${r.ch!=null?(r.ch>0?"+":"")+nf(r.ch,1):"—"}</td><td class="r num">${r.tr}</td><td class="r num">${r.km?nf(r.km,1):"—"}</td></tr>`).join("")}</tbody></table>`;
}
function renderProgresso(){
  const days=rangeDays(S.period);const ser=weightSeries();const tmap={},wmap={};ser.forEach(x=>{tmap[x.d]=x.t;wmap[x.d]=x.w});
  const logged=days.filter(isLogged);const avg=k=>logged.length?logged.reduce((a,d)=>a+dayTotals(d)[k],0)/logged.length:null;
  const avgT=logged.length?logged.reduce((a,d)=>a+dayTarget(d).kcal,0)/logged.length:null;
  const within=logged.filter(d=>{const t=dayTarget(d).kcal;return Math.abs(dayKcal(d)-t)<=t*0.1}).length;
  const tStart=days.map(d=>tmap[d]).find(v=>v!=null);const tEnd=[...days].reverse().map(d=>tmap[d]).find(v=>v!=null);const wChange=tStart!=null&&tEnd!=null?tEnd-tStart:null;
  const trainings=days.filter(d=>S.days[d]&&(S.days[d].workouts||[]).length).length;const km=days.reduce((a,d)=>a+dayKm(d),0);const P=S.profile;
  const weekly=groupBy(Object.keys(S.days).sort(),weekStart);const monthly=groupBy(Object.keys(S.days).sort(),d=>d.slice(0,7));
  const lastRep=(P.reports||[])[0];
  $("#app").innerHTML=`<div class="row" style="margin-bottom:14px"><h1 style="margin:0">Progresso</h1><span class="sp"></span>
  <div class="chips">${[[7,"7 dias"],[30,"30 dias"],[90,"90 dias"],["all","Tudo"]].map(([v,l])=>`<button class="chip ${S.period==v?"on":""}" data-act="period" data-v="${v}">${l}</button>`).join("")}</div></div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="tile"><div class="t">Peso (tendência)</div><div class="v num">${tEnd!=null?nf(tEnd,1)+" kg":"—"}</div><div class="s">${wChange!=null?`<span class="${wChange>0?"up":"down"}">${wChange>0?"+":""}${nf(wChange,1)} kg</span> no período`:"registre seu peso no Diário"}</div></div>
    <div class="tile"><div class="t">Média consumida</div><div class="v num">${avg("kcal")!=null?nf(avg("kcal")):"—"}</div><div class="s">kcal/dia · meta ${avgT?nf(avgT):"—"}</div></div>
    <div class="tile"><div class="t">Proteína média</div><div class="v num">${avg("p")!=null?nf(avg("p"))+" g":"—"}</div><div class="s">meta ${nf(P.targets.p)} g/dia</div></div>
    <div class="tile"><div class="t">Aderência</div><div class="v num">${logged.length?nf(within/logged.length*100)+"%":"—"}</div><div class="s">${logged.length}/${days.length} dias · ${trainings} treinos${km?` · ${nf(km,1)} km`:""}</div></div>
  </div>
  <div class="card" style="margin-bottom:14px"><div class="row"><h2 style="margin:0">Relatório semanal com IA</h2><span class="sp"></span>${S.ai?`<button class="btn pri sm" data-act="aireport">${ic("sparkles",15)} Gerar relatório da semana</button>`:`<span class="tiny muted">IA desativada — veja em Perfil como ativar</span>`}</div>
    <div class="aiout" id="aiout">${lastRep?`<div class="tiny muted" style="margin-top:6px">Gerado em ${short(lastRep.date)}</div>${mdLite(lastRep.text)}`:`<p class="small muted" style="margin-bottom:0">Um resumo do que funcionou, onde a proteína ou as calorias ficaram fora e sugestões para a próxima semana.</p>`}</div></div>
  <div class="grid g2" style="grid-template-columns:1fr 1fr;margin-bottom:14px">
    <div class="card"><h2>Peso e tendência</h2><div class="chartbox"><canvas id="chW"></canvas></div><div class="tiny muted">Pontos = balança; linha = tendência, que filtra a variação de água.</div></div>
    <div class="card"><h2>Calorias × meta</h2><div class="chartbox"><canvas id="chK"></canvas></div></div></div>
  <div class="card" style="margin-bottom:14px"><h2>Macronutrientes por dia (g)</h2><div class="chartbox"><canvas id="chM"></canvas></div></div>
  <div class="grid g2" style="grid-template-columns:1fr 1fr"><div class="card"><h2>Resumo semanal</h2><div class="tw">${summaryTable(weekly,"week")}</div></div><div class="card"><h2>Resumo mensal</h2><div class="tw">${summaryTable(monthly,"month")}</div></div></div>`;
  if(typeof Chart==="undefined"){$$(".chartbox").forEach(b=>b.innerHTML='<div class="empty">Gráficos indisponíveis (sem conexão com a biblioteca).</div>');return}
  chartDefaults();const labels=days.map(short);const leg={position:"bottom",labels:{boxWidth:10}};
  charts.w=new Chart($("#chW"),{type:"line",data:{labels,datasets:[{label:"Balança",data:days.map(d=>wmap[d]??null),showLine:false,pointRadius:3,pointBackgroundColor:css("--muted"),borderColor:css("--muted")},{label:"Tendência",data:days.map(d=>tmap[d]!=null?r1(tmap[d]):null),borderColor:css("--accent"),backgroundColor:css("--accent"),pointRadius:0,borderWidth:2.5,tension:.3,spanGaps:true},...(P.goalWeight?[{label:"Meta",data:days.map(()=>P.goalWeight),borderColor:css("--c"),borderDash:[5,5],pointRadius:0,borderWidth:1.5}]:[])]},options:{maintainAspectRatio:false,plugins:{legend:leg},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{ticks:{callback:v=>nf(v,1)}}}}});
  charts.k=new Chart($("#chK"),{type:"bar",data:{labels,datasets:[{type:"bar",label:"Consumido",data:days.map(d=>dayKcal(d)||null),backgroundColor:days.map(d=>dayKcal(d)>dayTarget(d).kcal*1.1?css("--g"):css("--accent")),borderRadius:4,maxBarThickness:22},{type:"line",label:"Meta",data:days.map(d=>dayTarget(d).kcal),borderColor:css("--ink"),borderDash:[4,4],pointRadius:0,borderWidth:1.5,stepped:true}]},options:{maintainAspectRatio:false,plugins:{legend:leg},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true}}}});
  charts.m=new Chart($("#chM"),{type:"line",data:{labels,datasets:[["p","Proteína","--p"],["c","Carboidratos","--c"],["g","Gorduras","--g"]].map(([k,l,c])=>({label:l,data:days.map(d=>isLogged(d)?r0(dayTotals(d)[k]):null),borderColor:css(c),backgroundColor:css(c),pointRadius:days.length>40?0:2.5,borderWidth:2,tension:.25,spanGaps:true}))},options:{maintainAspectRatio:false,plugins:{legend:leg},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true}}}});
}
async function aiReport(){
  const out=$("#aiout");out.innerHTML=`<p class="small muted">Analisando sua semana…</p>`;
  const days=rangeDays(7);const P=S.profile;const ser=weightSeries();const tmap={};ser.forEach(x=>tmap[x.d]=x.t);
  const data={objetivo:GOALS[P.goal].label,ritmo_pct_semana:P.rate,metas:P.targets,peso_meta:P.goalWeight||null,
    dias:days.map(d=>{const t=dayTotals(d),day=S.days[d]||{};return {data:d,registrou:isLogged(d),kcal:r0(t.kcal),proteina:r0(t.p),carbo:r0(t.c),gordura:r0(t.g),fibra:r0(t.fib),meta_kcal:dayTarget(d).kcal,peso_balanca:day.weight||null,peso_tendencia:tmap[d]!=null?r1(tmap[d]):null,agua_ml:day.water||0,
      treino:(day.workouts||[]).map(x=>x.type==="cardio"?`${(CARDIO.find(c=>c[0]===x.ctype)||[,"cardio"])[1]} ${x.min||"?"}min${x.km?" "+x.km+"km":""} ${cardioKcal(x)}kcal`:`${x.name}: ${setsTxt((x.sets||[]).filter(s=>s.r>0))}`),anotacao:day.note||""}})};
  try{const r=await aiCall({action:"report",data});P.reports=[{date:TODAY(),text:r.text}].concat(P.reports||[]).slice(0,10);saveProfile();out.innerHTML=`<div class="tiny muted" style="margin-top:6px">Gerado agora</div>${mdLite(r.text)}`}
  catch(e){out.innerHTML=`<p class="small" style="color:var(--g)">${e.code==="not_configured"?"A IA ainda não foi ativada.":"Não consegui gerar agora. Tente de novo em instantes."}</p>`}
}

/* ============ CORPO (medidas e fotos) ============ */
const MEAS=[["cintura","Cintura"],["abdomen","Abdômen (umbigo)"],["quadril","Quadril"],["peito","Peito"],["braco","Braço (contraído)"],["coxa","Coxa"],["panturrilha","Panturrilha"],["bf","% de gordura"]];
const CORPO={metric:"cintura",a:null,b:null,urls:{}};
async function signedUrls(paths){
  const need=paths.filter(p=>!CORPO.urls[p]);if(need.length){const {data}=await sb.storage.from("progress").createSignedUrls(need,3600);(data||[]).forEach(x=>{if(x.signedUrl)CORPO.urls[x.path]=x.signedUrl})}
  return paths.map(p=>CORPO.urls[p]||"");
}
function renderCorpo(){
  const d=S.date,day=getDay(d,false)||newDay();const ms=day.measures||{};
  const hist=Object.keys(S.days).filter(x=>S.days[x].measures&&Object.values(S.days[x].measures).some(v=>v>0)).sort();
  const photoDays=Object.keys(S.days).filter(x=>(S.days[x].photos||[]).length).sort().reverse();
  if(!CORPO.a&&photoDays.length){CORPO.b=photoDays[0];CORPO.a=photoDays[photoDays.length-1]}
  $("#app").innerHTML=`${dayBar()}<div class="grid g2">
   <div class="card"><h2>Medidas do dia</h2><p class="small muted" style="margin-top:0">Fita métrica, de manhã, sempre no mesmo lugar. Em cm.</p>
    <div class="form">${MEAS.map(([k,l])=>`<label class="f">${l}<input type="number" step="0.1" data-ms="${k}" value="${ms[k]||""}" inputmode="decimal"></label>`).join("")}</div></div>
   <div class="card"><div class="row"><h2 style="margin:0">Evolução</h2><span class="sp"></span><select id="msel" style="width:auto">${MEAS.map(([k,l])=>`<option value="${k}" ${k===CORPO.metric?"selected":""}>${l}</option>`).join("")}</select></div>
    <div class="chartbox" style="height:220px;margin-top:10px"><canvas id="chMs"></canvas></div>
    <div class="tw" style="margin-top:10px">${hist.length?`<table class="t"><thead><tr><th>Data</th>${MEAS.slice(0,6).map(m=>`<th class="r">${m[1].split(" ")[0]}</th>`).join("")}<th class="r">%G</th></tr></thead><tbody>${hist.slice(-8).reverse().map(x=>{const m=S.days[x].measures;return `<tr><td>${short(x)}</td>${MEAS.slice(0,6).map(([k])=>`<td class="r num">${m[k]?nf(m[k],1):"—"}</td>`).join("")}<td class="r num">${m.bf?nf(m.bf,1):"—"}</td></tr>`}).join("")}</tbody></table>`:`<div class="muted small">Registre suas medidas para ver a evolução.</div>`}</div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row"><h2 style="margin:0">Fotos de progresso</h2><span class="sp"></span>
    <select id="ppose" style="width:auto"><option value="frente">Frente</option><option value="lado">Lado</option><option value="costas">Costas</option></select>
    <label class="btn pri" style="cursor:pointer">${ic("camera")} Adicionar foto de ${d===TODAY()?"hoje":short(d)}<input type="file" id="pfile" accept="image/*" capture="environment" hidden></label></div>
    <p class="tiny muted">As fotos ficam privadas na sua conta. Mesma luz, mesmo lugar e mesma pose ajudam a comparar.</p>
    <div class="photos" id="pday"></div>
    ${photoDays.length>1?`<h3 style="margin:18px 0 8px">Comparar lado a lado</h3><div class="row" style="margin-bottom:10px"><select id="pa" style="width:auto">${photoDays.map(x=>`<option ${x===CORPO.a?"selected":""}>${x}</option>`).join("")}</select><span class="muted">×</span><select id="pb" style="width:auto">${photoDays.map(x=>`<option ${x===CORPO.b?"selected":""}>${x}</option>`).join("")}</select><select id="pp" style="width:auto"><option value="frente">Frente</option><option value="lado">Lado</option><option value="costas">Costas</option></select></div><div class="compare" id="pcmp"></div>`:""}
  </div>`;
  bindDayPicker();
  $$("[data-ms]").forEach(el=>el.addEventListener("change",e=>{const dd=getDay(d,true);dd.measures=dd.measures||{};const v=numv(e.target.value);if(v>0)dd.measures[e.target.dataset.ms]=r1(v);else delete dd.measures[e.target.dataset.ms];saveDay(d);toast("Medida salva")}));
  $("#msel").addEventListener("change",e=>{CORPO.metric=e.target.value;render()});
  $("#pfile").addEventListener("change",e=>uploadPhoto(e.target.files[0],$("#ppose").value));
  const drawDay=async()=>{const ph=(day.photos||[]);const el=$("#pday");if(!ph.length){el.innerHTML=`<div class="muted small">Sem fotos neste dia.</div>`;return}
    const urls=await signedUrls(ph.map(p=>p.path));el.innerHTML=ph.map((p,i)=>`<figure><img src="${esc(urls[i])}" alt="foto ${esc(p.pose)}"><figcaption><span>${esc(p.pose)}</span><button data-act="pdel" data-path="${esc(p.path)}">apagar</button></figcaption></figure>`).join("")};
  drawDay();
  const drawCmp=async()=>{const el=$("#pcmp");if(!el)return;CORPO.a=$("#pa").value;CORPO.b=$("#pb").value;const pose=$("#pp").value;
    const pick=x=>{const ps=S.days[x].photos||[];return ps.find(p=>p.pose===pose)||ps[0]};const pa=pick(CORPO.a),pb=pick(CORPO.b);
    const urls=await signedUrls([pa&&pa.path,pb&&pb.path].filter(Boolean));let i=0;const ua=pa?urls[i++]:"",ub=pb?urls[i++]:"";
    el.innerHTML=`<figure>${ua?`<img src="${esc(ua)}">`:""}<figcaption>${short(CORPO.a)}</figcaption></figure><figure>${ub?`<img src="${esc(ub)}">`:""}<figcaption>${short(CORPO.b)}</figcaption></figure>`};
  if($("#pcmp")){["pa","pb","pp"].forEach(id=>$("#"+id).addEventListener("change",drawCmp));drawCmp()}
  if(typeof Chart!=="undefined"&&hist.length){chartDefaults();const pts=hist.filter(x=>S.days[x].measures[CORPO.metric]>0);
    charts.ms=new Chart($("#chMs"),{type:"line",data:{labels:pts.map(short),datasets:[{label:(MEAS.find(m=>m[0]===CORPO.metric)||[])[1],data:pts.map(x=>S.days[x].measures[CORPO.metric]),borderColor:css("--accent"),backgroundColor:css("--accent"),tension:.3,pointRadius:3}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}}}}})}
}
async function uploadPhoto(file,pose){
  if(!file)return;toast("Enviando foto…");
  try{const im=await compressImage(file,1280,0.85);const d=S.date;const path=`${S.user.id}/${d}-${pose}-${uid()}.jpg`;
    const {error}=await sb.storage.from("progress").upload(path,im.blob,{contentType:"image/jpeg",upsert:false});if(error)throw error;
    const dd=getDay(d,true);dd.photos=(dd.photos||[]).concat([{path,pose}]);saveDay(d);render();toast("Foto salva")}
  catch(e){console.warn(e);toast("Não consegui enviar a foto.")}
}
async function deletePhoto(path){
  const day=getDay(S.date,true);const {error}=await sb.storage.from("progress").remove([path]);if(error){toast("Não consegui apagar");return}
  day.photos=(day.photos||[]).filter(p=>p.path!==path);saveDay(S.date);render();
}

/* ============ AJUSTE DA DIETA ============ */
function renderCoach(){
  const P=S.profile,pv=checkinPreview(),e=pv.e,T=P.targets,G=GOALS[P.goal];
  const next=P.lastCheckin?addDays(P.lastCheckin,7):TODAY();const due=checkinDue();const w=pv.w;const perWeek=G.sign*(P.rate/100)*w;
  let proj="";if(P.goalWeight&&perWeek!==0&&Math.sign(P.goalWeight-w)===Math.sign(perWeek)){const wk=Math.abs((P.goalWeight-w)/perWeek);proj=`No ritmo planejado, você chega a <b>${nf(P.goalWeight,1)} kg</b> em cerca de <b>${nf(wk)} semanas</b> (${fmtDate(addDays(TODAY(),Math.round(wk*7)),{day:"numeric",month:"long",year:"numeric"})}).`}
  const changed=pv.targets.kcal!==T.kcal||pv.targets.p!==T.p;const cks=P.checkins||[];const cy=P.cycle&&P.cycle.on?P.cycle:null;
  let cyTxt="";if(cy){const td=clamp(cy.trainDays||4,1,6);const rest=Math.round(cy.shift*td/(7-td));cyTxt=`<div class="small" style="margin-top:8px">Ciclo ativo: dia de treino <b>${nf(Math.round((T.kcal+cy.shift)/10)*10)}</b> kcal · dia de descanso <b>${nf(Math.round((T.kcal-rest)/10)*10)}</b> kcal (média semanal igual à meta).</div>`}
  $("#app").innerHTML=`<h1>Ajuste automático da dieta</h1>
  ${T.floored?`<div class="banner warn"><div>Sua meta ficou no piso de segurança (${nf(minKcal(P))} kcal). Para ir mais rápido, aumente a atividade em vez de cortar mais comida — ou reduza o ritmo em Perfil.</div></div>`:""}
  <div class="grid g3" style="margin-bottom:14px">
    <div class="tile"><div class="t">Gasto diário estimado (TDEE)</div><div class="v num">${nf(P.tdee)} kcal</div><div class="s">fórmula: ${nf(formulaTDEE(P,w))} kcal</div></div>
    <div class="tile"><div class="t">Meta atual (média)</div><div class="v num">${nf(T.kcal)} kcal</div><div class="s">P ${T.p} g · C ${T.c} g · G ${T.g} g</div></div>
    <div class="tile"><div class="t">Objetivo</div><div class="v" style="font-size:18px">${esc(G.label)}</div><div class="s">${P.rate?`${G.sign<0?"−":"+"}${nf(P.rate,2)}% do peso/semana ≈ ${nf(Math.abs(perWeek),2)} kg`:"manter"}</div></div></div>
  <div class="grid g2"><div class="card"><div class="row"><h2 style="margin:0">Check-in semanal</h2><span class="sp"></span><span class="tag">${due?"pronto agora":"próximo: "+short(next)}</span></div>
    <p class="small muted">Últimos ${e.span||0} dias: <b>${e.logged}</b> dias com registro completo, <b>${e.weighins}</b> pesagens.</p>
    ${e.ok?`<div class="kv"><span>Média consumida</span><b class="num">${nf(e.avg)} kcal/dia</b></div><div class="kv"><span>Variação do peso (tendência)</span><b class="num ${e.dKg>0?"up":"down"}">${e.dKg>0?"+":""}${nf(e.dKg,2)} kg em ${e.span} dias</b></div><div class="kv"><span>Gasto observado</span><b class="num">${nf(e.obs)} kcal/dia</b></div><div style="margin:10px 0 4px" class="small">Confiança nos dados: <b>${nf(e.conf*100)}%</b></div><div class="conf"><i style="width:${e.conf*100}%"></i></div>`
    :`<div class="banner warn" style="margin:8px 0"><div class="small">Ainda não há dados suficientes para medir seu gasto real. Preciso de pelo menos <b>7 dias</b> de alimentação registrada e <b>2 pesagens</b> separadas por uma semana. Enquanto isso, uso a fórmula Mifflin-St Jeor.</div></div>`}
    <div class="cmp"><div><div class="tiny muted">Meta atual</div><div class="v num">${nf(T.kcal)}</div><div class="tiny muted">P ${T.p} · C ${T.c} · G ${T.g}</div></div><div class="muted" style="font-size:22px">→</div><div><div class="tiny muted">Nova meta sugerida</div><div class="v num" style="color:var(--accent)">${nf(pv.targets.kcal)}</div><div class="tiny muted">P ${pv.targets.p} · C ${pv.targets.c} · G ${pv.targets.g}</div></div></div>
    <div class="row"><button class="btn pri" data-act="checkin">${changed?"Aplicar nova meta":"Confirmar check-in"}</button><span class="sp"></span><label class="switch small"><input type="checkbox" id="autoAp" ${P.autoApply?"checked":""}> Aplicar automaticamente toda semana</label></div>
    ${proj?`<p class="small" style="margin-bottom:0">${proj}</p>`:""}${cyTxt}</div>
   <div class="card"><h2>Histórico de ajustes</h2>${cks.length>1&&typeof Chart!=="undefined"?`<div class="chartbox" style="height:200px"><canvas id="chC"></canvas></div>`:""}
    <div class="tw"><table class="t"><thead><tr><th>Data</th><th class="r">Peso</th><th class="r">Gasto</th><th class="r">Meta</th><th class="r">P/C/G</th></tr></thead><tbody>
    ${cks.slice().reverse().slice(0,12).map(c=>`<tr><td>${short(c.date)}${c.auto?' <span class="tag">auto</span>':""}${c.type==="inicial"?' <span class="tag">início</span>':""}</td><td class="r num">${nf(c.weight,1)}</td><td class="r num">${nf(c.tdee)}</td><td class="r num">${nf(c.kcal)}</td><td class="r num">${c.p}/${c.c}/${c.g}</td></tr>`).join("")}</tbody></table></div></div></div>
  <details class="card" style="margin-top:14px"><summary>Como o ajuste funciona</summary><div class="small" style="margin-top:10px;line-height:1.6">
   <p><b>1. Ponto de partida.</b> O gasto inicial vem da fórmula Mifflin-St Jeor × seu nível de atividade.</p>
   <p><b>2. Gasto real.</b> Toda semana o app compara o que você comeu (média dos dias completos dos últimos até 28 dias) com a mudança na <i>tendência</i> do peso. Cada kg ≈ 7.700 kcal.</p>
   <p><b>3. Ajuste suave.</b> A nova estimativa é misturada à anterior conforme a qualidade dos dados e muda no máximo 250 kcal por semana.</p>
   <p><b>4. Nova meta.</b> Meta = gasto + (ritmo × peso × 7.700 ÷ 7). Proteína ${nf(P.protPerKg||G.prot,1)} g/kg, gordura ≥ ${nf(P.fatPerKg||G.fat,1)} g/kg (mín. 20% das calorias), resto em carboidratos. Piso de ${nf(minKcal(P))} kcal.</p></div></details>`;
  $("#autoAp").addEventListener("change",ev=>{P.autoApply=ev.target.checked;saveProfile()});
  if(cks.length>1&&typeof Chart!=="undefined"){chartDefaults();charts.c=new Chart($("#chC"),{type:"line",data:{labels:cks.map(c=>short(c.date)),datasets:[{label:"Gasto (TDEE)",data:cks.map(c=>c.tdee),borderColor:css("--ink"),pointRadius:3,tension:.3},{label:"Meta",data:cks.map(c=>c.kcal),borderColor:css("--accent"),pointRadius:3,stepped:true}]},options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{boxWidth:10}}},scales:{x:{grid:{display:false}}}}})}
}

/* ============ ALIMENTOS ============ */
let foodQ="",foodCat="";
function renderAlimentos(){
  const cats=[...new Set(allFoods().map(f=>f.cat))];const saved=S.profile.saved||[];
  $("#app").innerHTML=`<div class="row" style="margin-bottom:12px"><h1 style="margin:0">Alimentos</h1><span class="sp"></span><button class="btn pri" data-act="newrecipe">${ic("plus",15)} Criar receita</button><button class="btn" data-act="newfoodpage">${ic("plus",15)} Criar alimento</button>${S.ai?`<button class="btn" data-act="newfoodpage" data-ai="1">${ic("sparkles",15)} Estimar com IA</button>`:""}</div>
  <p class="small muted" style="margin-top:0">Valores por 100 g (ou 100 ml), base TACO/UNICAMP e TBCA/USP; suplementos pelo rótulo do fabricante. Itens preparados variam conforme a receita.</p>
  ${saved.length?`<div class="card" style="margin-bottom:14px"><h2>Refeições salvas</h2>${saved.map(sm=>{const s=sumItems(sm.items);return `<div class="kv"><span><b>${esc(sm.name)}</b> <span class="small muted">· ${sm.items.length} itens · ${nf(s.kcal)} kcal · P ${nf(s.p)} · C ${nf(s.c)} · G ${nf(s.g)}</span></span><button class="iconbtn" data-act="delsaved" data-id="${esc(sm.id)}">${ic("x",16)}</button></div>`}).join("")}</div>`:""}
  <div class="row" style="margin-bottom:12px"><input type="search" id="fq" placeholder="Buscar…" value="${esc(foodQ)}" style="max-width:320px"><select id="fc" style="max-width:260px"><option value="">Todas as categorias</option>${cats.map(c=>`<option ${c===foodCat?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
  <div class="card tw" id="ftable"></div>`;
  const draw=()=>{const q=norm(foodQ);const list=allFoods().filter(f=>(!foodCat||f.cat===foodCat)&&(!q||norm(f.name).includes(q)));
    $("#ftable").innerHTML=`<table class="t"><thead><tr><th>Alimento</th><th>Categoria</th><th class="r">kcal</th><th class="r">Prot.</th><th class="r">Carb.</th><th class="r">Gord.</th><th class="r">Fibra</th><th>Porções</th><th></th></tr></thead><tbody>
    ${list.map(f=>`<tr><td><b>${esc(f.name)}</b> ${f.ai?'<span class="tag ai">IA</span>':""}</td><td class="muted">${esc(f.cat)}</td><td class="r num">${nf(f.kcal)}</td><td class="r num">${nf(f.p,1)}</td><td class="r num">${nf(f.c,1)}</td><td class="r num">${nf(f.g,1)}</td><td class="r num">${nf(f.fib,1)}</td><td class="muted small">${esc((f.portions||[]).map(p=>`${p[0]} ${nf(p[1],p[1]%1?1:0)} g`).join(" · "))}</td><td style="white-space:nowrap">${f.recipe?`<button class="iconbtn" data-act="editrecipe" data-fid="${esc(f.id)}" title="Editar" aria-label="Editar">${ic("pencil",16)}</button>`:""}${f.custom?`<button class="iconbtn" data-act="delfood" data-fid="${esc(f.id)}" title="Excluir">${ic("x",16)}</button>`:""}</td></tr>`).join("")}
    </tbody></table>${list.length?"":`<div class="empty">Nada encontrado.</div>`}`};
  $("#fq").addEventListener("input",e=>{foodQ=e.target.value;draw()});$("#fc").addEventListener("change",e=>{foodCat=e.target.value;draw()});draw();
}

/* ============ CALCULADORA ============ */
const CALC={};
function calcRead(){const g=id=>numv($("#c_"+id).value);const c={sex:$("#c_sex").value,age:g("age"),height:g("height"),weight:g("weight"),bf:g("bf"),act:+$("#c_act").value,neck:g("neck"),waist:g("waist"),hip:g("hip")};if(!c.age||!c.height||!c.weight)return null;return c}
function navyBF(c){if(!c.neck||!c.waist)return null;const L=Math.log10;if(c.sex==="m"){if(c.waist<=c.neck)return null;return 495/(1.0324-0.19077*L(c.waist-c.neck)+0.15456*L(c.height))-450}if(!c.hip||c.waist+c.hip<=c.neck)return null;return 495/(1.29579-0.35004*L(c.waist+c.hip-c.neck)+0.221*L(c.height))-450}
function renderCalc(){
  const P=S.profile||{};const w0=currentWeight();const v=(k,d)=>CALC[k]!=null?CALC[k]:d;
  $("#app").innerHTML=`<h1>Calculadora de metabolismo basal e gasto diário</h1><div class="grid g2"><div class="card"><h2>Seus dados</h2><div class="form">
   <label class="f">Sexo<select id="c_sex"><option value="m" ${v("sex",P.sex)==="m"?"selected":""}>Masculino</option><option value="f" ${v("sex",P.sex)==="f"?"selected":""}>Feminino</option></select></label>
   <label class="f">Idade<input type="number" id="c_age" value="${v("age",P.age||"")}"></label><label class="f">Altura (cm)<input type="number" id="c_height" value="${v("height",P.height||"")}"></label><label class="f">Peso (kg)<input type="number" step="0.1" id="c_weight" value="${v("weight",w0?r1(w0):"")}"></label>
   <label class="f" style="grid-column:1/-1">Nível de atividade<select id="c_act">${ACT.map(([a,l])=>`<option value="${a}" ${+v("act",P.activity||1.375)===a?"selected":""}>${l}</option>`).join("")}</select></label>
   <label class="f">% de gordura (opcional)<input type="number" step="0.1" id="c_bf" value="${v("bf","")}" placeholder="ex: 22"><span class="hint">Bioimpedância, dobras ou calculado abaixo</span></label></div>
   <details style="margin-top:14px"><summary class="small">Estimar % de gordura pela fita métrica (método da Marinha dos EUA)</summary><div class="form" style="margin-top:10px">
    <label class="f">Pescoço (cm)<input type="number" step="0.1" id="c_neck" value="${v("neck","")}"></label><label class="f">Cintura (cm)<input type="number" step="0.1" id="c_waist" value="${v("waist","")}"><span class="hint">Homens: umbigo · Mulheres: parte mais fina</span></label><label class="f">Quadril (cm)<input type="number" step="0.1" id="c_hip" value="${v("hip","")}"><span class="hint">Só para mulheres</span></label></div><div class="small" id="c_navy" style="margin-top:8px"></div></details>
   <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn" data-act="calcuse">Usar estes dados no meu perfil</button></div></div><div id="c_out"></div></div>`;
  const upd=()=>{
    ["sex","age","height","weight","bf","act","neck","waist","hip"].forEach(k=>CALC[k]=$("#c_"+k).value);
    const c=calcRead();const out=$("#c_out");const nb=c?navyBF(c):null;
    $("#c_navy").innerHTML=nb!=null&&nb>2&&nb<70?`Gordura estimada: <b>${nf(nb,1)}%</b> <button class="btn sm" id="c_usebf">usar</button>`:"Preencha as medidas para estimar.";
    const ub=$("#c_usebf");if(ub)ub.onclick=()=>{$("#c_bf").value=r1(nb);upd()};
    if(!c){out.innerHTML=`<div class="card muted">Preencha idade, altura e peso.</div>`;return}
    const m=c.sex==="m";const bf=c.bf&&c.bf>2&&c.bf<70?c.bf:null;const lbm=bf?c.weight*(1-bf/100):null;
    const rows=[["Mifflin-St Jeor",10*c.weight+6.25*c.height-5*c.age+(m?5:-161),"A mais precisa para a maioria das pessoas — é a usada pelo app."],["Harris-Benedict (revisada)",m?88.362+13.397*c.weight+4.799*c.height-5.677*c.age:447.593+9.247*c.weight+3.098*c.height-4.33*c.age,"Clássica; tende a superestimar um pouco."]];
    if(lbm){rows.push(["Katch-McArdle",370+21.6*lbm,"Usa a massa magra — melhor para quem sabe o % de gordura."]);rows.push(["Cunningham",500+22*lbm,"Indicada para atletas e pessoas muito musculosas."])}
    const mif=rows[0][1];const h=c.height/100;const imc=c.weight/(h*h);const imcCat=imc<18.5?"abaixo do peso":imc<25?"peso normal":imc<30?"sobrepeso":imc<35?"obesidade grau I":imc<40?"obesidade grau II":"obesidade grau III";const rw=refWeight({height:c.height},c.weight);
    out.innerHTML=`<div class="card" style="margin-bottom:14px"><h2>Metabolismo basal (TMB)</h2><p class="tiny muted" style="margin-top:0">Calorias que o corpo gasta em repouso total.</p>${rows.map(r=>`<div class="kv" style="align-items:center"><span><b>${r[0]}</b><br><span class="tiny muted">${r[2]}</span></span><b class="num" style="font-size:18px;white-space:nowrap">${nf(r[1])} kcal</b></div>`).join("")}
     ${lbm?`<p class="small muted" style="margin-bottom:0">Massa magra: <b>${nf(lbm,1)} kg</b> · massa gorda: <b>${nf(c.weight-lbm,1)} kg</b></p>`:`<p class="tiny muted" style="margin-bottom:0">Informe o % de gordura para ver também Katch-McArdle e Cunningham.</p>`}</div>
     <div class="card" style="margin-bottom:14px"><h2>Gasto diário total (TMB × atividade)</h2><div class="tw"><table class="t"><thead><tr><th>Atividade</th><th class="r">Manter</th><th class="r">Emagrecer (−0,5%/sem)</th><th class="r">Ganhar (+0,25%/sem)</th></tr></thead><tbody>
     ${ACT.map(([a,l])=>{const t=mif*a,dl=0.005*c.weight*7700/7,dg=0.0025*c.weight*7700/7;return `<tr style="${a===c.act?"background:var(--accent-soft)":""}"><td>${esc(l.split(" — ")[0])} <span class="tiny muted">×${a}</span></td><td class="r num"><b>${nf(t)}</b></td><td class="r num">${nf(Math.max(t-dl,m?1500:1200))}</td><td class="r num">${nf(t+dg)}</td></tr>`}).join("")}</tbody></table></div><p class="tiny muted" style="margin-bottom:0">Base Mifflin-St Jeor. É o ponto de partida — o “Ajuste da dieta” corrige pelo resultado real.</p></div>
     <div class="grid g3" style="grid-template-columns:repeat(3,1fr)"><div class="tile"><div class="t">IMC</div><div class="v num">${nf(imc,1)}</div><div class="s">${imcCat}</div></div><div class="tile"><div class="t">Peso saudável (IMC 18,5–25)</div><div class="v num" style="font-size:19px">${nf(18.5*h*h,1)}–${nf(24.9*h*h,1)}</div><div class="s">kg</div></div><div class="tile"><div class="t">Proteína / Água</div><div class="v num" style="font-size:19px">${nf(1.6*rw)}–${nf(2.2*rw)} g</div><div class="s">${nf(c.weight*35/1000,1)} L de água/dia</div></div></div><p class="tiny muted">IMC não diferencia músculo de gordura; para quem treina pesado, o % de gordura diz mais.</p>`;
  };
  $$("#app input,#app select").forEach(el=>el.addEventListener("input",upd));upd();
}

/* ============ RELATÓRIO / EXPORTAR ============ */
let REP_N=30;
function renderRelatorio(){
  const P=S.profile;const days=rangeDays(REP_N);const logged=days.filter(isLogged);
  const avg=k=>logged.length?logged.reduce((a,d)=>a+dayTotals(d)[k],0)/logged.length:null;
  const ser=weightSeries();const tmap={};ser.forEach(x=>tmap[x.d]=x.t);
  const meas=days.filter(d=>S.days[d]&&S.days[d].measures&&Object.keys(S.days[d].measures).length);
  const name=S.user.email;
  $("#app").innerHTML=`<div class="row noprint" style="margin-bottom:14px"><h1 style="margin:0">Relatório para o nutricionista</h1><span class="sp"></span>
   <div class="chips">${[[7,"7 dias"],[14,"14 dias"],[30,"30 dias"],[90,"90 dias"]].map(([v,l])=>`<button class="chip ${REP_N==v?"on":""}" data-act="repn" data-v="${v}">${l}</button>`).join("")}</div></div>
  <div class="row noprint" style="margin-bottom:14px"><button class="btn pri" data-act="print">${ic("printer")} Imprimir / salvar PDF</button><button class="btn" data-act="csvdays">${ic("download")} Planilha — resumo por dia</button><button class="btn" data-act="csvfoods">${ic("download")} Planilha — todos os alimentos</button><button class="btn" data-act="csvtrain">${ic("download")} Planilha — treinos</button></div>
  <div class="card" style="margin-bottom:14px"><h2>Nutri Plano — ${esc(name)}</h2><div class="small">Período: <b>${short(days[0])} a ${short(days[days.length-1])}</b> · Objetivo: <b>${esc(GOALS[P.goal].label)}</b>${P.rate?` (${nf(P.rate,2)}% do peso/semana)`:""} · Sexo ${P.sex==="m"?"M":"F"}, ${P.age} anos, ${P.height} cm</div>
   <div class="grid g4" style="margin-top:12px"><div class="tile"><div class="t">Meta atual</div><div class="v num" style="font-size:20px">${nf(P.targets.kcal)} kcal</div><div class="s">P ${P.targets.p} · C ${P.targets.c} · G ${P.targets.g} g</div></div>
   <div class="tile"><div class="t">Média consumida</div><div class="v num" style="font-size:20px">${avg("kcal")!=null?nf(avg("kcal"))+" kcal":"—"}</div><div class="s">P ${nf(avg("p"))} · C ${nf(avg("c"))} · G ${nf(avg("g"))} · fibra ${nf(avg("fib"))} g</div></div>
   <div class="tile"><div class="t">Peso (tendência)</div><div class="v num" style="font-size:20px">${(()=>{const a=days.map(d=>tmap[d]).find(v=>v!=null),b=[...days].reverse().map(d=>tmap[d]).find(v=>v!=null);return a!=null&&b!=null?`${nf(a,1)} → ${nf(b,1)} kg`:"—"})()}</div><div class="s">gasto estimado ${nf(P.tdee)} kcal/dia</div></div>
   <div class="tile"><div class="t">Registros</div><div class="v num" style="font-size:20px">${logged.length}/${days.length} dias</div><div class="s">${days.filter(d=>S.days[d]&&(S.days[d].workouts||[]).length).length} dias com treino</div></div></div></div>
  <div class="card" style="margin-bottom:14px"><h2>Por dia</h2><div class="tw"><table class="t"><thead><tr><th>Data</th><th class="r">kcal</th><th class="r">Meta</th><th class="r">Prot.</th><th class="r">Carb.</th><th class="r">Gord.</th><th class="r">Fibra</th><th class="r">Água</th><th class="r">Peso</th><th>Treino</th></tr></thead><tbody>
  ${days.slice().reverse().map(d=>{const t=dayTotals(d),day=S.days[d]||{};return `<tr><td>${fmtDate(d,{weekday:"short",day:"2-digit",month:"2-digit"})}</td><td class="r num">${t.kcal?nf(t.kcal):"—"}</td><td class="r num">${nf(dayTarget(d).kcal)}</td><td class="r num">${t.kcal?nf(t.p):"—"}</td><td class="r num">${t.kcal?nf(t.c):"—"}</td><td class="r num">${t.kcal?nf(t.g):"—"}</td><td class="r num">${t.kcal?nf(t.fib):"—"}</td><td class="r num">${day.water?nf(day.water/1000,1)+" L":"—"}</td><td class="r num">${day.weight?nf(day.weight,1):"—"}</td><td class="small">${esc(workoutTxt(day))}</td></tr>`}).join("")}</tbody></table></div></div>
  ${meas.length?`<div class="card"><h2>Medidas (cm)</h2><div class="tw"><table class="t"><thead><tr><th>Data</th>${MEAS.map(m=>`<th class="r">${m[1]}</th>`).join("")}</tr></thead><tbody>${meas.map(d=>`<tr><td>${short(d)}</td>${MEAS.map(([k])=>`<td class="r num">${S.days[d].measures[k]?nf(S.days[d].measures[k],1):"—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`:""}`;
}
function workoutTxt(day){return (day.workouts||[]).map(x=>x.type==="cardio"?`${(CARDIO.find(c=>c[0]===x.ctype)||[,"Cardio"])[1]} ${x.min?x.min+" min":""}${x.km?" "+nf(x.km,2)+" km":""}${cardioKcal(x)?" "+cardioKcal(x)+" kcal":""}`:(x.name||"Exercício")).join("; ")}
function csvDownload(name,rows){
  const s=rows.map(r=>r.map(v=>{v=v==null?"":String(v);return /[;"\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}).join(";")).join("\r\n");
  const blob=new Blob(["﻿"+s],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
const dec=n=>n==null||n===""?"":String(r1(n)).replace(".",",");
function exportCSV(kind){
  const days=rangeDays(REP_N);let rows;
  if(kind==="days"){rows=[["Data","kcal","Meta kcal","Proteína (g)","Carboidrato (g)","Gordura (g)","Fibra (g)","Água (L)","Peso (kg)","Peso tendência (kg)","Treino","Gasto treino (kcal)","Anotação"]];
    const ser=weightSeries();const tmap={};ser.forEach(x=>tmap[x.d]=x.t);
    days.forEach(d=>{const t=dayTotals(d),day=S.days[d]||{};rows.push([d,r0(t.kcal),dayTarget(d).kcal,dec(t.p),dec(t.c),dec(t.g),dec(t.fib),dec((day.water||0)/1000),dec(day.weight),dec(tmap[d]),workoutTxt(day),exKcal(d)||"",day.note||""])})}
  if(kind==="foods"){rows=[["Data","Refeição","Alimento","Quantidade","Gramas","kcal","Proteína (g)","Carboidrato (g)","Gordura (g)","Fibra (g)"]];
    days.forEach(d=>{const day=S.days[d];if(!day||!day.meals)return;MEALS.forEach(([k,n])=>(day.meals[k]||[]).forEach(i=>rows.push([d,n,i.name,itemQty(i),dec(i.q),r0(i.kcal),dec(i.p),dec(i.c),dec(i.g),dec(i.fib)])))})}
  if(kind==="train"){rows=[["Data","Treino","Tipo","Atividade","Séries (reps×kg)","Duração (min)","Distância (km)","Ritmo","Calorias"]];
    days.forEach(d=>{const day=S.days[d];if(!day)return;(day.workouts||[]).forEach(x=>{if(x.type==="cardio")rows.push([d,day.wname||"","Cardio",(CARDIO.find(c=>c[0]===x.ctype)||[,""])[1],"",x.min||"",dec(x.km),paceTxt(x.min,x.km).split(" ·")[0],cardioKcal(x)||""]);else rows.push([d,day.wname||"","Musculação",x.name,setsTxt((x.sets||[]).filter(s=>s.r>0)),"","","",""])})})}
  csvDownload(`nutriplano-${kind==="days"?"resumo":kind==="foods"?"alimentos":"treinos"}-${TODAY()}.csv`,rows);
}

/* ============ PERFIL ============ */
function profileFormHTML(p,first){
  p=p||{sex:"m",age:30,height:170,weight:"",activity:1.375,goal:"perder",rate:0.5,goalWeight:""};const g=GOALS[p.goal]||GOALS.perder;
  return `<div class="form">
    <label class="f">Sexo<select id="pf_sex"><option value="m" ${p.sex==="m"?"selected":""}>Masculino</option><option value="f" ${p.sex==="f"?"selected":""}>Feminino</option></select></label>
    <label class="f">Idade<input type="number" id="pf_age" value="${p.age||""}" min="14" max="99"></label><label class="f">Altura (cm)<input type="number" id="pf_height" value="${p.height||""}" min="120" max="230"></label>
    <label class="f">${first?"Peso atual (kg)":"Peso de referência (kg)"}<input type="number" id="pf_weight" step="0.1" value="${p.weight||""}">${first?"":`<span class="hint">Os cálculos usam a tendência do Diário.</span>`}</label>
    <label class="f" style="grid-column:1/-1">Nível de atividade<select id="pf_act">${ACT.map(([v,l])=>`<option value="${v}" ${+p.activity===v?"selected":""}>${l}</option>`).join("")}</select></label>
    <label class="f" style="grid-column:1/-1">Objetivo<select id="pf_goal">${Object.entries(GOALS).map(([k,v])=>`<option value="${k}" ${p.goal===k?"selected":""}>${v.label}</option>`).join("")}</select></label>
    <label class="f">Ritmo<select id="pf_rate">${g.rates.map(r=>`<option value="${r}" ${+p.rate===r?"selected":""}>${rateLabel(p.goal,r)}</option>`).join("")}</select></label>
    <label class="f">Peso meta (kg, opcional)<input type="number" id="pf_gw" step="0.1" value="${p.goalWeight||""}"></label>
    ${first?"":`<label class="f">Proteína (g por kg)<input type="number" id="pf_prot" step="0.1" value="${p.protPerKg||g.prot}"><span class="hint">1,6–2,2 para quem treina</span></label><label class="f">Gordura mínima (g por kg)<input type="number" id="pf_fat" step="0.1" value="${p.fatPerKg||g.fat}"></label><label class="f">Meta de água (ml/dia)<input type="number" id="pf_water" step="250" value="${p.waterMl||""}" placeholder="auto: 35 ml/kg"></label>`}</div>`;
}
function rateLabel(goal,r){if(goal==="manter")return "Manter";if(r===0)return "Manutenção (foco em treino)";const s=GOALS[goal].sign<0?"perder":"ganhar";const tag=goal==="perder"?(r<=0.25?" — leve":r<=0.5?" — recomendado":r<=0.75?" — moderado":" — agressivo"):goal==="ganhar"?(r<=0.1?" — enxuto":r<=0.25?" — recomendado":" — rápido"):"";return `${s} ${nf(r,2)}% do peso/semana${tag}`}
function readProfileForm(base){
  const p=Object.assign({},base||{});p.sex=$("#pf_sex").value;p.age=numv($("#pf_age").value);p.height=numv($("#pf_height").value);p.weight=numv($("#pf_weight").value);
  p.activity=+$("#pf_act").value;p.goal=$("#pf_goal").value;p.rate=+$("#pf_rate").value;p.goalWeight=numv($("#pf_gw").value);
  if($("#pf_prot")){p.protPerKg=numv($("#pf_prot").value);p.fatPerKg=numv($("#pf_fat").value);p.waterMl=numv($("#pf_water").value)}
  if(!p.age||!p.height||!p.weight){toast("Preencha idade, altura e peso");return null}return p;
}
function bindProfileForm(){
  const gs=$("#pf_goal");if(!gs)return;
  gs.addEventListener("change",()=>{const g=GOALS[gs.value];$("#pf_rate").innerHTML=g.rates.map(r=>`<option value="${r}" ${r===g.def?"selected":""}>${rateLabel(gs.value,r)}</option>`).join("");if($("#pf_prot")){$("#pf_prot").value=g.prot;$("#pf_fat").value=g.fat}previewTargets()});
  $$("#app input,#app select").forEach(el=>el.addEventListener("input",previewTargets));previewTargets();
}
function previewTargets(){
  const box=$("#pfprev");if(!box||!$("#pf_sex"))return;
  const p={sex:$("#pf_sex").value,age:numv($("#pf_age").value),height:numv($("#pf_height").value),activity:+$("#pf_act").value,goal:$("#pf_goal").value,rate:+$("#pf_rate").value,protPerKg:$("#pf_prot")?numv($("#pf_prot").value):null,fatPerKg:$("#pf_fat")?numv($("#pf_fat").value):null};
  const w=S.profile?(currentWeight()||numv($("#pf_weight").value)):numv($("#pf_weight").value);
  if(!p.age||!p.height||!w){box.innerHTML=`<span class="muted small">Preencha os dados para ver suas metas.</span>`;return}
  const tdee=S.profile&&S.profile.tdee?S.profile.tdee:formulaTDEE(p,w);const t=buildTargets(p,tdee,w);
  box.innerHTML=`<div class="preview" style="margin:0"><div><b class="num">${nf(t.kcal)}</b><span>kcal/dia</span></div><div><b class="num" style="color:var(--p)">${t.p}</b><span>proteína g</span></div><div><b class="num" style="color:var(--c)">${t.c}</b><span>carbo g</span></div><div><b class="num" style="color:var(--g)">${t.g}</b><span>gordura g</span></div></div><div class="tiny muted" style="margin-top:6px">Gasto ${S.profile&&S.profile.tdee?"estimado atual":"pela fórmula"}: ${nf(tdee)} kcal · basal ${nf(bmr(p,w))} kcal${t.floored?` · <b style="color:var(--warn)">limitada ao piso de ${nf(minKcal(p))} kcal</b>`:""}</div>`;
}
function onboardingHTML(){
  return `<div class="welcome"><div class="hero"><h1>Bem-vindo ao Nutri Plano</h1><p class="muted" style="margin:0">Registre o que come pela quantidade, acompanhe treinos e peso, e deixe a meta de calorias se ajustar sozinha toda semana.</p></div>
  <div class="card"><h2>Seus dados</h2>${profileFormHTML(null,true)}<div style="margin-top:14px" id="pfprev"></div><div class="row" style="margin-top:14px"><label class="btn ghost small" style="cursor:pointer">Importar backup do Claude<input type="file" id="impf" accept=".json,application/json" hidden></label><span class="sp"></span><button class="btn pri" data-act="pfcreate">Começar</button></div></div>
  <div class="row" style="margin-top:12px"><span class="tiny muted">${esc(S.user.email)}</span><span class="sp"></span><button class="btn sm ghost" data-act="logout">Sair</button></div></div>`;
}
async function renderAccessList(){
  const el=$("#acl");if(!el)return;const {data,error}=await sb.from("allowed_emails").select("*").order("added_at");
  if(error){el.innerHTML=`<div class="small muted">Não consegui carregar a lista.</div>`;return}
  el.innerHTML=data.map(r=>`<div class="kv"><span>${esc(r.email)} ${r.is_admin?'<span class="tag">admin</span>':""} ${r.note?`<span class="tiny muted">· ${esc(r.note)}</span>`:""}</span>${r.email===S.user.email?"":`<button class="iconbtn" data-act="acldel" data-email="${esc(r.email)}">${ic("x",16)}</button>`}</div>`).join("");
}
function renderPerfil(){
  const P=S.profile;const cy=P.cycle||{on:false,trainDays:4,shift:200};
  $("#app").innerHTML=`<div class="row" style="margin-bottom:14px"><h1 style="margin:0">Perfil e metas</h1><span class="sp"></span><span class="small muted">${esc(S.user.email)}</span><button class="btn sm" data-act="logout">${ic("logout",15)} Sair</button></div>
  <div class="grid g2"><div>
   <div class="card" style="margin-bottom:14px"><h2>Dados e objetivo</h2>${profileFormHTML(P,false)}<div style="margin-top:14px" id="pfprev"></div>
    <label class="switch small" style="margin-top:12px"><input type="checkbox" id="pf_addex" ${P.addExercise?"checked":""}> Somar calorias gastas no treino à meta do dia</label>
    <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="pfformula">Recalcular gasto pela fórmula</button><span class="sp"></span><button class="btn pri" data-act="pfsave">Salvar e atualizar metas</button></div></div>
   <div class="card" style="margin-bottom:14px"><h2>Metas diferentes em dia de treino e de descanso</h2>
    <p class="small muted" style="margin-top:0">Mais carboidrato nos dias de treino, menos nos de descanso — a média da semana continua igual à sua meta. Um dia conta como treino quando tem atividade registrada (ou quando você marca no Diário).</p>
    <label class="switch small"><input type="checkbox" id="cy_on" ${cy.on?"checked":""}> Ativar ciclo treino/descanso</label>
    <div class="form" style="margin-top:10px"><label class="f">Dias de treino por semana<input type="number" id="cy_td" min="1" max="6" value="${cy.trainDays||4}"></label><label class="f">Calorias a mais no dia de treino<input type="number" id="cy_sh" step="50" value="${cy.shift||200}"><span class="hint">Vêm de carboidrato</span></label></div>
    <div class="small" id="cy_prev" style="margin-top:8px"></div><div class="row" style="margin-top:10px"><span class="sp"></span><button class="btn" data-act="cysave">Salvar ciclo</button></div></div>
   <div class="card"><h2>Inteligência artificial</h2>${S.ai?`<p class="small" style="margin:0">✅ Ativada — foto do prato, estimativa de alimentos e relatório semanal disponíveis.</p>`:`<p class="small" style="margin-top:0">Desativada. Para ativar: no painel do Supabase, abra o projeto <b>nutriplano</b> → <b>Edge Functions → Secrets</b> e crie <code>OPENAI_API_KEY</code> com a sua chave da OpenAI. Depois é só recarregar o app.</p>`}</div>
  </div><div>
   <div class="card" style="margin-bottom:14px"><h2>Meus suplementos diários</h2><p class="small muted" style="margin-top:0">Aparecem como checklist no Diário. Para contar calorias (ex: whey), lance no Diário como alimento.</p>
    ${(P.supps||[]).map(sp=>`<div class="kv"><span>${esc(sp.name)} ${sp.dose?`<span class="muted small">· ${esc(sp.dose)}</span>`:""}</span><button class="iconbtn" data-act="suppdel" data-id="${esc(sp.id)}">${ic("x",16)}</button></div>`).join("")}
    <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" id="sp_name" list="spl" placeholder="ex: Creatina"><input type="text" id="sp_dose" placeholder="dose, ex: 5 g" style="max-width:120px"><button class="btn sm pri" data-act="suppadd" aria-label="Adicionar">${ic("plus",16)}</button></div>
    <datalist id="spl">${["Creatina","Whey protein","Multivitamínico","Ômega 3","Vitamina D","Cafeína","Magnésio","Colágeno","Glutamina","Pré-treino"].map(x=>`<option value="${x}">`).join("")}</datalist></div>
   ${S.admin?`<div class="card" style="margin-bottom:14px"><h2>Quem pode acessar (admin)</h2><p class="small muted" style="margin-top:0">Só estes e-mails conseguem criar acesso. Depois de incluir, a pessoa entra em “Primeiro acesso” e cria a senha. Cada um vê só os próprios dados.</p>
    <div id="acl"><div class="small muted">Carregando…</div></div>
    <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" id="acl_email" placeholder="email@exemplo.com" inputmode="email"><input type="text" id="acl_note" placeholder="nome (opcional)" style="max-width:150px"><button class="btn sm pri" data-act="acladd">Liberar</button></div>
    <label class="switch tiny muted" style="margin-top:6px"><input type="checkbox" id="acl_admin"> também é administrador</label></div>`:""}
   <div class="card" style="margin-bottom:14px"><h2>Backup</h2><p class="small muted" style="margin-top:0">Tudo fica salvo no banco. O backup serve para guardar uma cópia ou trazer os dados da versão do Claude.</p>
    <div class="row"><button class="btn" data-act="export">${ic("download")} Baixar backup (JSON)</button><label class="btn">${ic("upload")} Importar backup<input type="file" id="impf" accept=".json,application/json" hidden></label></div>
    <p class="tiny muted">${Object.keys(S.days).length} dias registrados · ${(P.customFoods||[]).length} alimentos e receitas próprios</p></div>
   <div class="card"><h2>Referências</h2><ul class="small" style="padding-left:18px;margin:0;line-height:1.7"><li>Ajuste adaptativo de gasto inspirado no MacroFactor</li><li>Tendência de peso por média móvel exponencial</li><li>Gasto inicial: Mifflin-St Jeor</li><li>Alimentos: TACO (NEPA/UNICAMP) e TBCA (USP); suplementos pelo rótulo</li><li>Exercícios: Compêndio de Atividades Físicas (METs); corrida ≈ 1 kcal/kg/km</li></ul></div>
  </div></div><p class="foot">Ferramenta de acompanhamento — não substitui orientação de nutricionista ou médico.</p>`;
  bindProfileForm();$("#impf").addEventListener("change",importFile);renderAccessList();
  const cyp=()=>{const td=clamp(numv($("#cy_td").value)||4,1,6),sh=numv($("#cy_sh").value)||0;const T=P.targets;$("#cy_prev").innerHTML=`Treino: <b>${nf(Math.round((T.kcal+sh)/10)*10)}</b> kcal · Descanso: <b>${nf(Math.round((T.kcal-sh*td/(7-td))/10)*10)}</b> kcal`};
  ["cy_td","cy_sh"].forEach(id=>$("#"+id).addEventListener("input",cyp));cyp();
}
function importFile(e){
  const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{const o=JSON.parse(rd.result);if(!o.profile||!o.days)throw 0;
    S.profile=Object.assign({},o.profile);S.days=Object.assign({},S.days,o.days);saveProfile();Object.keys(o.days).forEach(saveDay);toast(`Backup importado: ${Object.keys(o.days).length} dias`);route()}catch(err){toast("Arquivo inválido")}};
  rd.readAsText(f);
}

/* ============ cliques ============ */
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]");if(!b)return;const a=b.dataset.act;if(a==="del"||a==="pdel")e.stopPropagation();const d=S.date;
  if(a.startsWith("au_")&&a!=="au_mode"){authAction(a);return}
  switch(a){
    case "au_mode":AUTH.mode=b.dataset.m;AUTH.msg="";AUTH.ok="";renderAuth();break;
    case "logout":{for(const k of Object.keys(pending)){clearTimeout(timers[k]);await flush(k)}await sb.auth.signOut();location.hash="";break}
    case "day":S.date=addDays(S.date,+b.dataset.n);render();break;
    case "today":S.date=TODAY();render();break;
    case "goday":S.date=b.dataset.d;render();break;
    case "add":openAdd(b.dataset.meal);break;
    case "edit":{const it=getDay(d,true).meals[b.dataset.meal][+b.dataset.ix];if(!it)break;M.meal=b.dataset.meal;
      if(!it.fid||!foodById(it.fid)){toast("Este item foi lançado com valores prontos — remova e lance de novo para alterar");break}
      M.food=foodById(it.fid);M.edit={meal:b.dataset.meal,ix:+b.dataset.ix,item:it};M.mode="qty";showModal();renderModal();break}
    case "del":getDay(d,true).meals[b.dataset.meal].splice(+b.dataset.ix,1);saveDay(d);render();break;
    case "copymeal":{const src=S.days[addDays(d,-1)];const day=getDay(d,true);day.meals[b.dataset.meal]=day.meals[b.dataset.meal].concat(clone(src.meals[b.dataset.meal]||[]));saveDay(d);render();toast("Refeição repetida");break}
    case "savemeal":M.meal=b.dataset.meal;M.mode="savemeal";showModal();renderModal();break;
    case "savemealok":{const n=$("#smn").value.trim();if(!n){toast("Dê um nome");break}S.profile.saved=(S.profile.saved||[]).concat([{id:uid(),name:n,items:clone(getDay(d,true).meals[M.meal])}]);saveProfile();closeModal();toast("Refeição salva — use em “Adicionar → Refeições salvas”");break}
    case "msaved":M.mode="saved";renderModal();break;
    case "usesaved":{const sm=(S.profile.saved||[]).find(x=>x.id===b.dataset.id);if(!sm)break;getDay(d,true).meals[M.meal].push(...clone(sm.items));saveDay(d);closeModal();render();toast(`${sm.name} adicionada`);break}
    case "delsaved":S.profile.saved=(S.profile.saved||[]).filter(x=>x.id!==b.dataset.id);saveProfile();render();break;
    case "trainday":getDay(d,true).train=b.dataset.v==="1";saveDay(d);render();break;
    case "water":{const day=getDay(d,true);day.water=Math.max(0,(day.water||0)+ +b.dataset.n);saveDay(d);render();break}
    case "saveall":{const dd=getDay(d,true);const w=$("#wInput");if(w){const v=numv(w.value);dd.weight=v&&v>20?r1(v):null}const n=$("#noteInput");if(n)dd.note=n.value;saveDay(d);
      b.disabled=true;b.innerHTML="Salvando…";for(const k of Object.keys(pending)){clearTimeout(timers[k]);await flush(k)}
      b.disabled=false;b.innerHTML=hadError?"Tentar de novo":ic("check")+" Salvo";if(!hadError){toast("Dia salvo");setTimeout(()=>{if(b.isConnected)b.innerHTML=ic("save")+" Salvar dia"},2000)}break}
    case "suppck":{const day=getDay(d,true);day.supps=day.supps||{};day.supps[b.dataset.id]=!day.supps[b.dataset.id];saveDay(d);render();break}
    case "suppadd":{const n=$("#sp_name").value.trim();if(!n){toast("Informe o suplemento");break}S.profile.supps=(S.profile.supps||[]).concat([{id:uid(),name:n,dose:$("#sp_dose").value.trim()}]);saveProfile();render();break}
    case "suppdel":S.profile.supps=(S.profile.supps||[]).filter(x=>x.id!==b.dataset.id);saveProfile();render();break;
    case "close":closeModal();break;
    case "pick":M.food=foodById(b.dataset.fid);M.edit=null;M.mode="qty";renderModal();break;
    case "mback":if(M.edit){closeModal();break}M.mode="search";M.food=null;renderModal();break;
    case "mquick":M.mode="quick";renderModal();break;
    case "mphoto":M.mode="photo";M.photo=null;renderModal();break;
    case "phadd":photoAdd();break;
    case "mcreate":M.mode="create";M.ai=!!b.dataset.ai;M.aiFilled=false;renderModal();break;
    case "qset":$("#qn").value=b.dataset.v;$("#qn").dispatchEvent(new Event("input"));break;
    case "mconfirm":confirmQty();break;
    case "mdel":getDay(d,true).meals[M.edit.meal].splice(M.edit.ix,1);saveDay(d);closeModal();render();break;
    case "quicksave":quickSave();break;
    case "aiask":aiAsk();break;
    case "createsave":createSave();break;
    case "newfoodpage":M.meal=null;M.q="";M.mode="create";M.ai=!!b.dataset.ai;M.aiFilled=false;showModal();renderModal();break;
    case "newrecipe":M.meal=null;M.mode="recipe";M.recipe={name:"",ings:[],yieldG:null,servings:null};showModal();renderModal();break;
    case "editrecipe":{const f=foodById(b.dataset.fid);if(!f)break;M.meal=null;M.mode="recipe";M.recipe={id:f.id,name:f.name,ings:clone(f.ings||[]),yieldG:f.yieldG,servings:f.servings};showModal();renderModal();break}
    case "radd":{const f=foodById(b.dataset.fid);if(f){M.recipe.ings.push(calcItem(f,100,"g"));renderRecipe();const x=$$("[data-rg]");if(x.length)x[x.length-1].select()}break}
    case "rdel":M.recipe.ings.splice(+b.dataset.ix,1);renderRecipe();break;
    case "rsave":recipeSave();break;
    case "delfood":{const f=foodById(b.dataset.fid);if(!f)break;if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="Excluir?";b.style.color="var(--g)";setTimeout(()=>{b.dataset.confirm="";b.innerHTML=ic("x",16);b.style.color=""},2500);break}
      S.profile.customFoods=S.profile.customFoods.filter(x=>x.id!==f.id);saveProfile();renderAlimentos();break}
    case "wadd":{const day=getDay(d,true);const t=b.dataset.t;
      if(t==="cardio"||t==="luta"){const x={type:"cardio",ctype:t==="luta"?"kickboxing":"corrida",min:t==="luta"?60:30};recalcCardio(x);day.workouts.push(x)}
      else day.workouts.push({type:"forca",name:"",sets:[{r:null,kg:null},{r:null,kg:null},{r:null,kg:null}]});
      saveDay(d);render();if(t==="forca"){const ins=$$('input[data-f="name"]');if(ins.length)ins[ins.length-1].focus()}break}
    case "wdel":getDay(d,true).workouts.splice(+b.dataset.i,1);saveDay(d);render();break;
    case "sadd":{const x=getDay(d,true).workouts[+b.dataset.i];const last=x.sets[x.sets.length-1];x.sets.push(last?{r:last.r,kg:last.kg}:{r:null,kg:null});saveDay(d);render();break}
    case "sdel":getDay(d,true).workouts[+b.dataset.i].sets.splice(+b.dataset.j,1);saveDay(d);render();break;
    case "period":S.period=b.dataset.v==="all"?"all":+b.dataset.v;render();break;
    case "aireport":aiReport();break;
    case "pdel":if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="confirmar?";setTimeout(()=>{b.dataset.confirm="";b.textContent="apagar"},2500);break}deletePhoto(b.dataset.path);break;
    case "checkin":{const pv=applyCheckin(false);toast(`Meta atualizada: ${nf(pv.targets.kcal)} kcal`);render();break}
    case "repn":REP_N=+b.dataset.v;render();break;
    case "print":window.print();break;
    case "csvdays":exportCSV("days");break;case "csvfoods":exportCSV("foods");break;case "csvtrain":exportCSV("train");break;
    case "calcuse":{const c=calcRead();if(!c)break;const p=S.profile;p.sex=c.sex;p.age=c.age;p.height=c.height;p.activity=c.act;p.weight=c.weight;const day=getDay(TODAY(),true);day.weight=r1(c.weight);saveDay(TODAY());const w=currentWeight()||c.weight;p.targets=buildTargets(p,p.tdee||formulaTDEE(p,w),w);saveProfile();toast("Perfil atualizado com esses dados");break}
    case "pfcreate":{const p=readProfileForm({});if(!p)break;
      Object.assign(p,{goalWeight:p.goalWeight||null,customFoods:[],recent:[],saved:[],supps:[],addExercise:false,autoApply:false,created:TODAY()});
      p.tdee=Math.round(formulaTDEE(p,p.weight));p.targets=buildTargets(p,p.tdee,p.weight);p.lastCheckin=TODAY();p.lastWeight=p.weight;
      p.checkins=[{date:TODAY(),tdee:p.tdee,kcal:p.targets.kcal,p:p.targets.p,c:p.targets.c,g:p.targets.g,weight:p.weight,type:"inicial"}];
      S.profile=p;saveProfile();const day=getDay(TODAY(),true);if(!day.weight){day.weight=r1(p.weight);saveDay(TODAY())}location.hash="#diario";route();toast("Tudo pronto! Registre sua primeira refeição.");break}
    case "pfsave":{const p=readProfileForm(S.profile);if(!p)break;p.addExercise=$("#pf_addex").checked;S.profile=p;const w=currentWeight()||p.weight;p.targets=buildTargets(p,p.tdee||formulaTDEE(p,w),w);saveProfile();toast("Metas atualizadas");render();break}
    case "pfformula":{const p=S.profile;const w=currentWeight()||p.weight;p.tdee=Math.round(formulaTDEE(p,w));p.targets=buildTargets(p,p.tdee,w);saveProfile();toast(`Gasto redefinido para ${nf(p.tdee)} kcal`);render();break}
    case "cysave":S.profile.cycle={on:$("#cy_on").checked,trainDays:clamp(numv($("#cy_td").value)||4,1,6),shift:Math.max(0,numv($("#cy_sh").value)||0)};saveProfile();toast("Ciclo salvo");render();break;
    case "export":{const txt=JSON.stringify({app:"NutriPlano",version:2,exported:TODAY(),profile:S.profile,days:S.days});csvDownloadRaw(`nutriplano-backup-${TODAY()}.json`,txt,"application/json");break}
    case "acladd":{const em=$("#acl_email").value.trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){toast("E-mail inválido");break}
      const {error}=await sb.from("allowed_emails").insert({email:em,is_admin:$("#acl_admin").checked,note:$("#acl_note").value.trim()||null});
      if(error){toast(/duplicate/i.test(error.message)?"Esse e-mail já está liberado":"Não consegui liberar");break}$("#acl_email").value="";$("#acl_note").value="";toast(`${em} liberado — agora ele entra em “Primeiro acesso”`);renderAccessList();break}
    case "acldel":{if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="?";setTimeout(()=>{b.dataset.confirm="";b.innerHTML=ic("x",16)},2500);break}
      const {error}=await sb.from("allowed_emails").delete().eq("email",b.dataset.email);if(error)toast("Não consegui remover");else{toast("Acesso removido");renderAccessList()}break}
  }
});
function csvDownloadRaw(name,txt,type){const blob=new Blob([txt],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

/* ============ início ============ */
(async function boot(){
  if(!window.supabase||!CFG.url){$("#app").innerHTML=`<div class="card" style="max-width:520px;margin:40px auto">Não consegui carregar o app (sem conexão). Verifique a internet e recarregue.</div>`;return}
  const isRecovery=/type=recovery/.test(location.hash);if(isRecovery)AUTH.mode="recovery";
  const hashErr=/error_description=([^&]+)/.exec(location.hash);if(hashErr){AUTH.msg=/expired|invalid/i.test(decodeURIComponent(hashErr[1]))?"Este link já foi usado ou expirou. Se você já confirmou o e-mail, é só entrar.":decodeURIComponent(hashErr[1].replace(/\+/g," "));history.replaceState(null,"",location.pathname)}
  sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==="PASSWORD_RECOVERY"){AUTH.mode="recovery";AUTH.msg="";renderAuth();return}
    if(ev==="SIGNED_OUT"){S.user=null;S.profile=null;S.days={};S.booted=false;AUTH.mode="login";AUTH.msg="";AUTH.ok="";renderAuth();return}
    if(ev==="SIGNED_IN"&&session&&AUTH.mode!=="recovery")setTimeout(()=>startApp(session),0);
  });
  const {data}=await sb.auth.getSession();
  if(isRecovery){AUTH.mode="recovery";renderAuth();return}
  if(data.session)await startApp(data.session);else renderAuth();
})();
