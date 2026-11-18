"use strict";
/* Nutri Plano — suplementação: rotina por horário e dias, ligação com alimento
   (lança na refeição ao marcar), estoque do pote, constância e sugestão de proteína.
   Os dados ficam no perfil (profile.supps) e nos dias (day.supps), como já era. */
const SP_TIMES=[["manha","Manhã"],["pre","Pré-treino"],["pos","Pós-treino"],["tarde","Tarde"],["noite","Noite"],["qualquer","Qualquer horário"]];
const SP_UNITS=["g","mg","cápsula","comprimido","ml","gotas","dose","scoop"];
const SP_DEFAULT_MEAL={manha:"cafe",pre:"lanche2",pos:"lanche2",tarde:"lanche2",noite:"ceia",qualquer:"lanche1"};
const SP_SUGGEST=["Creatina","Whey protein","Multivitamínico","Ômega 3","Vitamina D","Cafeína","Magnésio","Colágeno","Glutamina","Pré-treino","Vitamina C","Zinco","Melatonina"];
function spList(){return ((S.profile&&S.profile.supps)||[]).map(spNorm)}
function spNorm(sp){
  const o=Object.assign({time:"qualquer",days:"todos",fid:null,n:1,u:"g",amount:null,unit:"g",meal:null,pot:null,refill:null},sp);
  if(o.amount==null&&!o.fid&&o.dose){const m=/^\s*([\d.,]+)\s*(.*)$/.exec(o.dose);if(m){o.amount=numv(m[1]);o.unit=(m[2]||"g").trim()||"g"}}
  return o;
}
function spFood(sp){return sp.fid?foodById(sp.fid):null}
function spItem(sp){const f=spFood(sp);return f?calcItem(f,sp.n||1,sp.u||"g"):null}
function spDoseQty(sp){const it=spItem(sp);if(it)return it.q;return sp.amount||0}
function spStockUnit(sp){return sp.fid?"g":(sp.unit||"g")}
function spDoseLabel(sp){const it=spItem(sp);if(it){if(it.u==="g")return `${nf(it.q)} g`;const n=it.n||1;const lbl=n===1?it.ul:`${nf(n,n%1?1:0)}× ${it.ul}`;return /\d\s*g\)?$/.test(it.ul)&&n===1?lbl:`${lbl} · ${nf(it.q)} g`}if(sp.amount)return `${nf(sp.amount,sp.amount%1?1:0)} ${sp.unit||""}`.trim();return sp.dose||""}
function spTaken(d,id){const day=S.days[d];return !!(day&&day.supps&&day.supps[id])}
function spApplies(sp,d){return sp.days!=="treino"||isTrainDay(d)||spTaken(d,sp.id)}
function spStock(sp){
  if(!(sp.pot>0))return null;const dose=spDoseQty(sp);if(!(dose>0))return null;
  const since=sp.refill||"0000-00-00";let n=0;Object.keys(S.days).forEach(d=>{if(d>=since&&spTaken(d,sp.id))n++});
  const left=Math.max(0,sp.pot-dose*n);const td=(S.profile.cycle&&S.profile.cycle.trainDays)||4;
  const perDay=dose*(sp.days==="treino"?td/7:1);const days=perDay>0?Math.floor(left/perDay):null;
  return {left,doses:Math.floor(left/dose),days,unit:spStockUnit(sp)};
}
function spAdherence(sp,days){
  let app=0,tk=0;let first=null;Object.keys(S.days).forEach(d=>{if(spTaken(d,sp.id)&&(!first||d<first))first=d});const c=sp.created||TODAY();const start=first&&first<c?first:c;
  days.forEach(d=>{if(d<start)return;if(spTaken(d,sp.id)){tk++;app++}else if(d<TODAY()&&sp.days!=="treino")app++;else if(d<TODAY()&&sp.days==="treino"&&isTrainDay(d))app++});
  return {tk,app,pct:app?tk/app:null};
}
function spToggle(d,id){
  const day=getDay(d,true);day.supps=day.supps||{};const sp=spList().find(x=>x.id===id);const now=!day.supps[id];
  day.supps[id]=now;if(!now)delete day.supps[id];
  MEALS.forEach(([k])=>{day.meals[k]=(day.meals[k]||[]).filter(i=>i.sid!==id)});
  if(now&&sp){const it=spItem(sp);if(it){it.sid=id;const meal=sp.meal||SP_DEFAULT_MEAL[sp.time]||"lanche1";day.meals[meal].push(it)}}
  saveDay(d);
  if(now&&sp){const st=spStock(sp);toast(st&&st.days!=null&&st.days<=10?`${sp.name} marcado · acaba em ~${st.days} dia(s)`:`${sp.name} marcado${spItem(sp)?" · lançado em "+mealName(sp.meal||SP_DEFAULT_MEAL[sp.time]):""}`)}
  render();
}
/* ---------- Diário ---------- */
function suppCardHTML(d){
  const list=spList();
  if(!list.length)return `<div class="card supp-card"><div class="row"><h2 style="margin:0">${ic("pill")} Suplementação</h2><span class="sp"></span><button class="btn sm pri" data-sp="new">${ic("plus",15)} Montar minha rotina</button></div><p class="small muted" style="margin:8px 0 0">Cadastre creatina, whey, vitaminas… com horário e dose. Marque aqui todo dia e acompanhe estoque e constância.</p></div>`;
  const alerts=list.map(sp=>({sp,st:spStock(sp)})).filter(x=>x.st&&x.st.days!=null&&x.st.days<=10);
  const groups=SP_TIMES.map(([t,l])=>[l,list.filter(sp=>sp.time===t)]).filter(g=>g[1].length);
  const done=list.filter(sp=>spTaken(d,sp.id)).length,due=list.filter(sp=>spApplies(sp,d)).length;
  let tip="";
  if(d===TODAY()){const tot=dayTotals(d),tg=dayTarget(d);const gap=tg.p-tot.p;
    if(gap>=10){const wheys=list.filter(sp=>{const it=spItem(sp);return it&&it.p>=10&&!spTaken(d,sp.id)});
      if(wheys.length){const it=spItem(wheys[0]);const k=gap/it.p;tip=k<=3?`Faltam <b>${nf(gap)} g</b> de proteína hoje ≈ <b>${nf(Math.round(k*2)/2,1)} dose${k>=1.25?"s":""}</b> do ${esc(wheys[0].name)} (${nf(it.p,0)} g por dose).`:`Faltam <b>${nf(gap)} g</b> de proteína hoje. Uma dose do ${esc(wheys[0].name)} cobre ${nf(it.p,0)} g — o restante vale buscar nas refeições (carnes, ovos, laticínios).`}
      else tip=`Faltam <b>${nf(gap)} g</b> de proteína hoje — boas fontes: frango, carne, peixe, ovos, iogurte, queijo ou feijão.`}}
  return `<div class="card supp-card"><div class="row"><h2 style="margin:0">${ic("pill")} Suplementação de hoje</h2><span class="tag">${done}/${due}</span><span class="sp"></span><button class="btn sm ghost" data-sp="manage">${ic("pencil",14)} Configurar</button></div>
   ${alerts.map(a=>`<div class="supp-alert">${ic("zap",15)} <span><b>${esc(a.sp.name)}</b> acaba em ~${a.st.days} dia(s) — restam ${nf(a.st.left,a.st.left%1?1:0)} ${esc(a.st.unit)}.</span><button class="btn sm" data-sp="refill" data-id="${esc(a.sp.id)}">Comprei novo</button></div>`).join("")}
   <div class="supp-groups">${groups.map(([l,items])=>`<div class="supp-group"><div class="supp-gl">${l}</div>${items.map(sp=>{const on=spTaken(d,sp.id);const it=spItem(sp);const off=!spApplies(sp,d);
     return `<button class="supp-chip ${on?"on":""} ${off?"off":""}" data-sp="toggle" data-id="${esc(sp.id)}" aria-pressed="${on}"><span class="supp-ck">${on?ic("check",14):""}</span><span class="supp-tx"><b>${esc(sp.name)}</b><span>${esc(spDoseLabel(sp))}${it?` · ${nf(it.kcal)} kcal`:""}${sp.days==="treino"?" · dia de treino":""}</span></span></button>`}).join("")}</div>`).join("")}</div>
   ${tip?`<div class="supp-tip">${ic("sparkles",15)} <span>${tip}</span></div>`:""}</div>`;
}
/* ---------- Perfil (lista) ---------- */
function suppEditorHTML(){
  const list=spList();
  return `<div class="card" style="margin-bottom:14px"><div class="row"><h2 style="margin:0">Minha suplementação</h2><span class="sp"></span><button class="btn sm pri" data-sp="new">${ic("plus",15)} Adicionar</button></div>
   <p class="small muted" style="margin:6px 0 4px">Aparece no Diário agrupada por horário. Ligue a um alimento (ex.: o seu whey) para as calorias entrarem sozinhas.</p>
   ${list.length?list.map(sp=>{const st=spStock(sp);const f=spFood(sp);return `<div class="kv supp-row" data-sp="edit" data-id="${esc(sp.id)}" role="button" tabindex="0"><span><b>${esc(sp.name)}</b> <span class="small muted">· ${esc(spDoseLabel(sp))} · ${(SP_TIMES.find(t=>t[0]===sp.time)||[,""])[1]}${sp.days==="treino"?" · só treino":""}${f?" · lança em "+esc(mealName(sp.meal||SP_DEFAULT_MEAL[sp.time])):""}</span>${st?`<br><span class="tiny ${st.days!=null&&st.days<=10?"up":"muted"}">Estoque: ${nf(st.left,st.left%1?1:0)} ${esc(st.unit)} (~${st.doses} doses${st.days!=null?`, ${st.days} dias`:""})</span>`:""}</span><span class="muted">${ic("chevR",16)}</span></div>`}).join(""):`<div class="empty" style="padding-left:0">Nenhum suplemento cadastrado.</div>`}</div>`;
}
/* ---------- Progresso (constância) ---------- */
function suppProgressHTML(days){
  const list=spList();if(!list.length)return "";
  return `<div class="card" style="margin-bottom:14px"><h2>Constância da suplementação</h2><div class="supp-prog">${list.map(sp=>{const a=spAdherence(sp,days);const st=spStock(sp);const pct=a.pct==null?null:Math.round(a.pct*100);
    return `<div class="supp-pr"><div class="row" style="gap:8px"><b>${esc(sp.name)}</b><span class="sp"></span><span class="num small">${a.tk}/${a.app} dias${pct!=null?` · <b>${pct}%</b>`:""}</span></div><div class="bar" style="margin-top:6px"><i style="width:${pct||0}%;background:${pct>=80?"var(--chart-trend,var(--accent))":pct>=50?"var(--c)":"var(--g)"}"></i></div>${st?`<div class="tiny muted" style="margin-top:4px">Estoque: ${nf(st.left,st.left%1?1:0)} ${esc(st.unit)}${st.days!=null?` · ~${st.days} dias`:""}</div>`:""}</div>`}).join("")}</div>
   <p class="tiny muted" style="margin-bottom:0">Conta os dias em que o suplemento valia (todos os dias, ou só os de treino) desde que foi cadastrado.</p></div>`;
}
/* ---------- formulário ---------- */
const SPF={};
function spOpen(id){
  const sp=id?spList().find(x=>x.id===id):null;
  Object.assign(SPF,sp?clone(sp):{id:null,name:"",time:"manha",days:"todos",fid:null,n:1,u:"g",amount:null,unit:"g",meal:null,pot:null,refill:TODAY()});
  showModal();spRender();
}
function spRender(){
  const f=SPF.fid?foodById(SPF.fid):null;const units=f?unitsFor(f):null;
  $("#mbody").innerHTML=`<div class="mhead"><h3>${ic("pill")} ${SPF.id?"Editar suplemento":"Novo suplemento"}</h3><button class="iconbtn" data-act="close" aria-label="Fechar">${ic("x")}</button></div>
  <div class="form">
   <label class="f" style="grid-column:1/-1">Nome<input type="text" id="spf_name" list="spf_sug" value="${esc(SPF.name)}" placeholder="ex: Creatina, Whey, Ômega 3"></label>
   <datalist id="spf_sug">${SP_SUGGEST.map(x=>`<option value="${x}">`).join("")}</datalist>
   <div class="f" style="grid-column:1/-1"><span class="small" style="font-weight:600;color:var(--muted)">Ligar a um alimento do banco (opcional)</span>
    ${f?`<div class="supp-link">${ic("check",15)} <span><b>${esc(f.name)}</b><br><span class="tiny muted">${nf(f.kcal)} kcal · P ${nf(f.p,1)} g por 100 g</span></span><button class="btn sm ghost" data-sp="unlink">Desligar</button></div>`
      :`<input type="search" id="spf_q" placeholder="Buscar — ex: whey growth, max titanium, creatina" autocomplete="off"><div id="spf_res" class="flist"></div>`}
    <span class="hint tiny muted">Ligado, ao marcar no Diário as calorias e macros entram na refeição escolhida.</span></div>
   ${f?`<label class="f">Dose<input type="number" id="spf_n" step="any" min="0" value="${SPF.n||1}"></label><label class="f">Medida<select id="spf_u">${units.map(x=>`<option value="${x[0]}" ${x[0]===SPF.u?"selected":""}>${esc(x[2])}</option>`).join("")}</select></label>
      <label class="f">Lançar na refeição<select id="spf_meal">${MEALS.map(([k,n])=>`<option value="${k}" ${(SPF.meal||SP_DEFAULT_MEAL[SPF.time])===k?"selected":""}>${n}</option>`).join("")}</select></label>`
     :`<label class="f">Dose<input type="number" id="spf_amt" step="any" min="0" value="${SPF.amount??""}" placeholder="ex: 5"></label><label class="f">Unidade<select id="spf_unit">${SP_UNITS.map(x=>`<option ${x===(SPF.unit||"g")?"selected":""}>${x}</option>`).join("")}</select></label>`}
   <label class="f">Horário<select id="spf_time">${SP_TIMES.map(([k,l])=>`<option value="${k}" ${SPF.time===k?"selected":""}>${l}</option>`).join("")}</select></label>
   <label class="f">Quando<select id="spf_days"><option value="todos" ${SPF.days!=="treino"?"selected":""}>Todos os dias</option><option value="treino" ${SPF.days==="treino"?"selected":""}>Só em dia de treino</option></select></label>
   <label class="f">Tamanho do pote (${f?"g":"na mesma unidade"})<input type="number" id="spf_pot" step="any" min="0" value="${SPF.pot??""}" placeholder="ex: ${f?"900":"300"}"><span class="hint">Opcional — para o aviso de estoque</span></label>
   <label class="f">Comprei em<input type="date" id="spf_refill" value="${SPF.refill||TODAY()}"></label>
  </div>
  <div class="row" style="margin-top:16px">${SPF.id?`<button class="btn danger" data-sp="del">Remover</button>`:""}<span class="sp"></span><button class="btn pri" data-sp="save">${ic("check",15)} Salvar</button></div>`;
  const q=$("#spf_q");if(q){const draw=()=>{const r=searchFoods(q.value||"suplementos",8);$("#spf_res").innerHTML=r.map(x=>foodRow(x,"x").replace('data-act="x"','data-sp="link"')).join("")};q.addEventListener("input",draw);draw()}
  const tm=$("#spf_time");tm.addEventListener("change",()=>{SPF.time=tm.value;const m=$("#spf_meal");if(m&&!SPF.meal)m.value=SP_DEFAULT_MEAL[SPF.time]});
}
function spReadForm(){
  SPF.name=$("#spf_name").value.trim();SPF.time=$("#spf_time").value;SPF.days=$("#spf_days").value;SPF.pot=numv($("#spf_pot").value);SPF.refill=$("#spf_refill").value||TODAY();
  if(SPF.fid){SPF.n=numv($("#spf_n").value)||1;SPF.u=$("#spf_u").value;SPF.meal=$("#spf_meal").value}else{SPF.amount=numv($("#spf_amt").value);SPF.unit=$("#spf_unit").value}
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-sp]");if(!b)return;const a=b.dataset.sp;
  if(a==="toggle"){spToggle(S.date,b.dataset.id);return}
  if(a==="new"){spOpen(null);return}
  if(a==="edit"){spOpen(b.dataset.id);return}
  if(a==="manage"){location.hash="#perfil";return}
  if(a==="refill"){const sp=(S.profile.supps||[]).find(x=>x.id===b.dataset.id);if(sp){sp.refill=TODAY();saveProfile();toast("Estoque renovado");render()}return}
  if(a==="link"){spReadForm();const f=foodById(b.dataset.fid);if(f){SPF.fid=f.id;SPF.u=unitsFor(f).length>1?"p0":"g";SPF.n=1;if(!SPF.name)SPF.name=f.name.split(" — ").pop()}spRender();return}
  if(a==="unlink"){spReadForm();SPF.fid=null;spRender();return}
  if(a==="del"){if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="Confirmar remoção";return}S.profile.supps=(S.profile.supps||[]).filter(x=>x.id!==SPF.id);saveProfile();closeModal();render();toast("Suplemento removido");return}
  if(a==="save"){spReadForm();if(!SPF.name){toast("Informe o nome");return}
    const o={id:SPF.id||uid(),name:SPF.name,time:SPF.time,days:SPF.days,fid:SPF.fid||null,n:SPF.n,u:SPF.u,meal:SPF.fid?SPF.meal:null,amount:SPF.fid?null:SPF.amount,unit:SPF.fid?null:SPF.unit,pot:SPF.pot||null,refill:SPF.refill,created:(spList().find(x=>x.id===SPF.id)||{}).created||TODAY()};
    o.dose=spDoseLabel(o);
    const arr=S.profile.supps||[];const i=arr.findIndex(x=>x.id===o.id);if(i>=0)arr[i]=o;else arr.push(o);S.profile.supps=arr;saveProfile();closeModal();render();toast("Suplemento salvo");return}
});
document.addEventListener("keydown",e=>{if(e.key==="Enter"){const r=e.target.closest&&e.target.closest('[data-sp="edit"]');if(r)spOpen(r.dataset.id)}});
