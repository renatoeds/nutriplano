"use strict";
/* Nutri Plano — camada de interface do redesign: tema claro/escuro/automático,
   ícones do menu, barra de navegação inferior no celular e menu "Mais".
   Não altera dados, cálculos nem autenticação; usa render()/showModal() do app.js. */
(function(){
  const LABEL={auto:"Tema automático (segue o sistema)",light:"Tema claro",dark:"Tema escuro"};
  const NEXT={auto:"light",light:"dark",dark:"auto"};
  const MORE0=[["coach","Ajuste da dieta"],["alimentos","Alimentos"],["calculadora","Calculadora"],["relatorio","Relatório"],["perfil","Perfil e metas"]];
  const moreList=()=>(typeof S!=="undefined"&&S.pro)?[["alunos","Meus alunos"],...MORE0]:MORE0;
  const mq=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):null;
  const getTheme=()=>{try{const t=localStorage.getItem("np-theme");return t==="light"||t==="dark"?t:"auto"}catch(e){return "auto"}};
  function applyTheme(t){
    const r=document.documentElement;
    if(t==="auto")r.removeAttribute("data-theme");else r.setAttribute("data-theme",t);
    const dark=t==="dark"||(t==="auto"&&mq&&mq.matches);
    const m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",dark?"#111821":"#06452F");
    const b=document.getElementById("themebtn");if(b){b.innerHTML=ic(t==="light"?"sun":t==="dark"?"moon":"auto");b.title=LABEL[t];b.setAttribute("aria-label",LABEL[t]+" — clique para trocar")}
  }
  const rerender=()=>{try{if(S&&S.user&&S.booted&&S.profile)render()}catch(e){}};
  function syncNav(){
    const v=(location.hash.slice(1)||"diario");
    document.querySelectorAll("#bnav [data-v]").forEach(a=>a.classList.toggle("on",a.dataset.v===v||(a.dataset.v==="mais"&&moreList().some(m=>m[0]===v.split("/")[0]))));
  }
  let syncVisibility=function(){
    const tb=document.getElementById("topbar"),tabs=document.getElementById("tabs");
    const inApp=tb&&tb.style.display!=="none"&&tabs&&tabs.style.visibility!=="hidden";
    document.body.classList.toggle("np-in",!!inApp);
  };
  function openMore(){
    showModal();
    document.getElementById("mbody").innerHTML=`<div class="mhead"><h3>Mais</h3><button class="iconbtn" data-act="close" aria-label="Fechar">${ic("x")}</button></div>
      <div class="morelist">${moreList().map(([v,l])=>`<a href="#${v}" data-ui="go">${ic(v)}<span>${l}</span>${ic("chevR")}</a>`).join("")}</div>
      <button class="btn ghost" data-ui="theme" style="margin-top:10px;width:100%;justify-content:center">${ic("auto")} Trocar tema</button>
      <button class="btn ghost more-out" data-act="logout" style="margin-top:8px;width:100%;justify-content:center">${ic("logout")} Sair da conta</button>`;
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-ui]");if(!b)return;const a=b.dataset.ui;
    if(a==="theme"){const t=NEXT[getTheme()];try{localStorage.setItem("np-theme",t)}catch(err){}applyTheme(t);toastSafe(LABEL[t]);rerender()}
    if(a==="more"){e.preventDefault();openMore()}
    if(a==="go"){closeModal()}
  });
  function toastSafe(m){try{toast(m,1600)}catch(e){}}
  if(mq&&mq.addEventListener)mq.addEventListener("change",()=>{if(getTheme()==="auto"){applyTheme("auto");rerender()}});
  window.addEventListener("hashchange",()=>{syncNav();syncVisibility()});
  // ícones do menu superior
  document.querySelectorAll("#tabs a[data-v]").forEach(a=>a.insertAdjacentHTML("afterbegin",ic(a.dataset.v)));
  document.querySelectorAll("#bnav [data-v]").forEach(a=>a.insertAdjacentHTML("afterbegin",ic(a.dataset.v)));
  const tb=document.getElementById("topbar"),tabs=document.getElementById("tabs");
  if(window.MutationObserver){const mo=new MutationObserver(()=>syncVisibility());tb&&mo.observe(tb,{attributes:true,attributeFilter:["style"]});tabs&&mo.observe(tabs,{attributes:true,attributeFilter:["style"]})}
  // banner do topo (conteúdo em banner.js)
  function renderPromo(){
    const el=document.getElementById("promo");if(!el)return;const B=window.NP_BANNER;
    let closed="";try{closed=localStorage.getItem("np-banner-closed")||""}catch(e){}
    const pg=(location.hash.slice(1)||"diario");const okPage=!B||!Array.isArray(B.paginas)||B.paginas.includes(pg);
    const show=B&&B.ativo&&B.titulo&&okPage&&!(B.fechavel&&closed===B.id)&&document.body.classList.contains("np-in");
    if(!show){el.hidden=true;el.innerHTML="";return}
    const ext=/^https?:\/\//.test(B.link||"");const e=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    el.innerHTML=`<div class="promo${B.imagem?" has-img":""}" role="region" aria-label="Destaque">
      <div class="promo-body">${B.selo?`<span class="promo-tag">${e(B.selo)}</span>`:""}<div class="promo-title">${e(B.titulo)}</div>${B.texto?`<div class="promo-text">${e(B.texto)}</div>`:""}</div>
      ${B.botao&&B.link?`<a class="promo-cta" href="${e(B.link)}"${ext?' target="_blank" rel="noopener"':""}>${e(B.botao)}${ic("chevR",16)}</a>`:""}
      ${B.imagem?`<img class="promo-img" src="${e(B.imagem)}" alt="">`:""}
      ${B.fechavel?`<button class="promo-x" data-ui="promo-x" aria-label="Fechar banner">${ic("x",16)}</button>`:""}</div>`;
    el.hidden=false;
  }
  document.addEventListener("click",e=>{if(e.target.closest('[data-ui="promo-x"]')){try{localStorage.setItem("np-banner-closed",(window.NP_BANNER||{}).id||"")}catch(err){}renderPromo()}});
  const _sv=syncVisibility;syncVisibility=function(){_sv();renderPromo()};
  // rótulos para o menu recolhido (só ícones)
  document.querySelectorAll("#tabs a[data-v]").forEach(a=>{a.title=a.textContent.trim();const t=a.childNodes[a.childNodes.length-1];if(t&&t.nodeType===3){const sp=document.createElement("span");sp.className="tab-lbl";sp.textContent=t.textContent;a.replaceChild(sp,t)}});
  (function(){const tabs=document.getElementById("tabs");if(!tabs||tabs.querySelector(".tab-out"))return;const b=document.createElement("button");b.type="button";b.className="tab-out";b.dataset.act="logout";b.title="Sair da conta";b.innerHTML=`${ic("logout")}<span class="tab-lbl">Sair</span>`;tabs.appendChild(b)})();
  applyTheme(getTheme());syncNav();syncVisibility();
})();
