// =============================================================================
// passages.js — Historique des passages
// =============================================================================

function chargerPassages(){
  try{ return JSON.parse(localStorage.getItem(CLE_PASSAGES)||'{}'); }catch(e){ return {}; }
}

function sauverPassages(p){
  try{ localStorage.setItem(CLE_PASSAGES,JSON.stringify(p)); }catch(e){ alert("Sauvegarde impossible (stockage indisponible)."); }
}

function passagesDe(cle){
  const tout=chargerPassages();
  return (tout[cle]||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
}

function estVisite(r){ return passagesDe(r._cle).length>0; }

function ajouterPassage(i){
  const r=REFUGES[i];
  const date=document.getElementById('hist-date').value;
  const com=document.getElementById('hist-com').value.trim();
  const balises=[...document.querySelectorAll('#hist-balises .balise-btn.actif')].map(b=>b.dataset.bal);
  if(!date){ alert("Choisis une date."); return; }
  if(!com && balises.length===0){ alert("Ajoute au moins une balise ou un commentaire."); return; }
  const tout=chargerPassages();
  if(!tout[r._cle]) tout[r._cle]=[];
  tout[r._cle].push({date,com,balises,id:Date.now()});
  sauverPassages(tout);
  document.getElementById('hist-com').value='';
  document.querySelectorAll('#hist-balises .balise-btn.actif').forEach(b=>b.classList.remove('actif'));
  rendrePassages(i);
  rafraichirMarqueur(i);
  appliquer();
}

function supprimerPassage(i,id){
  const r=REFUGES[i];
  const tout=chargerPassages();
  if(tout[r._cle]){ tout[r._cle]=tout[r._cle].filter(p=>p.id!==id); sauverPassages(tout); }
  rendrePassages(i);
  rafraichirMarqueur(i);
  appliquer();
}

function rendrePassages(i){
  const r=REFUGES[i];
  const liste=document.getElementById('hist-liste');
  if(!liste) return;
  const passages=passagesDe(r._cle);
  if(passages.length===0){
    liste.innerHTML='<div class="hist-vide">Aucun passage enregistré pour l\'instant.</div>';
    return;
  }
  // résumé : compte des balises sur tous les passages
  const compte={};
  passages.forEach(p=>(p.balises||[]).forEach(b=>{ compte[b]=(compte[b]||0)+1; }));
  const ordre=Object.keys(compte).sort((a,b)=>compte[b]-compte[a]);
  let resume='';
  if(ordre.length){
    resume='<div class="balises-resume">'+ordre.map(id=>{
      const info=BALISE_INFO[id]; if(!info) return '';
      return `<span class="balise-stat${info.alerte?' alerte':''}"><span class="n">${compte[id]}</span> ${info.txt}</span>`;
    }).join('')+'</div>';
  }

  liste.innerHTML=resume+passages.map(p=>{
    const bal=(p.balises||[]).map(id=>{
      const info=BALISE_INFO[id]; if(!info) return '';
      return `<span class="hist-balise${info.alerte?' alerte':''}">${info.txt}</span>`;
    }).join('');
    return `
    <div class="hist-item">
      <button class="hist-suppr" onclick="supprimerPassage(${i},${p.id})" title="Supprimer">&times;</button>
      <div class="hist-item-date">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${fmtDate(p.date)}
      </div>
      ${bal?`<div class="hist-balises">${bal}</div>`:''}
      ${p.com?`<div class="hist-item-com">${p.com.replace(/</g,'&lt;')}</div>`:(bal?'':'<div class="hist-item-com" style="color:var(--texte-3);font-style:italic">Sans commentaire</div>')}
    </div>`;
  }).join('');
}

