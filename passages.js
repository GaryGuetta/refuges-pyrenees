// =============================================================================
// passages.js — Historique des passages (partagé via Supabase — table
// `passages`, voir outils/schema-supabase.sql). PASSAGES est un cache local
// {refuge_id: [{id,date,com,balises}, ...]} rechargé au démarrage, pour que
// l'affichage (listes, marqueurs) reste synchrone comme avant.
// =============================================================================

let PASSAGES = {};

async function chargerPassagesDepuisSupabase(){
  try{
    const TAILLE_PAGE=1000;
    let debut=0, data=[];
    while(true){
      const { data:page, error } = await supabaseClient.from('passages').select('*').range(debut,debut+TAILLE_PAGE-1);
      if(error) throw error;
      data=data.concat(page);
      if(page.length<TAILLE_PAGE) break;
      debut+=TAILLE_PAGE;
    }
    PASSAGES = {};
    (data||[]).forEach(p=>{
      if(!PASSAGES[p.refuge_id]) PASSAGES[p.refuge_id]=[];
      PASSAGES[p.refuge_id].push({ id:p.id, date:p.date, com:p.commentaire||'', balises:p.balises||[], user_id:p.user_id });
    });
  }catch(e){
    console.warn('Chargement des passages échoué:',e);
    PASSAGES = {};
  }
}

function passagesDe(refugeId){
  return (PASSAGES[refugeId]||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
}

// "Visité" = visité par MOI (le compte connecté), pas par n'importe qui.
function mesPassagesDe(refugeId){
  if(!estConnecte()) return [];
  return passagesDe(refugeId).filter(p=>p.user_id===currentUser.id);
}

function estVisite(r){ return mesPassagesDe(r.id).length>0; }

async function ajouterPassage(i){
  if(!estConnecte()){ alert("Connecte-toi d'abord pour ajouter un passage (bouton profil en haut à droite)."); return; }
  const r=REFUGES[i];
  const date=document.getElementById('hist-date').value;
  const com=document.getElementById('hist-com').value.trim();
  const balises=[...document.querySelectorAll('#hist-balises .balise-btn.actif')].map(b=>b.dataset.bal);
  if(!date){ alert("Choisis une date."); return; }
  if(!com && balises.length===0){ alert("Ajoute au moins une balise ou un commentaire."); return; }

  const { data, error } = await supabaseClient.from('passages')
    .insert({ refuge_id:r.id, date, commentaire:com||null, balises:balises.length?balises:null, user_id:currentUser.id })
    .select().single();
  if(error){ alert("Impossible d'enregistrer ce passage sur le serveur : "+error.message); return; }

  if(!PASSAGES[r.id]) PASSAGES[r.id]=[];
  PASSAGES[r.id].push({ id:data.id, date:data.date, com:data.commentaire||'', balises:data.balises||[], user_id:data.user_id });

  document.getElementById('hist-com').value='';
  document.querySelectorAll('#hist-balises .balise-btn.actif').forEach(b=>b.classList.remove('actif'));
  rendrePassages(i);
  rafraichirMarqueur(i);
  appliquer();
}

async function supprimerPassage(i,id){
  if(!confirm("Supprimer ce passage ?")) return;
  const r=REFUGES[i];
  const { error } = await supabaseClient.from('passages').delete().eq('id', id);
  if(error){ alert("Impossible de supprimer ce passage : "+error.message); return; }
  if(PASSAGES[r.id]){ PASSAGES[r.id]=PASSAGES[r.id].filter(p=>p.id!==id); }
  rendrePassages(i);
  rafraichirMarqueur(i);
  appliquer();
}

function rendrePassages(i){
  const r=REFUGES[i];
  const liste=document.getElementById('hist-liste');
  if(!liste) return;
  const passages=passagesDe(r.id);
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
    const mien = estConnecte() && p.user_id===currentUser.id;
    return `
    <div class="hist-item">
      ${mien ? `<button class="hist-suppr" onclick="supprimerPassage(${i},${p.id})" title="Supprimer">&times;</button>` : ''}
      <div class="hist-item-date">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${fmtDate(p.date)}
      </div>
      ${bal?`<div class="hist-balises">${bal}</div>`:''}
      ${p.com?`<div class="hist-item-com">${p.com.replace(/</g,'&lt;')}</div>`:(bal?'':'<div class="hist-item-com" style="color:var(--txt3);font-style:italic">Sans commentaire</div>')}
    </div>`;
  }).join('');
}


