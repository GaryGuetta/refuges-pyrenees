// =============================================================================
// refuges.js — Chargement et état des refuges
// =============================================================================

// Variables d'état déclarées dans carte.js
// 'liste' accédé dynamiquement

function fmtBool(v){
  if(v===null||v===undefined||v==='') return null;
  const s=v.toString().toLowerCase();
  if(['oui','yes','1','true','vrai','o'].includes(s)) return 'Oui';
  if(['non','no','0','false','faux','n'].includes(s)) return 'Non';
  return v.toString();
}

function rendreListe(items){
  if(items.length===0){document.getElementById('liste').innerHTML='<div class="etat">Aucun lieu ne correspond.</div>';return}
  const max=400; // limite l'affichage liste pour la perf
  const tronque=items.length>max;
  document.getElementById('liste').innerHTML=items.slice(0,max).map(({r,i,d},pos)=>{
    const dist = (triParDistance && maPosition && d!=null) ? (d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km') : (r.alt?r.alt+' m':'');
    const visite = estVisite(r) ? '<span class="cr-visite" title="Déjà visité">✓</span>' : '';
    // cascade d'apparition uniquement sur les 15 premières cartes
    const anim = pos<15 ? ` style="animation:apparait .45s ease both;animation-delay:${(pos*35)}ms"` : '';
    return `
    <div class="carte-refuge${estVisite(r)?' visite':''}" data-i="${i}" onclick="selectionner(${i},true)"${anim}>
      <div class="cr-haut"><div class="cr-nom">${visite}${r.nom}</div><div class="cr-alt">${dist}</div></div>
      <div class="cr-meta"><span class="tag ${r.cat}">${tagTxt(r.cat)}</span><span class="cr-region">${r.departement||r.region}</span></div>
    </div>`;
  }).join('') + (tronque?`<div class="etat" style="padding:20px">+ ${items.length-max} autres lieux sur la carte</div>`:'');
}

function selectionner(i,recadrer){
  document.querySelectorAll('.carte-refuge').forEach(c=>c.classList.toggle('active',+c.dataset.i===i));
  const r=REFUGES[i];
  if(recadrer){
    // garde le zoom actuel si on est déjà assez proche, sinon zoome à 13
    const zoomActuel=map.getZoom();
    const zoomCible=Math.max(zoomActuel,13);
    map.flyTo([r.lat,r.lon],zoomCible,{duration:.8});
    // n'ouvre le cluster que si le marqueur est encore regroupé
    setTimeout(()=>{
      if(marqueurs[i] && cluster.hasLayer(marqueurs[i])) cluster.zoomToShowLayer(marqueurs[i],()=>{});
    },850);
  }
  // surbrillance du marqueur
  if(actif!==null&&marqueurs[actif]){const e=marqueurs[actif].getElement();if(e)e.querySelector('.marqueur')?.classList.remove('actif')}
  const el=marqueurs[i].getElement();if(el)el.querySelector('.marqueur')?.classList.add('actif');

  if(typeof fermerFiche==='function') fermerFiche();
  document.querySelector('.app').classList.add('detail-ouvert');
  afficherDetail(r);
  setTimeout(()=>map.invalidateSize(),320);

  const c=document.querySelector(`.carte-refuge[data-i="${i}"]`);if(c)c.scrollIntoView({behavior:'smooth',block:'nearest'});
  actif=i;
}

function fermerDetail(){
  document.querySelector('.app').classList.remove('detail-ouvert');
  document.getElementById('detail-contenu').style.display='none';
  document.getElementById('detail-vide').style.display='flex';
  document.querySelectorAll('.carte-refuge').forEach(c=>c.classList.remove('active'));
  if(actif!==null&&marqueurs[actif]){const e=marqueurs[actif].getElement();if(e)e.querySelector('.marqueur')?.classList.remove('actif')}
  actif=null;
  setTimeout(()=>map.invalidateSize(),320);
}

function appliquer(){
  let items=REFUGES.map((r,i)=>({r,i}));
  if(filtre!=='tous')items=items.filter(({r})=>r.cat===filtre);
  if(recherche){
    const q=normRech(recherche);
    items=items.filter(({r})=>
      normRech(r.nom).includes(q)
      || normRech(r.region).includes(q)
      || normRech(r.departement).includes(q)
      || normRech(r.ville).includes(q)
    );
  }
  // La liste ne montre que ce qui est actuellement visible sur la carte —
  // se met à jour au zoom/déplacement. Sauf en recherche active : là on
  // cherche partout dans la zone, pas seulement à l'écran.
  if(!recherche && typeof map!=='undefined' && map){
    const bornes=map.getBounds();
    items=items.filter(({r})=>bornes.contains([r.lat,r.lon]));
  }
  if(triParDistance && maPosition){
    items.forEach(o=>o.d=distM(maPosition.lat,maPosition.lon,o.r.lat,o.r.lon));
    items.sort((a,b)=>a.d-b.d);
  }else{
    items.sort((a,b)=>(b.r.alt||0)-(a.r.alt||0));
  }
  rendreListe(items);
}

// Déduit le département pyrénéen à partir des coordonnées (zones approximatives)
function departementDe(lat, lon){
  if(lon < 0.15) return "Pyrénées-Atlantiques";
  if(lon < 0.90) return "Hautes-Pyrénées";
  if(lon < 1.45) return "Haute-Garonne";
  if(lat > 42.72 && lon < 1.75) return "Ariège";
  if(lon < 1.95) return "Ariège";
  if(lat < 42.60 && lon >= 1.40 && lon <= 1.80) return "Andorre";
  return "Pyrénées-Orientales";
}

async function charger(){
  const progres=document.getElementById('progres');
  progres.textContent='chargement…';
  await initAuth();

  let refugesData=[];
  try{
    // Table Supabase `refuges` — voir outils/schema-supabase.sql et
    // outils/importer-supabase.mjs pour la mise en place / le remplissage.
    // Supabase limite chaque requête à 1000 lignes par défaut : on pagine
    // pour être sûr de récupérer TOUS les lieux, même au-delà de 1000.
    const TAILLE_PAGE=1000;
    let debut=0, data=[];
    while(true){
      const { data:page, error } = await supabaseClient.from('refuges').select('*').range(debut,debut+TAILLE_PAGE-1);
      if(error) throw error;
      data=data.concat(page);
      if(page.length<TAILLE_PAGE) break;
      debut+=TAILLE_PAGE;
    }
    progres.textContent=`${data.length} lieux`;
    refugesData=(data||[]).map(r=>({
      id:r.id,
      nom:r.nom,
      lat:r.lat, lon:r.lon,
      alt:r.altitude,
      region:r.region,
      departement: r.departement || (['Andorre','Aragon','Catalonia','Navarre'].includes(r.region) ? r.region : departementDe(r.lat,r.lon)),
      eau:r.eau, bois:r.bois, eauMois:r.eau_mois,
      typeNum:r.type_num,
      cat:r.categorie,
      desc:r.description,
      lien:r.lien,
      modifie:r.modifie,
      ville:r.ville, capEte:r.cap_ete, capHiver:r.cap_hiver, cheminee:r.cheminee, couchage:r.couchage, rando:r.rando
    })).filter(r=>r.lat&&r.lon);
  }catch(e){
    console.warn('Chargement Supabase échoué:',e);
  }

  REFUGES=refugesData;
  REFUGES.forEach((r,i)=>{
    r._i=i;
    r._cle=`${r.nom}|${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
  });
  await chargerPassagesDepuisSupabase();
  if(REFUGES.length===0){
    document.getElementById('liste').innerHTML=`<div class="etat">Impossible de charger les données.<br><br>Vérifie que <code>SUPABASE_URL</code> / <code>SUPABASE_ANON_KEY</code> sont bien renseignées dans <code>config.js</code>, et que la table <code>refuges</code> contient des données (voir <code>outils/importer-supabase.mjs</code>).</div>`;
    return;
  }
  initialiser();

  // Arrivée depuis une page refuge/xxx.html partagée (?refuge=id) : ouvre
  // directement la fiche du bon lieu, plutôt que la vue générale.
  const idDepuisURL = new URLSearchParams(location.search).get('refuge');
  if(idDepuisURL){
    const i = REFUGES.findIndex(r=>r.id===idDepuisURL);
    if(i!==-1) setTimeout(()=>selectionner(i,true), 300);
  }
}

