"use strict";
/* Nutri Plano — nutricionista / personal com acesso SÓ DE LEITURA aos alunos vinculados.
   O filtro do que cada profissional vê e a regra de só leitura ficam no banco (funções pro_*).
   Aqui só exibimos; nada nesta tela grava dados do aluno. */
const PRO_KIND={nutri:"Nutricionista",personal:"Personal trainer"};
const PRO={list:null,cache:{},sel:null,day:null,loading:false,err:null,pendingCode:null,found:null,mine:null};

/* ---------- inicialização ---------- */
function proReset(){Object.assign(PRO,{list:null,cache:{},sel:null,day:null,err:null,pendingCode:null,found:null,mine:null,adm:null,sname:null})}
async function proBoot(){
  S.pro=null;proReset();
  try{const {data}=await sb.from("professionals").select("kind,name,code,active").eq("email",String(S.user.email||"").toLowerCase()).maybeSingle();if(data&&data.active)S.pro=data}catch(e){}
  proNav();
}
function proNav(){
  const tabs=$("#tabs");if(!tabs)return;let a=tabs.querySelector('a[data-v="alunos"]');
  if(S.pro&&!a){a=document.createElement("a");a.href="#alunos";a.dataset.v="alunos";a.title="Meus alunos";a.innerHTML=`${ic("alunos")}<span class="tab-lbl">Meus alunos</span>`;tabs.insertBefore(a,tabs.querySelector('a[data-v="perfil"]'))}
  if(!S.pro&&a)a.remove();
}

/* ---------- utilidades ---------- */
const proDays=n=>{const o=[];for(let i=n-1;i>=0;i--)o.push(addDays(TODAY(),-i));return o};
function proWith(st,fn){const sp=S.profile,sd=S.days;S.profile=Object.assign({targets:{kcal:0,p:0,c:0,g:0}},st.profile||{});S.days=st.days||{};try{return fn()}finally{S.profile=sp;S.days=sd}}
function proAgo(d){if(!d)return "nunca registrou";const n=Math.round((parseYmd(TODAY())-parseYmd(d))/864e5);return n<=0?"hoje":n===1?"ontem":`há ${n} dias`}
async function proFetch(id,n=60){
  const k=id+":"+n;if(PRO.cache[k])return PRO.cache[k];
  const {data,error}=await sb.rpc("pro_student",{p_student:id,p_from:addDays(TODAY(),-(n-1))});
  if(error)throw error;PRO.cache[k]=data;return data;
}
const proHasW=day=>!!(day&&(day.workouts||[]).length);
function proSummary(st){
  return proWith(st,()=>{
    const d7=proDays(7),nutri=st.kind==="nutri";const ks=Object.keys(S.days).sort();
    const last=[...ks].reverse().find(d=>nutri?isLogged(d):proHasW(S.days[d]))||null;
    const ser=weightSeries();const wNow=ser.length?ser[ser.length-1].t:null;const w14=ser.find(x=>x.d>=addDays(TODAY(),-14));
    const out={last,wNow,wDelta:wNow!=null&&w14&&w14.t!=null?wNow-w14.t:null};
    if(nutri){const lg=d7.filter(isLogged);out.logged=lg.length;
      if(lg.length){const k=lg.reduce((a,d)=>a+dayKcal(d),0)/lg.length,t=lg.reduce((a,d)=>a+dayTarget(d).kcal,0)/lg.length,p=lg.reduce((a,d)=>a+dayTotals(d).p,0)/lg.length,pt=lg.reduce((a,d)=>a+dayTarget(d).p,0)/lg.length;
        Object.assign(out,{kcal:k,kcalT:t,pct:t?k/t:null,prot:p,protT:pt})}}
    else{out.w7=d7.filter(d=>proHasW(S.days[d])).length;out.w30=proDays(30).filter(d=>proHasW(S.days[d])).length;
      out.km30=proDays(30).reduce((a,d)=>a+((S.days[d]||{}).workouts||[]).reduce((b,x)=>b+(x.type==="cardio"&&x.km>0?x.km:0),0),0)}
    return out;
  });
}

/* ---------- tela do profissional ---------- */
function renderAlunos(){
  if(!S.pro){$("#app").innerHTML=`<div class="card" style="max-width:560px"><h2>Área do profissional</h2><p class="small muted" style="margin:0">Esta área é para nutricionistas e personal trainers cadastrados pelo administrador.</p></div>`;return}
  if(PRO.sel)return renderAluno(PRO.sel);
  $("#app").innerHTML=`<div class="row" style="margin-bottom:14px"><h1 style="margin:0">Meus alunos</h1><span class="sp"></span><span class="tag tag-ok">${esc(PRO_KIND[S.pro.kind])}</span>${S.profile?"":`<button class="btn sm" data-act="logout">${ic("logout",15)} Sair</button>`}</div>
  <div class="card pro-code" style="margin-bottom:14px"><div><div class="small muted">Seu código para os alunos</div><div class="pro-code-n num">${esc(S.pro.code)}</div></div>
   <p class="small muted" style="margin:0">O aluno digita este código em <b>Perfil → Nutricionista e personal</b> e escolhe compartilhar com você. Você só consegue <b>ver</b> os dados — nunca alterar.</p></div>
  <div id="prolist"><div class="loading">Carregando alunos…</div></div>${S.profile?"":`<p class="small muted" style="margin-top:14px">Quer usar o Nutri Plano para você também? <a href="#diario">Preencher meus dados</a></p>`}`;
  proLoadList();
}
async function proLoadList(){
  const el=$("#prolist");
  try{const {data,error}=await sb.rpc("pro_students");if(error)throw error;PRO.list=data||[]}catch(e){if(el)el.innerHTML=`<div class="card small muted">Não consegui carregar seus alunos agora.</div>`;return}
  if(!$("#prolist"))return;
  if(!PRO.list.length){$("#prolist").innerHTML=`<div class="card empty-pro"><h2 style="margin-top:0">Nenhum aluno vinculado ainda</h2><p class="small muted" style="margin:0">Passe o código <b>${esc(S.pro.code)}</b> para seus alunos. Assim que alguém vincular, aparece aqui.</p></div>`;return}
  $("#prolist").innerHTML=`<div class="pro-grid">${PRO.list.map(s=>`<a class="card pro-card" href="#alunos/${esc(s.student_id)}" data-sid="${esc(s.student_id)}"><div class="pro-card-h"><span class="pro-av">${esc((s.student_name||"?").trim().charAt(0).toUpperCase())}</span><div><b>${esc(s.student_name)}</b><div class="tiny muted">Vinculado em ${esc(short(String(s.created_at).slice(0,10)))}${s.share_photos?" · compartilha fotos":""}</div></div></div><div class="pro-card-b small muted">Carregando…</div></a>`).join("")}</div>`;
  await Promise.all(PRO.list.map(async s=>{
    const box=$(`.pro-card[data-sid="${CSS.escape(s.student_id)}"] .pro-card-b`);
    try{const st=await proFetch(s.student_id,30);const m=proSummary(st);if(box)box.outerHTML=proCardBody(st,m)}catch(e){if(box)box.textContent="Não consegui carregar."}
  }));
}
function proCardBody(st,m){
  const n=m.last?Math.round((parseYmd(TODAY())-parseYmd(m.last))/864e5):99;const alert=n>=3;
  const w=m.wNow!=null?`${nf(m.wNow,1)} kg${m.wDelta!=null?` <span class="${m.wDelta<=0?"pos":"neg"}">(${m.wDelta>0?"+":""}${nf(m.wDelta,1)} em 14 dias)</span>`:""}`:"—";
  const rows=st.kind==="nutri"
    ?[["Dias registrados (7 dias)",`${m.logged}/7`],["Calorias × meta",m.pct!=null?`${nf(m.pct*100)}%`:"—"],["Proteína média",m.prot!=null?`${nf(m.prot)} / ${nf(m.protT)} g`:"—"],["Peso (tendência)",w]]
    :[["Treinos (7 dias)",`${m.w7}`],["Treinos (30 dias)",`${m.w30}`],["Corrida/cardio (30 dias)",`${nf(m.km30,1)} km`],["Peso (tendência)",w]];
  return `<div class="pro-card-b"><div class="pro-last ${alert?"warn":""}">${alert?ic("bell",15):ic("check",15)} Último registro: <b>${proAgo(m.last)}</b></div>${rows.map(([a,b])=>`<div class="kv"><span>${a}</span><b class="num">${b}</b></div>`).join("")}</div>`;
}

function renderAluno(id){
  $("#app").innerHTML=`<div class="loading">Carregando aluno…</div>`;
  proFetch(id,60).then(st=>{if(VIEW!=="alunos"||PRO.sel!==id)return;PRO.day=PRO.day||TODAY();drawAluno(id,st)})
    .catch(()=>{$("#app").innerHTML=`<div class="card" style="max-width:560px"><h2>Aluno indisponível</h2><p class="small muted">O vínculo pode ter sido cancelado pelo aluno.</p><a class="btn" href="#alunos">${ic("chevL",15)} Voltar</a></div>`});
}
function proProfileLine(p){
  const g=p.goal&&GOALS[p.goal]?GOALS[p.goal].label:"";
  return [p.sex?(p.sex==="m"?"Masculino":"Feminino"):"",p.age?`${p.age} anos`:"",p.height?`${nf(p.height)} cm`:"",g?`Objetivo: ${g}`:"",p.goalWeight?`Meta de peso: ${nf(p.goalWeight,1)} kg`:""].filter(Boolean).map(esc).join(" · ");
}
function drawAluno(id,st){
  const nutri=st.kind==="nutri";const m=proSummary(st);
  const head=`<div class="row" style="margin-bottom:6px"><a class="btn sm" href="#alunos" aria-label="Voltar">${ic("chevL",15)}</a><h1 style="margin:0">${esc(st.student_name)}</h1><span class="tag">${ic("eye",13)} só leitura</span></div>
   <p class="small muted" style="margin:0 0 14px">${proProfileLine(st.profile||{})||"Perfil sem dados."} · último registro ${proAgo(m.last)}</p>`;
  const body=nutri?proNutriHTML(st,m):proPersonalHTML(st,m);
  $("#app").innerHTML=head+body;
  proWeightChart(st);proPhotos(st);
}
function proTiles(t){return `<div class="pro-tiles" style="margin-bottom:14px">${t.map(([l,v,s])=>`<div class="tile"><div class="t">${l}</div><div class="v num">${v}</div>${s?`<div class="s">${s}</div>`:""}</div>`).join("")}</div>`}
function proWeightCard(){return `<div class="card" style="margin-bottom:14px"><h2>Peso</h2><div class="chartbox"><canvas id="chPW"></canvas></div><p class="tiny muted" style="margin:6px 0 0">Pontos: balança · linha: tendência (média móvel). Últimos 60 dias.</p></div>`}
function proMeasuresCard(st){
  return proWith(st,()=>{const hist=Object.keys(S.days).filter(x=>S.days[x].measures&&Object.values(S.days[x].measures).some(v=>v>0)).sort().reverse().slice(0,6);
    return `<div class="card" style="margin-bottom:14px"><h2>Medidas</h2>${hist.length?`<div class="tw"><table class="t"><thead><tr><th>Data</th>${MEAS.map(x=>`<th class="r">${esc(x[1].split(" ")[0])}</th>`).join("")}</tr></thead><tbody>${hist.map(d=>`<tr><td>${short(d)}</td>${MEAS.map(([k])=>`<td class="r num">${S.days[d].measures[k]>0?nf(S.days[d].measures[k],1):"—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`:`<p class="small muted" style="margin:0">Nenhuma medida registrada nos últimos 60 dias.</p>`}</div>`});
}
function proPhotosCard(st){return st.share_photos?`<div class="card" style="margin-bottom:14px"><h2>Fotos de progresso</h2><div class="photos" id="pphotos"><div class="small muted">Carregando…</div></div></div>`:`<div class="card" style="margin-bottom:14px"><h2>Fotos de progresso</h2><p class="small muted" style="margin:0">${ic("lock",14)} O aluno não compartilhou as fotos.</p></div>`}

function proNutriHTML(st,m){
  return proWith(st,()=>{
    const d=PRO.day,day=S.days[d]||{},T=dayTarget(d),tt=dayTotals(d);const P=S.profile;
    const tiles=proTiles([["Meta atual",`${nf(P.targets.kcal)}`,`kcal · P ${nf(P.targets.p)} · C ${nf(P.targets.c)} · G ${nf(P.targets.g)}`],["Dias registrados",`${m.logged}/7`,"últimos 7 dias"],["Calorias × meta",m.pct!=null?`${nf(m.pct*100)}%`:"—",m.kcal!=null?`média ${nf(m.kcal)} de ${nf(m.kcalT)} kcal`:"sem registros"],["Proteína média",m.prot!=null?`${nf(m.prot)} g`:"—",m.protT?`meta ${nf(m.protT)} g`:""],["Peso",m.wNow!=null?`${nf(m.wNow,1)}`:"—",m.wDelta!=null?`${m.wDelta>0?"+":""}${nf(m.wDelta,1)} kg em 14 dias`:"kg (tendência)"]]);
    const isT=d===TODAY();const lbl=isT?"Hoje":d===addDays(TODAY(),-1)?"Ontem":fmtDate(d,{weekday:"short",day:"numeric",month:"short"});
    const meals=MEALS.map(([k,name])=>{const it=(day.meals||{})[k]||[];if(!it.length)return "";const s=sumItems(it);
      return `<div class="pro-meal"><div class="pro-meal-h"><span class="meal-ic meal-ic-sm meal-${k}" aria-hidden="true">${ic("m_"+k,16)}</span><b>${esc(name)}</b><span class="sp"></span><span class="num small"><b>${nf(s.kcal)}</b> kcal · P ${nf(s.p)} g</span></div><ul class="items ro">${it.map(i=>`<li><div class="nm">${esc(i.name)}<div class="tiny muted">${esc(itemQty(i))}</div></div><span class="num small">${nf(i.kcal)} kcal</span></li>`).join("")}</ul></div>`}).join("");
    const days14=proDays(14).reverse();
    const sp=(P.supps||[]).filter(x=>!x.archived);
    return `${tiles}<div class="grid g2"><div>
      <div class="card" style="margin-bottom:14px"><div class="row" style="margin-bottom:10px"><button class="btn sm" data-pro="day" data-n="-1" aria-label="Dia anterior">${ic("chevL")}</button><b>${esc(lbl)}</b><button class="btn sm" data-pro="day" data-n="1" aria-label="Próximo dia" ${isT?"disabled":""}>${ic("chevR")}</button><span class="sp"></span><span class="small muted">${day.weight?`Peso ${nf(day.weight,1)} kg · `:""}Água ${nf((day.water||0)/1000,1)} L</span></div>
        ${[["Calorias",tt.kcal,T.kcal,"kcal","var(--accent)"],["Proteína",tt.p,T.p,"g","var(--p)"],["Carboidratos",tt.c,T.c,"g","var(--c)"],["Gorduras",tt.g,T.g,"g","var(--g)"]].map(([l,v,t,u,c])=>mbar(l,v,t,c,u)).join("")}
        <div style="margin-top:12px">${meals||`<p class="small muted" style="margin:0">Nada registrado neste dia.</p>`}</div></div>
      <div class="card" style="margin-bottom:14px"><h2>Últimos 14 dias</h2><div class="tw"><table class="t"><thead><tr><th>Dia</th><th class="r">Consumido</th><th class="r">Meta</th><th class="r">Proteína</th><th class="r">Treino</th></tr></thead><tbody>${days14.map(x=>{const lg=isLogged(x),t=dayTotals(x),tg=dayTarget(x);const over=lg&&t.kcal>tg.kcal*1.1,under=lg&&t.kcal<tg.kcal*0.85;return `<tr data-pro="pick" data-d="${x}" style="cursor:pointer"><td>${short(x)}</td><td class="r num ${over?"neg":under?"warnc":""}">${lg?nf(t.kcal):"—"}</td><td class="r num">${nf(tg.kcal)}</td><td class="r num">${lg?nf(t.p)+" g":"—"}</td><td class="r num">${exKcal(x)?nf(exKcal(x))+" kcal":"—"}</td></tr>`}).join("")}</tbody></table></div><p class="tiny muted" style="margin:6px 0 0">Toque em um dia para ver as refeições.</p></div>
    </div><div>
      ${proWeightCard()}
      <div class="card" style="margin-bottom:14px"><h2>Suplementos</h2>${sp.length?sp.map(x=>{const a7=spAdherence(x,proDays(7)),a30=spAdherence(x,proDays(30));return `<div class="kv"><span>${esc(spTitle(x))}<div class="tiny muted">${esc(spDoseLabel(x))}${x.verified?" · verificado":""}</div></span><span class="num small">${a7.pct!=null?nf(a7.pct*100)+"%":"—"} <span class="muted">7d</span> · ${a30.pct!=null?nf(a30.pct*100)+"%":"—"} <span class="muted">30d</span></span></div>`}).join(""):`<p class="small muted" style="margin:0">Nenhum suplemento cadastrado.</p>`}</div>
      ${proMeasuresCard(st)}${proPhotosCard(st)}
    </div></div>`;
  });
}
function proPersonalHTML(st,m){
  return proWith(st,()=>{
    const ks=Object.keys(S.days).filter(d=>proHasW(S.days[d])).sort().reverse();
    const pr={};ks.slice().reverse().forEach(d=>(S.days[d].workouts||[]).forEach(x=>{if(x.type!=="forca"||!x.name)return;(x.sets||[]).forEach(s=>{if(!(s.kg>0))return;const k=x.name.trim().toLowerCase();if(!pr[k]||s.kg>pr[k].kg||(s.kg===pr[k].kg&&(s.r||0)>(pr[k].r||0)))pr[k]={name:x.name.trim(),kg:s.kg,r:s.r,d}})}));
    const prs=Object.values(pr).sort((a,b)=>b.kg-a.kg).slice(0,12);
    const cname=x=>(CARDIO.find(c=>c[0]===x.ctype)||[,"Cardio"])[1];
    const tiles=proTiles([["Treinos",`${m.w7}`,"últimos 7 dias"],["Treinos",`${m.w30}`,"últimos 30 dias"],["Cardio",`${nf(m.km30,1)}`,"km em 30 dias"],["Peso",m.wNow!=null?`${nf(m.wNow,1)}`:"—",m.wDelta!=null?`${m.wDelta>0?"+":""}${nf(m.wDelta,1)} kg em 14 dias`:"kg (tendência)"]]);
    const list=ks.slice(0,15).map(d=>{const day=S.days[d];return `<div class="pro-w"><div class="row"><b>${esc(fmtDate(d,{weekday:"short",day:"numeric",month:"short"}))}</b>${day.wname?`<span class="small muted">· ${esc(day.wname)}</span>`:""}<span class="sp"></span>${day.wmin?`<span class="small muted num">${nf(day.wmin)} min de musculação</span>`:""}</div><ul class="items ro">${(day.workouts||[]).map(x=>x.type==="cardio"
      ?`<li><div class="nm">${esc(cname(x))}<div class="tiny muted">${[x.min?nf(x.min)+" min":"",x.km>0?nf(x.km,2)+" km":"",x.km>0&&x.min?"ritmo "+proPace(x.min,x.km):""].filter(Boolean).join(" · ")}</div></div><span class="num small">${nf(cardioKcal(x))} kcal</span></li>`
      :`<li><div class="nm">${esc(x.name||"Exercício")}<div class="tiny muted">${esc(setsTxt((x.sets||[]).filter(s=>s.r||s.kg)))||"sem séries preenchidas"}</div></div><span class="num small">${nf((x.sets||[]).reduce((a,s)=>a+(s.r||0)*(s.kg||0),0))} kg vol.</span></li>`).join("")}</ul></div>`}).join("");
    return `${tiles}<div class="grid g2"><div>
      <div class="card" style="margin-bottom:14px"><h2>Treinos recentes</h2>${list||`<p class="small muted" style="margin:0">Nenhum treino nos últimos 60 dias.</p>`}</div>
    </div><div>
      <div class="card" style="margin-bottom:14px"><h2>Recordes de carga (60 dias)</h2>${prs.length?prs.map(p=>`<div class="kv"><span>${esc(p.name)}<div class="tiny muted">${short(p.d)}</div></span><b class="num">${nf(p.kg,p.kg%1?1:0)} kg × ${p.r||"?"}</b></div>`).join(""):`<p class="small muted" style="margin:0">Sem cargas registradas.</p>`}</div>
      ${proWeightCard()}${proMeasuresCard(st)}${proPhotosCard(st)}
    </div></div>`;
  });
}
function proPace(min,km){const p=min/km;const mm=Math.floor(p),ss=Math.round((p-mm)*60);return `${mm}:${String(ss===60?0:ss).padStart(2,"0")}/km`}
function proWeightChart(st){
  if(typeof Chart==="undefined"||!$("#chPW"))return;
  const data=proWith(st,()=>{const days=proDays(60);const ser=weightSeries();const t={},w={};ser.forEach(x=>{t[x.d]=x.t;w[x.d]=x.w});return {days,t,w,goal:S.profile.goalWeight}});
  if(!Object.keys(data.w).length){$("#chPW").parentNode.innerHTML=`<p class="small muted" style="margin:0">Nenhuma pesagem nos últimos 60 dias.</p>`;return}
  chartDefaults();
  charts.pw=new Chart($("#chPW"),{type:"line",data:{labels:data.days.map(short),datasets:[{label:"Balança",data:data.days.map(d=>data.w[d]??null),showLine:false,pointRadius:3,pointBackgroundColor:css("--muted"),borderColor:css("--muted")},{label:"Tendência",data:data.days.map(d=>data.t[d]!=null?r1(data.t[d]):null),borderColor:cc("trend"),backgroundColor:cc("trend"),pointRadius:0,borderWidth:2.5,tension:.3,spanGaps:true},...(data.goal?[{label:"Meta",data:data.days.map(()=>data.goal),borderColor:cc("goal"),borderDash:[6,5],pointRadius:0,borderWidth:1.5}]:[])]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:7}},y:{ticks:{callback:v=>nf(v,1)}}}}});
}
async function proPhotos(st){
  const el=$("#pphotos");if(!el)return;
  const ph=[];Object.keys(st.days||{}).sort().reverse().forEach(d=>((st.days[d]||{}).photos||[]).forEach(p=>ph.push({d,...p})));
  const pick=ph.slice(0,8);if(!pick.length){el.innerHTML=`<div class="small muted">Nenhuma foto nos últimos 60 dias.</div>`;return}
  try{const {data}=await sb.storage.from("progress").createSignedUrls(pick.map(p=>p.path),3600);const u={};(data||[]).forEach(x=>{if(x.signedUrl)u[x.path]=x.signedUrl});
    if(!$("#pphotos"))return;el.innerHTML=pick.map(p=>u[p.path]?`<figure class="ph"><img src="${esc(u[p.path])}" alt="Foto ${esc(p.pose||"")} de ${esc(short(p.d))}" loading="lazy"><figcaption class="tiny muted">${esc(short(p.d))}${p.pose?" · "+esc(p.pose):""}</figcaption></figure>`:"").join("")||`<div class="small muted">Não consegui abrir as fotos.</div>`}
  catch(e){el.innerHTML=`<div class="small muted">Não consegui abrir as fotos.</div>`}
}

/* ---------- cartão do aluno (Perfil) ---------- */
function proStudentCardHTML(){
  return `<div class="card" style="margin-bottom:14px" id="procard"><h2>Nutricionista e personal</h2>
   <p class="small muted" style="margin-top:0">Vincule sua conta ao seu profissional com o código que ele te passar. Ele só consegue <b>ver</b> seus dados, nunca alterar, e você pode cancelar quando quiser. O nutricionista vê alimentação, peso, medidas e suplementos; o personal vê treinos, peso e medidas.</p>
   <div id="promine"><div class="small muted">Carregando…</div></div>
   <div id="profind" style="margin-top:10px"></div></div>`;
}
function proFindHTML(){
  if(PRO.found)return `<div class="pro-confirm"><div class="small muted">Vincular à</div><div style="font-size:17px;font-weight:700;margin:2px 0 10px">${esc(PRO_KIND[PRO.found.kind])} ${esc(PRO.found.name)}?</div>
    <label class="f">Seu nome (como o profissional vai ver)<input type="text" id="pro_sname" maxlength="80" value="${esc(PRO.sname||"")}" placeholder="ex: Renato Silva"></label>
    <label class="switch small" style="margin-top:8px"><input type="checkbox" id="pro_photos"> Compartilhar também minhas fotos de progresso</label>
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-pro="cancel">Cancelar</button><span class="sp"></span><button class="btn pri" data-pro="link">${ic("check",15)} Vincular</button></div></div>`;
  return `<div class="row" style="flex-wrap:nowrap"><input type="text" id="pro_code" inputmode="numeric" maxlength="6" placeholder="Código do profissional" value="${esc(PRO.pendingCode||"")}" style="max-width:220px"><button class="btn" data-pro="find">Buscar</button></div>${PRO.err?`<div class="small" style="color:var(--g);margin-top:6px">${esc(PRO.err)}</div>`:""}`;
}
async function proBindPerfil(){
  const fb=$("#profind");if(fb)fb.innerHTML=proFindHTML();
  const ci=$("#pro_code");if(ci)ci.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();proFind()}});
  const el=$("#promine");if(!el)return;
  try{const {data,error}=await sb.rpc("my_pros");if(error)throw error;PRO.mine=data||[]}catch(e){el.innerHTML=`<div class="small muted">Não consegui carregar seus vínculos.</div>`;return}
  if(!$("#promine"))return;
  $("#promine").innerHTML=PRO.mine.length?PRO.mine.map(x=>`<div class="pro-link"><div><b>${esc(x.name)}</b> <span class="tag">${esc(PRO_KIND[x.kind])}</span><div class="tiny muted">Vê seus dados como “${esc(x.student_name)}” desde ${esc(short(String(x.created_at).slice(0,10)))}</div>
     <label class="switch tiny" style="margin-top:6px"><input type="checkbox" data-pro="photos" data-email="${esc(x.pro_email)}" ${x.share_photos?"checked":""}> Compartilhar fotos de progresso</label></div>
     <button class="btn sm ghost" data-pro="unlink" data-email="${esc(x.pro_email)}" data-name="${esc(x.name)}">Cancelar vínculo</button></div>`).join(""):`<div class="small muted">Nenhum profissional vinculado.</div>`;
  if(PRO.pendingCode&&!PRO.found){const c=PRO.pendingCode;proFind(c)}
}
async function proFind(code){
  code=String(code||($("#pro_code")||{}).value||"").replace(/\D/g,"");PRO.err=null;
  if(code.length<4){PRO.err="Digite o código de 4 a 6 números.";$("#profind").innerHTML=proFindHTML();return}
  const {data,error}=await sb.rpc("pro_lookup",{p_code:code});
  PRO.pendingCode=code;
  if(error||!data||!data.length){PRO.found=null;PRO.err="Não encontrei nenhum profissional com esse código. Confira com ele.";}
  else{PRO.found=Object.assign({code},data[0]);PRO.pendingCode=null}
  if($("#profind")){$("#profind").innerHTML=proFindHTML();const n=$("#pro_sname");if(n&&!n.value)n.focus()}
}
async function proLink(){
  const nm=($("#pro_sname").value||"").trim();if(!nm){toast("Digite seu nome");$("#pro_sname").focus();return}
  const {error}=await sb.rpc("pro_link",{p_code:PRO.found.code,p_name:nm,p_photos:$("#pro_photos").checked});
  if(error){toast("Não consegui vincular. Tente de novo.");return}
  toast(`Vinculado a ${PRO.found.name}`);PRO.sname=nm;PRO.found=null;PRO.err=null;proBindPerfil();
}
function proOnboardField(){return `<label class="f" style="margin-top:12px">Código do seu nutricionista ou personal (opcional)<input type="text" id="ob_pcode" inputmode="numeric" maxlength="6" placeholder="ex: 5252"></label>`}

/* ---------- cadastro de profissionais (admin) ---------- */
function proAdminCardHTML(){
  return `<div class="card" style="margin-bottom:14px"><h2>Profissionais (admin)</h2><p class="small muted" style="margin-top:0">Cadastre nutricionistas e personal trainers. O e-mail entra na lista de acesso automaticamente. O profissional passa o código aos alunos.</p>
   <div id="proadm"><div class="small muted">Carregando…</div></div>
   <div class="form" style="margin-top:10px"><label class="f">Nome<input type="text" id="pa_name" maxlength="80" placeholder="ex: Ana Souza"></label><label class="f">E-mail<input type="text" id="pa_email" inputmode="email" placeholder="email@exemplo.com"></label>
    <label class="f">Tipo<select id="pa_kind"><option value="nutri">Nutricionista</option><option value="personal">Personal trainer</option></select></label><label class="f">Código (4 a 6 números)<input type="text" id="pa_code" inputmode="numeric" maxlength="6"></label></div>
   <div class="row" style="margin-top:10px"><span class="sp"></span><button class="btn pri" data-pro="admadd">${ic("plus",15)} Cadastrar profissional</button></div></div>`;
}
async function proAdminList(){
  const el=$("#proadm");if(!el)return;
  const {data,error}=await sb.from("professionals").select("*").order("created_at");
  if(error){el.innerHTML=`<div class="small muted">Não consegui carregar (a função de profissionais ainda não foi ativada no banco).</div>`;return}
  PRO.adm=data||[];
  const ci=$("#pa_code");if(ci&&!ci.value){let c;do{c=String(1000+Math.floor(Math.random()*9000))}while(PRO.adm.some(p=>p.code===c));ci.value=c}
  el.innerHTML=PRO.adm.length?PRO.adm.map(p=>`<div class="kv"><span><b>${esc(p.name)}</b> <span class="tag">${esc(PRO_KIND[p.kind])}</span> <span class="tag num">${esc(p.code)}</span>${p.active?"":' <span class="tag">pausado</span>'}<div class="tiny muted">${esc(p.email)}</div></span><span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm ghost" data-pro="admtoggle" data-email="${esc(p.email)}" data-on="${p.active?1:0}">${p.active?"Pausar":"Reativar"}</button><button class="iconbtn" data-pro="admdel" data-email="${esc(p.email)}" data-name="${esc(p.name)}" aria-label="Remover">${ic("x",16)}</button></span></div>`).join(""):`<div class="small muted">Nenhum profissional cadastrado.</div>`;
}
async function proAdminAdd(){
  const name=$("#pa_name").value.trim(),email=$("#pa_email").value.trim().toLowerCase(),kind=$("#pa_kind").value,code=$("#pa_code").value.replace(/\D/g,"");
  if(name.length<2){toast("Digite o nome");return}if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast("E-mail inválido");return}if(!/^\d{4,6}$/.test(code)){toast("O código precisa ter de 4 a 6 números");return}
  const al=await sb.from("allowed_emails").select("email").eq("email",email).maybeSingle();
  if(!al.data){const r=await sb.from("allowed_emails").insert({email,is_admin:false,note:`${PRO_KIND[kind]} ${name}`});if(r.error){toast("Não consegui liberar o e-mail");return}}
  const {error}=await sb.from("professionals").insert({email,kind,name,code});
  if(error){toast(/code|duplicate|unique/i.test(error.message||"")?"Esse código ou e-mail já está em uso":"Não consegui cadastrar");return}
  toast(`${name} cadastrado(a) — código ${code}`);["pa_name","pa_email","pa_code"].forEach(i=>$("#"+i).value="");proAdminList();if(typeof renderAccessList==="function")renderAccessList();
}

/* ---------- eventos ---------- */
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-pro]");if(!b||b.tagName==="INPUT")return;const a=b.dataset.pro;
  if(a==="day"){const n=+b.dataset.n;const nd=addDays(PRO.day,n);if(nd>TODAY())return;PRO.day=nd;const st=PRO.cache[PRO.sel+":60"];if(st){const y=window.scrollY;killCharts();drawAluno(PRO.sel,st);window.scrollTo(0,y)}}
  else if(a==="pick"){PRO.day=b.dataset.d;const st=PRO.cache[PRO.sel+":60"];if(st){killCharts();drawAluno(PRO.sel,st);window.scrollTo(0,0)}}
  else if(a==="find")proFind();
  else if(a==="cancel"){PRO.found=null;PRO.err=null;$("#profind").innerHTML=proFindHTML()}
  else if(a==="link")proLink();
  else if(a==="unlink"){if(!confirmBox(`Cancelar o vínculo com ${b.dataset.name}? Ele deixa de ver seus dados na hora.`))return;const {error}=await sb.from("pro_links").delete().eq("student_id",S.user.id).eq("pro_email",b.dataset.email);toast(error?"Não consegui cancelar":"Vínculo cancelado");proBindPerfil()}
  else if(a==="admadd")proAdminAdd();
  else if(a==="admtoggle"){const {error}=await sb.from("professionals").update({active:b.dataset.on!=="1"}).eq("email",b.dataset.email);if(error)toast("Não consegui alterar");proAdminList()}
  else if(a==="admdel"){if(!confirmBox(`Remover ${b.dataset.name}? Os vínculos com alunos são apagados (o e-mail continua na lista de acesso).`))return;const {error}=await sb.from("professionals").delete().eq("email",b.dataset.email);toast(error?"Não consegui remover":"Profissional removido");proAdminList()}
});
document.addEventListener("change",async e=>{
  const t=e.target;if(t.dataset&&t.dataset.pro==="photos"){const {error}=await sb.from("pro_links").update({share_photos:t.checked}).eq("student_id",S.user.id).eq("pro_email",t.dataset.email);toast(error?"Não consegui salvar":t.checked?"Fotos compartilhadas":"Fotos não são mais compartilhadas");if(error)t.checked=!t.checked}
});
/* confirmação simples sem diálogo nativo do navegador */
function confirmBox(msg){return window.__npConfirm?window.__npConfirm(msg):window.confirm(msg)}
