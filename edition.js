// =============================================================================
// edition.js — Édition d'un refuge (écrit directement dans Supabase, visible
// par tous les visiteurs — voir outils/schema-supabase.sql)
// =============================================================================

let lieuEnEdition = null;

function ouvrirEdition(i){
  lieuEnEdition=i;
  const r=REFUGES[i];
  document.getElementById('e-nom').value=r.nom||'';
  document.getElementById('e-alt').value=r.alt||'';
  document.getElementById('e-places').value=r.places||'';
  document.getElementById('e-type').value=r.cat||'cabane';
  document.getElementById('e-eau').value=fmtBool(r.eau)||'';
  document.getElementById('e-bois').value=fmtBool(r.bois)||'';
  document.getElementById('e-lat').value=r.lat;
  document.getElementById('e-lon').value=r.lon;
  document.getElementById('e-desc').value=r.desc||'';
  // boutons de mois
  const moisActifs=new Set(Array.isArray(r.eauMois)?r.eauMois:[]);
  const cont=document.getElementById('e-mois');
  cont.innerHTML=MOIS_LONG.map((nom,idx)=>
    `<button type="button" class="mois-btn ${moisActifs.has(idx)?'actif':''}" data-m="${idx}" onclick="this.classList.toggle('actif')">${nom.slice(0,4)}</button>`
  ).join('');
  document.getElementById('overlay').classList.add('ouvert');
}

function fermerEdition(){
  document.getElementById('overlay').classList.remove('ouvert');
  lieuEnEdition=null;
}

async function enregistrerEdition(){
  if(lieuEnEdition===null) return;
  const r=REFUGES[lieuEnEdition];
  const nlat=parseFloat(document.getElementById('e-lat').value);
  const nlon=parseFloat(document.getElementById('e-lon').value);

  r.nom=document.getElementById('e-nom').value.trim()||r.nom;
  r.alt=parseInt(document.getElementById('e-alt').value)||null;
  r.places=document.getElementById('e-places').value||null;
  r.cat=document.getElementById('e-type').value;
  r.eau=document.getElementById('e-eau').value||null;
  r.bois=document.getElementById('e-bois').value||null;
  // mois d'eau
  const moisChoisis=[...document.querySelectorAll('#e-mois .mois-btn.actif')].map(b=>+b.dataset.m).sort((a,b)=>a-b);
  r.eauMois=moisChoisis.length?moisChoisis:null;
  if(!isNaN(nlat)) r.lat=nlat;
  if(!isNaN(nlon)) r.lon=nlon;
  r.desc=document.getElementById('e-desc').value.trim();
  r.modifie=true;

  // écriture directe dans Supabase — visible par tous les visiteurs
  const { error } = await supabaseClient.from('refuges').update({
    nom:r.nom, altitude:r.alt, places:r.places, categorie:r.cat, eau:r.eau,
    bois:r.bois, eau_mois:r.eauMois, lat:r.lat, lon:r.lon, description:r.desc,
    modifie:true, maj_le:new Date().toISOString()
  }).eq('id', r.id);
  if(error){ alert("Impossible de sauvegarder sur le serveur : "+error.message); return; }

  // mise à jour du marqueur
  const idx=lieuEnEdition;
  const m=marqueurs[idx];
  m.setLatLng([r.lat,r.lon]);
  const el=document.createElement('div'); el.className='marqueur '+r.cat;
  m.setIcon(L.divIcon({html:el.outerHTML,className:'',iconSize:[16,16],iconAnchor:[8,8]}));

  fermerEdition();
  appliquer();
  afficherDetail(r);
  const elm=m.getElement();if(elm)elm.querySelector('.marqueur')?.classList.add('actif');
}

async function reinitialiserLieu(){
  if(lieuEnEdition===null) return;
  const r=REFUGES[lieuEnEdition];
  const { data, error } = await supabaseClient.from('refuges').select('origine').eq('id', r.id).single();
  if(error || !data?.origine){ alert("Impossible de retrouver les valeurs d'origine de ce lieu."); return; }
  const o=data.origine;
  const { error: errMaj } = await supabaseClient.from('refuges').update({
    nom:o.nom, altitude:o.altitude, places:o.places, categorie:o.categorie,
    eau:o.eau, bois:o.bois, eau_mois:null, lat:o.lat, lon:o.lon,
    description:o.description, modifie:false, maj_le:new Date().toISOString()
  }).eq('id', r.id);
  if(errMaj){ alert("Échec de la réinitialisation : "+errMaj.message); return; }
  alert("Lieu réinitialisé aux valeurs d'origine. Recharge la page pour voir le résultat.");
  fermerEdition();
}

