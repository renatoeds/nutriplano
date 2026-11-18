"use strict";
/* Nutri Plano — camada de interface do redesign: tema claro/escuro/automático,
   ícones do menu, barra de navegação inferior no celular e menu "Mais".
   Não altera dados, cálculos nem autenticação; usa render()/showModal() do app.js. */
(function(){
  const LABEL={auto:"Tema automático (segue o sistema)",light:"Tema claro",dark:"Tema escuro"};
  const NEXT={auto:"light",light:"dark",dark:"auto"};
  const MORE=[["coach","Ajuste da dieta"],["alimentos","Alimentos"],["calculadora","Calculadora"],["relatorio","Relatório"],["perfil","Perfil e metas"]];
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
    document.querySelectorAll("#bnav [data-v]").forEach(a=>a.classList.toggle("on",a.dataset.v===v||(a.dataset.v==="mais"&&MORE.some(m=>m[0]===v))));
  }
  function syncVisibility(){
    const tb=document.getElementById("topbar"),tabs=document.getElementById("tabs");
    const inApp=tb&&tb.style.display!=="none"&&tabs&&tabs.style.visibility!=="hidden";
    document.body.classList.toggle("np-in",!!inApp);
  }
  function openMore(){
    showModal();
    document.getElementById("mbody").innerHTML=`<div class="mhead"><h3>Mais</h3><button class="iconbtn" data-act="close" aria-label="Fechar">${ic("x")}</button></div>
      <div class="morelist">${MORE.map(([v,l])=>`<a href="#${v}" data-ui="go">${ic(v)}<span>${l}</span>${ic("chevR")}</a>`).join("")}</div>
      <button class="btn ghost" data-ui="theme" style="margin-top:10px;width:100%;justify-content:center">${ic("auto")} Trocar tema</button>`;
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-ui]");if(!b)return;const a=b.dataset.ui;
    if(a==="theme"){const t=NEXT[getTheme()];try{localStorage.setItem("np-theme",t)}catch(err){}applyTheme(t);toastSafe(LABEL[t]);rerender()}
    if(a==="more"){e.preventDefault();openMore()}
    if(a==="go"){closeModal()}
  });
  function toastSafe(m){try{toast(m,1600)}catch(e){}}
  if(mq&&mq.addEventListener)mq.addEventListener("change",()=>{if(getTheme()==="auto"){applyTheme("auto");rerender()}});
  window.addEventListener("hashchange",syncNav);
  // ícones do menu superior
  document.querySelectorAll("#tabs a[data-v]").forEach(a=>a.insertAdjacentHTML("afterbegin",ic(a.dataset.v)));
  document.querySelectorAll("#bnav [data-v]").forEach(a=>a.insertAdjacentHTML("afterbegin",ic(a.dataset.v)));
  const tb=document.getElementById("topbar"),tabs=document.getElementById("tabs");
  if(window.MutationObserver){const mo=new MutationObserver(syncVisibility);tb&&mo.observe(tb,{attributes:true,attributeFilter:["style"]});tabs&&mo.observe(tabs,{attributes:true,attributeFilter:["style"]})}
  applyTheme(getTheme());syncNav();syncVisibility();
})();
