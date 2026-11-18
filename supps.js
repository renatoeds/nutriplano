"use strict";
/* Nutri Plano — suplementação: rotina por horário e dias, ligação com alimento
   (lança na refeição ao marcar), estoque do pote, constância e sugestão de proteína.
   Os dados ficam no perfil (profile.supps) e nos dias (day.supps), como já era. */
const SP_TIMES=[["manha","Manhã"],["pre","Pré-treino"],["pos","Pós-treino"],["tarde","Tarde"],["noite","Noite"],["qualquer","Qualquer horário"]];
const SP_UNITS=["g","mg","mcg","UI","cápsula","comprimido","softgel","gotas","ml","dose","scoop","sachê"];
/* catálogo: [nome, unidade sugerida] — a dose fica a cargo do rótulo / orientação profissional */
const SP_CATALOG=[
 ["Vitaminas",[["Multivitamínico","comprimido"],["Vitamina A","UI"],["Complexo B","cápsula"],["Vitamina B1 (tiamina)","mg"],["Vitamina B2 (riboflavina)","mg"],["Vitamina B3 (niacina)","mg"],["Vitamina B5 (ácido pantotênico)","mg"],["Vitamina B6","mg"],["Biotina (B7)","mcg"],["Ácido fólico / metilfolato (B9)","mcg"],["Vitamina B12 (metilcobalamina)","mcg"],["Vitamina C","mg"],["Vitamina D3","UI"],["Vitamina D3 + K2","gotas"],["Vitamina E","UI"],["Vitamina K2 (MK-7)","mcg"]]],
 ["Minerais",[["Cálcio","mg"],["Ferro","mg"],["Magnésio (dimalato/glicinato)","mg"],["Zinco","mg"],["Selênio","mcg"],["Iodo","mcg"],["Potássio","mg"],["Cromo","mcg"],["Eletrólitos","sachê"]]],
 ["Performance",[["Creatina","g"],["Whey protein","scoop"],["Proteína vegetal","scoop"],["Caseína","scoop"],["Cafeína","mg"],["Beta-alanina","g"],["BCAA","g"],["Glutamina","g"],["L-carnitina","g"],["Citrulina","g"],["Pré-treino","dose"],["Termogênico","cápsula"],["Hipercalórico","scoop"],["Maltodextrina","g"]]],
 ["Outros",[["Ômega 3","softgel"],["Colágeno","g"],["Coenzima Q10","mg"],["Melatonina","mg"],["Probiótico","cápsula"],["Ashwagandha","mg"],["Spirulina","comprimido"],["Cúrcuma","cápsula"],["Fibras (psyllium)","g"]]]
];
const SP_BRANDS=["Growth","Max Titanium","Integralmédica","Darkness","Dux","Probiótica","Black Skull","Optimum Nutrition","Nutrify","Essential Nutrition","Vitafor","Puravida","Atlhetica Nutrition","New Millen","Absolut Nutrition","Soldiers Nutrition","Ocean Drop","True Source","Rituária","EMS","Cimed","Lavitan","Eurofarma","Medley","Neo Química","Sundown","Centrum","Supradyn","Redoxon","Nature's Bounty","Now Foods","Solgar","Catarinense Pharma","Equaliv","Vitgold","Sanavita","Herbalife","Farmácia de manipulação"].sort((a,b)=>a.localeCompare(b,"pt-BR"));
const SP_DEFAULT_MEAL={manha:"cafe",pre:"lanche2",pos:"lanche2",tarde:"lanche2",noite:"ceia",qualquer:"lanche1"};
const SP_SUGGEST_OLD=["Creatina","Whey protein","Multivitamínico","Ômega 3","Vitamina D","Cafeína","Magnésio","Colágeno","Glutamina","Pré-treino","Vitamina C","Zinco","Melatonina"];
function spList(){return ((S.profile&&S.profile.supps)||[]).map(spNorm)}
function spNorm(sp){
  const o=Object.assign({time:"qualquer",days:"todos",fid:null,n:1,u:"g",amount:null,unit:"g",meal:null,pot:null,refill:null},sp);
  if(o.amount==null&&!o.fid&&o.dose){const m=/^\s*([\d.,]+)\s*(.*)$/.exec(o.dose);if(m){o.amount=numv(m[1]);o.unit=(m[2]||"g").trim()||"g"}}
  return o;
}
function spFood(sp){return sp.fid?foodById(sp.fid):null}
function spBrand(sp){if(sp.brand)return sp.brand;const f=spFood(sp);if(f&&f.name.includes(" — "))return f.name.split(" — ")[0];return ""}
function spTitle(sp){const b=spBrand(sp);return b?`${sp.name} · ${b}`:sp.name}
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
     return `<button class="supp-chip ${on?"on":""} ${off?"off":""}" data-sp="toggle" data-id="${esc(sp.id)}" aria-pressed="${on}"><span class="supp-ck">${on?ic("check",14):""}</span><span class="supp-tx"><b>${esc(sp.name)}</b><span>${spBrand(sp)?esc(spBrand(sp))+" · ":""}${esc(spDoseLabel(sp))}${it?` · ${nf(it.kcal)} kcal`:""}${sp.days==="treino"?" · dia de treino":""}</span></span></button>`}).join("")}</div>`).join("")}</div>
   ${tip?`<div class="supp-tip">${ic("sparkles",15)} <span>${tip}</span></div>`:""}</div>`;
}
/* ---------- Perfil (lista) ---------- */
function suppEditorHTML(){
  const list=spList();
  return `<div class="card" style="margin-bottom:14px"><div class="row"><h2 style="margin:0">Minha suplementação</h2><span class="sp"></span><button class="btn sm pri" data-sp="new">${ic("plus",15)} Adicionar</button></div>
   <p class="small muted" style="margin:6px 0 4px">Aparece no Diário agrupada por horário. Ligue a um alimento (ex.: o seu whey) para as calorias entrarem sozinhas.</p>
   ${list.length?list.map(sp=>{const st=spStock(sp);const f=spFood(sp);return `<div class="kv supp-row" data-sp="edit" data-id="${esc(sp.id)}" role="button" tabindex="0"><span><b>${esc(sp.name)}</b>${spBrand(sp)?` <span class="tag">${esc(spBrand(sp))}</span>`:""}${sp.verified?` <span class="tag tag-ok">${ic("shieldok",12)} verificado</span>`:""} <span class="small muted">· ${esc(spDoseLabel(sp))} · ${(SP_TIMES.find(t=>t[0]===sp.time)||[,""])[1]}${sp.days==="treino"?" · só treino":""}${f?" · lança em "+esc(mealName(sp.meal||SP_DEFAULT_MEAL[sp.time])):""}</span>${st?`<br><span class="tiny ${st.days!=null&&st.days<=10?"up":"muted"}">Estoque: ${nf(st.left,st.left%1?1:0)} ${esc(st.unit)} (~${st.doses} doses${st.days!=null?`, ${st.days} dias`:""})</span>`:""}</span><span class="row" style="gap:4px;flex:none"><button class="iconbtn" data-sp="verify" data-id="${esc(sp.id)}" title="Verificar produto" aria-label="Verificar ${esc(sp.name)}">${ic(sp.verified?"shieldok":"shield",17)}</button><span class="muted">${ic("chevR",16)}</span></span></div>`}).join(""):`<div class="empty" style="padding-left:0">Nenhum suplemento cadastrado.</div>`}</div>`;
}
/* ---------- Progresso (constância) ---------- */
function suppProgressHTML(days){
  const list=spList();if(!list.length)return "";
  return `<div class="card" style="margin-bottom:14px"><h2>Constância da suplementação</h2><div class="supp-prog">${list.map(sp=>{const a=spAdherence(sp,days);const st=spStock(sp);const pct=a.pct==null?null:Math.round(a.pct*100);
    return `<div class="supp-pr"><div class="row" style="gap:8px"><b>${esc(spTitle(sp))}</b><span class="sp"></span><span class="num small">${a.tk}/${a.app} dias${pct!=null?` · <b>${pct}%</b>`:""}</span></div><div class="bar" style="margin-top:6px"><i style="width:${pct||0}%;background:${pct>=80?"var(--chart-trend,var(--accent))":pct>=50?"var(--c)":"var(--g)"}"></i></div>${st?`<div class="tiny muted" style="margin-top:4px">Estoque: ${nf(st.left,st.left%1?1:0)} ${esc(st.unit)}${st.days!=null?` · ~${st.days} dias`:""}</div>`:""}</div>`}).join("")}</div>
   <p class="tiny muted" style="margin-bottom:0">Conta os dias em que o suplemento valia (todos os dias, ou só os de treino) desde que foi cadastrado.</p></div>`;
}
/* ---------- verificação do produto ---------- */
const SPV={};
function spQ(t){return encodeURIComponent(t)}
function spVerifyOpen(fromForm,id){
  let sp;
  if(fromForm){spReadForm();sp=SPF}else{sp=spList().find(x=>x.id===id);if(!sp)return;Object.assign(SPF,clone(sp))}
  SPV.fromForm=fromForm;SPV.ai=null;showModal();spVerifyRender();
}
function spVerifyRender(){
  const sp=SPF;const brand=sp.brand||spBrand(sp)||"";const prod=(sp.name||"").replace(/\s*\(.*?\)\s*/g," ").trim();const term=[brand,prod].filter(Boolean).join(" ");
  const G=q=>`https://www.google.com/search?q=${spQ(q)}`;
  const links=[
    ["Consulta oficial da Anvisa","https://consultas.anvisa.gov.br/","Abra “Alimentos” e busque pelo nome, empresa ou nº de notificação. O produto deve aparecer como ativo."],
    ["Alertas, proibições e recolhimentos",G(`${term} Anvisa resolução proíbe OR apreensão OR recolhimento`),"Notícias e resoluções da Anvisa sobre a marca ou o produto."],
    ["Laudos de laboratório",G(`${term} laudo análise laboratório teor`),"Testes independentes (ex.: de associações). Veja a data e o lote — resultados já foram contestados por fabricantes."],
    ["Reputação da empresa",G(`reclame aqui ${brand||prod}`),"Reclamações de clientes no Reclame Aqui (abra o perfil oficial da empresa)."],
    ["Certificações internacionais",G(`${term} "Informed Sport" OR "NSF Certified" OR "USP Verified"`),"Selos de terceira parte (comuns em importados)."]
  ];
  const v=sp.verified;
  $("#mbody").innerHTML=`<div class="mhead">${SPV.fromForm?`<button class="iconbtn" data-sp="verify-back" aria-label="Voltar">${ic("chevL")}</button>`:""}<h3>${ic("shield")} Verificar produto</h3><button class="iconbtn" data-act="close" aria-label="Fechar">${ic("x")}</button></div>
  <div class="vf-head"><b>${esc(sp.name||"Suplemento")}</b>${brand?` <span class="tag">${esc(brand)}</span>`:""}${v?` <span class="tag tag-ok">${ic("shieldok",12)} conferido em ${short(v)}</span>`:""}</div>
  <p class="small muted" style="margin:6px 0 12px">O Nutri Plano não avalia marcas: ele junta as fontes certas para você conferir. Em caso de dúvida, fale com seu nutricionista, médico ou farmacêutico.</p>
  <h4 class="vf-h">No rótulo, confira</h4>
  <ul class="vf-list"><li>A expressão <b>“SUPLEMENTO ALIMENTAR”</b> com a forma (cápsula, pó, líquido…).</li><li><b>Fabricante</b> identificado, com CNPJ e endereço.</li><li>Lote, validade e tabela nutricional legíveis.</li><li>Nada de promessa de cura, tratamento ou emagrecimento rápido — suplemento não é medicamento.</li><li>Preço muito abaixo do normal e vendedor desconhecido são sinais de alerta.</li></ul>
  <h4 class="vf-h">Consultar fontes</h4>
  <div class="vf-links">${links.map(([t,u,d])=>`<a class="vf-link" href="${esc(u)}" target="_blank" rel="noopener"><span><b>${t}</b><span>${d}</span></span>${ic("ext",16)}</a>`).join("")}</div>
  ${S.ai?`<div class="vf-ai"><button class="btn sm" data-sp="verify-ai">${ic("sparkles",15)} Pesquisar na internet com IA</button><div id="vf-ai-out">${SPV.ai||""}</div></div>`:""}
  <h4 class="vf-h">O que você conferiu</h4>
  <div class="form"><label class="f">Nº de notificação/registro na Anvisa<input type="text" id="vf_anvisa" value="${esc(sp.anvisa||"")}" placeholder="como aparece no rótulo ou na consulta"></label>
  <label class="switch small" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="vf_ok" ${v?"checked":""}> Conferi: está regular e confio no produto</label></div>
  <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn pri" data-sp="verify-save">${ic("check",15)} ${SPV.fromForm?"Voltar ao cadastro":"Salvar"}</button></div>`;
}
async function spVerifyAI(){
  const out=$("#vf-ai-out");out.innerHTML=`<p class="small muted">Pesquisando fontes públicas…</p>`;
  try{const r=await aiCall({action:"verify",product:SPF.name||"",brand:SPF.brand||spBrand(SPF)||""});
    const src=(r.sources||[]).filter(x=>x&&/^https?:\/\//i.test(String(x.url||""))).slice(0,8);
    SPV.ai=`<div class="aiout" style="margin-top:8px">${mdLite(r.text||"")}</div>${src.length?`<div class="tiny muted" style="margin-top:6px">Fontes:</div><ul class="vf-src">${src.map(x=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title||x.url)}</a></li>`).join("")}</ul>`:""}<p class="tiny muted">Resumo automático de fontes públicas — pode conter erros. Confira os links.</p>`;
    out.innerHTML=SPV.ai;
  }catch(e){out.innerHTML=`<p class="small" style="color:var(--g)">${e.code==="not_configured"?"A IA ainda não foi ativada.":"Não consegui pesquisar agora. Use os links acima."}</p>`}
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
   <label class="f" style="grid-column:1/-1">Escolher da lista<select id="spf_cat"><option value="">— vitaminas, minerais, performance… —</option>${SP_CATALOG.map(([g,items])=>`<optgroup label="${g}">${items.map(([n,u])=>`<option value="${esc(n)}" data-u="${u}" ${n===SPF.name?"selected":""}>${esc(n)}</option>`).join("")}</optgroup>`).join("")}</select></label>
   <label class="f">Nome<input type="text" id="spf_name" list="spf_sug" value="${esc(SPF.name)}" placeholder="ou digite, ex: Vitamina B12"></label>
   <datalist id="spf_sug">${SP_CATALOG.flatMap(g=>g[1]).map(x=>`<option value="${esc(x[0])}">`).join("")}</datalist>
   <label class="f">Marca (opcional)<input type="text" id="spf_brand" list="spf_brands" value="${esc(SPF.brand||"")}" placeholder="ex: Sundown, Growth, manipulado"></label>
   <datalist id="spf_brands">${SP_BRANDS.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>
   <div style="grid-column:1/-1"><button class="btn sm ${SPF.verified?"":"ghost"}" data-sp="verify-form" type="button">${ic(SPF.verified?"shieldok":"shield",15)} ${SPF.verified?"Verificado — ver detalhes":"Verificar produto (Anvisa, laudos, reclamações)"}</button></div>
   <details class="f spf-link" style="grid-column:1/-1" ${f?"open":""}><summary class="small">Ligar a um alimento do banco <span class="muted" style="font-weight:500">— opcional, para whey, barra, hipercalórico…</span></summary><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
    ${f?`<div class="supp-link">${ic("check",15)} <span><b>${esc(f.name)}</b><br><span class="tiny muted">${nf(f.kcal)} kcal · P ${nf(f.p,1)} g por 100 g</span></span><button class="btn sm ghost" data-sp="unlink">Desligar</button></div>`
      :`<input type="search" id="spf_q" placeholder="Buscar — ex: whey growth, max titanium, creatina" autocomplete="off"><div id="spf_res" class="flist"></div>`}
    <span class="hint tiny muted">Ligado, ao marcar no Diário as calorias e macros entram na refeição escolhida.</span></div></details>
   ${f?`<label class="f">Dose<input type="number" id="spf_n" step="any" min="0" value="${SPF.n||1}"></label><label class="f">Medida<select id="spf_u">${units.map(x=>`<option value="${x[0]}" ${x[0]===SPF.u?"selected":""}>${esc(x[2])}</option>`).join("")}</select></label>
      <label class="f">Lançar na refeição<select id="spf_meal">${MEALS.map(([k,n])=>`<option value="${k}" ${(SPF.meal||SP_DEFAULT_MEAL[SPF.time])===k?"selected":""}>${n}</option>`).join("")}</select></label>`
     :`<label class="f">Dose<input type="number" id="spf_amt" step="any" min="0" value="${SPF.amount??""}" placeholder="ex: 5"></label><label class="f">Unidade<select id="spf_unit">${SP_UNITS.map(x=>`<option ${x===(SPF.unit||"g")?"selected":""}>${x}</option>`).join("")}</select></label>`}
   <label class="f">Horário<select id="spf_time">${SP_TIMES.map(([k,l])=>`<option value="${k}" ${SPF.time===k?"selected":""}>${l}</option>`).join("")}</select></label>
   <label class="f">Quando<select id="spf_days"><option value="todos" ${SPF.days!=="treino"?"selected":""}>Todos os dias</option><option value="treino" ${SPF.days==="treino"?"selected":""}>Só em dia de treino</option></select></label>
   <label class="f">Tamanho do pote (${f?"g":"na mesma unidade"})<input type="number" id="spf_pot" step="any" min="0" value="${SPF.pot??""}" placeholder="ex: ${f?"900":"300"}"><span class="hint">Opcional — para o aviso de estoque</span></label>
   <label class="f">Comprei em<input type="date" id="spf_refill" value="${SPF.refill||TODAY()}"></label>
  </div>
  <div class="row" style="margin-top:16px">${SPF.id?`<button class="btn danger" data-sp="del">Remover</button>`:""}<span class="sp"></span><button class="btn pri" data-sp="save">${ic("check",15)} Salvar</button></div>`;
  const q=$("#spf_q");if(q){const draw=()=>{const r=q.value.trim()?searchFoods(q.value,6):[];$("#spf_res").innerHTML=r.map(x=>foodRow(x,"x").replace('data-act="x"','data-sp="link"')).join("")};q.addEventListener("input",draw);draw()}
  const cat=$("#spf_cat");cat.addEventListener("change",()=>{const o=cat.selectedOptions[0];if(!o||!o.value)return;$("#spf_name").value=o.value;const u=$("#spf_unit");if(u&&o.dataset.u){u.value=o.dataset.u}const a=$("#spf_amt");if(a)a.focus()});
  const tm=$("#spf_time");tm.addEventListener("change",()=>{SPF.time=tm.value;const m=$("#spf_meal");if(m&&!SPF.meal)m.value=SP_DEFAULT_MEAL[SPF.time]});
}
function spReadForm(){
  SPF.name=$("#spf_name").value.trim();SPF.brand=($("#spf_brand")||{}).value?$("#spf_brand").value.trim():"";SPF.time=$("#spf_time").value;SPF.days=$("#spf_days").value;SPF.pot=numv($("#spf_pot").value);SPF.refill=$("#spf_refill").value||TODAY();
  if(SPF.fid){SPF.n=numv($("#spf_n").value)||1;SPF.u=$("#spf_u").value;SPF.meal=$("#spf_meal").value}else{SPF.amount=numv($("#spf_amt").value);SPF.unit=$("#spf_unit").value}
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-sp]");if(!b)return;const a=b.dataset.sp;
  if(a==="toggle"){spToggle(S.date,b.dataset.id);return}
  if(a==="verify"){e.stopPropagation();spVerifyOpen(false,b.dataset.id);return}
  if(a==="verify-form"){spVerifyOpen(true);return}
  if(a==="verify-ai"){spVerifyAI();return}
  if(a==="verify-back"){SPF.anvisa=$("#vf_anvisa").value.trim();SPF.verified=$("#vf_ok").checked?(SPF.verified||TODAY()):null;spRender();return}
  if(a==="verify-save"){SPF.anvisa=$("#vf_anvisa").value.trim();SPF.verified=$("#vf_ok").checked?(SPF.verified||TODAY()):null;
    if(SPV.fromForm){spRender();return}
    const arr=S.profile.supps||[];const i=arr.findIndex(x=>x.id===SPF.id);if(i>=0){arr[i].anvisa=SPF.anvisa;arr[i].verified=SPF.verified;saveProfile()}closeModal();render();toast(SPF.verified?"Produto marcado como verificado":"Verificação salva");return}
  if(a==="new"){spOpen(null);return}
  if(a==="edit"){spOpen(b.dataset.id);return}
  if(a==="manage"){location.hash="#perfil";return}
  if(a==="refill"){const sp=(S.profile.supps||[]).find(x=>x.id===b.dataset.id);if(sp){sp.refill=TODAY();saveProfile();toast("Estoque renovado");render()}return}
  if(a==="link"){spReadForm();const f=foodById(b.dataset.fid);if(f){SPF.fid=f.id;SPF.u=unitsFor(f).length>1?"p0":"g";SPF.n=1;if(!SPF.name)SPF.name=f.name.split(" — ").pop();if(!SPF.brand&&f.name.includes(" — "))SPF.brand=f.name.split(" — ")[0]}spRender();return}
  if(a==="unlink"){spReadForm();SPF.fid=null;spRender();return}
  if(a==="del"){if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="Confirmar remoção";return}S.profile.supps=(S.profile.supps||[]).filter(x=>x.id!==SPF.id);saveProfile();closeModal();render();toast("Suplemento removido");return}
  if(a==="save"){spReadForm();if(!SPF.name){toast("Informe o nome");return}
    const o={id:SPF.id||uid(),name:SPF.name,brand:SPF.brand||"",anvisa:SPF.anvisa||"",verified:SPF.verified||null,time:SPF.time,days:SPF.days,fid:SPF.fid||null,n:SPF.n,u:SPF.u,meal:SPF.fid?SPF.meal:null,amount:SPF.fid?null:SPF.amount,unit:SPF.fid?null:SPF.unit,pot:SPF.pot||null,refill:SPF.refill,created:(spList().find(x=>x.id===SPF.id)||{}).created||TODAY()};
    o.dose=spDoseLabel(o);
    const arr=S.profile.supps||[];const i=arr.findIndex(x=>x.id===o.id);if(i>=0)arr[i]=o;else arr.push(o);S.profile.supps=arr;saveProfile();closeModal();render();toast("Suplemento salvo");return}
});
document.addEventListener("keydown",e=>{if(e.key==="Enter"){const r=e.target.closest&&e.target.closest('[data-sp="edit"]');if(r)spOpen(r.dataset.id)}});
