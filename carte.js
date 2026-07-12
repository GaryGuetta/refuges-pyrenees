// =============================================================================
// carte.js — Carte Leaflet, fonds, cluster, marqueurs, clic eau
// =============================================================================

let map, fonds, cluster;
const ORDRE_FONDS = ['sombre','topo'];
let fondActuel = 'sombre';

let REFUGES = [], marqueurs = [], actif = null;
let filtre = 'tous', recherche = '', triParDistance = false;

function categorie(t){
  t=+t;
  if(t===5||t===6) return 'refuge';
  if(t===2||t===3) return 'libre';
  if(t===1||t===4) return 'cabane';
  if(t===7) return 'ruine';
  return 'cabane';
}
function tagTxt(cat){
  return {refuge:'Refuge gardé',libre:'Cabane ouverte',cabane:'Cabane / abri',ruine:'Ruine'}[cat];
}
function lireCoord(g){
  if(g?.type==='Point') return {lon:g.coordinates[0],lat:g.coordinates[1],alt:g.coordinates[2]};
  return null;
}
function appliquerFond(cle){
  map.removeLayer(fonds[fondActuel].couche);
  const f=fonds[cle];
  f.couche.addTo(map);
  fondActuel=cle;
  document.body.classList.toggle('mode-topo',f.clair);
  document.getElementById('lbl-fond').textContent=f.nom;
}
function basculerFond(){
  const i=ORDRE_FONDS.indexOf(fondActuel);
  appliquerFond(ORDRE_FONDS[(i+1)%ORDRE_FONDS.length]);
}
function iconeRefuge(r){
  const el=document.createElement('div');
  el.className='marqueur '+r.cat+(estVisite(r)?' visite':'');
  return L.divIcon({html:el.outerHTML,className:'',iconSize:[16,16],iconAnchor:[8,8]});
}
function initialiser(){
  REFUGES.forEach((r,i)=>{
    const m=L.marker([r.lat,r.lon],{icon:iconeRefuge(r)});
    m.on('click',()=>selectionner(i,true));
    m._refIndex=i;
    marqueurs[i]=m;
    // On n'ajoute PAS tous les marqueurs d'un coup (1600+ = carte qui rame).
    // L'affichage est piloté par la zone active (voir zones.js) : seuls les
    // marqueurs de la zone sélectionnée sont posés sur la carte.
  });
  document.getElementById('s-total').textContent=REFUGES.length;
  majMarqueursVisibles();
  appliquer();
  if(typeof initZoneParDefaut==='function') initZoneParDefaut();
}

// Ajoute au cluster uniquement les marqueurs de la zone active.
function majMarqueursVisibles(){
  if(!cluster) return;
  cluster.clearLayers();
  const zone = (typeof zoneActive!=='undefined') ? zoneActive : null;
  if(!zone) return;
  const aAfficher = [];
  REFUGES.forEach((r,i)=>{
    if(typeof zoneDe==='function' && zoneDe(r)===zone) aAfficher.push(marqueurs[i]);
  });
  cluster.addLayers(aAfficher);
}
function rafraichirMarqueur(i){
  const r=REFUGES[i],m=marqueurs[i];
  if(m) m.setIcon(iconeRefuge(r));
}
function rafraichirTousLesMarqueurs(){
  REFUGES.forEach((r,i)=>rafraichirMarqueur(i));
}

// Clic carte → eau la plus proche
let marqueurClic=null;
async function onClickCarte(e){
  const {lat,lng}=e.latlng;
  if(typeof modeAjout!=='undefined' && modeAjout){
    demarrerAjoutRefuge(lat,lng);
    return;
  }
  if(marqueurClic){map.removeLayer(marqueurClic);marqueurClic=null;}
  const el=document.createElement('div');
  el.className='marqueur-clic';
  el.innerHTML='<span class="eau-osm-spin"></span>';
  marqueurClic=L.marker([lat,lng],{
    icon:L.divIcon({html:el.outerHTML,className:'',iconSize:[24,24],iconAnchor:[12,12]}),
    zIndexOffset:2000
  }).addTo(map);
  const fakeR={lat,lon:lng,_cle:`clic|${lat.toFixed(5)},${lng.toFixed(5)}`};
  let res;
  try{res=await chercherEauOSM(fakeR);}catch(e){res={erreur:true,points:[]};}
  if(!marqueurClic) return;
  let html='<div class="pop-clic">';
  if(res.erreur||!res.points.length){
    html+=`<div class="pop-clic-vide">Aucun point d'eau trouvé dans un rayon de ${RAYON_EAU} m.</div>`;
  }else{
    const pts=res.points.slice().sort((a,b)=>{
      if(Math.abs(a.dist-b.dist)<100) return scoreEau(a.type)-scoreEau(b.type);
      return a.dist-b.dist;
    });
    const principal=pts[0];
    const autres=pts.slice(1,3);
    const src=principal.src?`<span class="eau-src-tag">${principal.src}</span>`:'';
    const saison=principal.saisonnier?'<span class="eau-saison">saisonnier</span>':'';
    const titre=principal.nom||principal.type;
    html+=`<div class="pop-clic-titre">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M12 2.5S5 10 5 14a7 7 0 0 0 14 0c0-4-7-11.5-7-11.5Z"/></svg>
      Eau la plus proche
    </div>
    <div class="pop-clic-principal">
      <div class="pop-clic-type">${titre}</div>
      <div class="pop-clic-dist">à ${fmtDist(principal.dist)}</div>
    </div>
    <div class="pop-clic-badges">${saison}${src}</div>`;
    if(autres.length){
      html+='<div class="pop-clic-autres">'+autres.map(p=>{
        const t=p.nom||p.type;
        const b=(p.saisonnier?'<span class="eau-saison">saisonnier</span>':'')+(p.src?`<span class="eau-src-tag">${p.src}</span>`:'');
        return `<div class="pop-clic-autre"><span>${t} ${b}</span><span class="pop-clic-adist">${fmtDist(p.dist)}</span></div>`;
      }).join('')+'</div>';
    }
    html+=`<div class="pop-clic-src">À vol d'oiseau · IGN BD TOPO + OpenStreetMap · rayon ${RAYON_EAU} m</div>`;
  }
  html+='</div>';
  map.removeLayer(marqueurClic);
  const el2=document.createElement('div'); el2.className='marqueur eau';
  marqueurClic=L.marker([lat,lng],{
    icon:L.divIcon({html:el2.outerHTML,className:'',iconSize:[16,16],iconAnchor:[8,8]}),
    zIndexOffset:2000
  }).addTo(map);
  marqueurClic.bindPopup(html,{maxWidth:280,closeButton:true,className:'popup-eau'}).openPopup();
  marqueurClic.on('popupclose',()=>{if(marqueurClic){map.removeLayer(marqueurClic);marqueurClic=null;}});
}

// Initialisation appelée depuis index.html après tous les scripts
function initCarte(){
  map=L.map('map',{zoomControl:true}).setView([42.65,0.7],8);
  fonds={
    sombre:{
      nom:'Sombre', clair:false,
      couche: L.layerGroup([
        // fond sombre de base — vrai fond sombre CartoDB, pas de filtre CSS
        // (l'inversion CSS d'un fond clair coûtait très cher au rendu pendant
        // les déplacements de carte : recalcul du filtre sur chaque tuile)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
          {maxZoom:20, attribution:'© OpenStreetMap, © CARTO'}),
        // ombrage du relief (Esri, fiable) pour donner du volume
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}',
          {maxZoom:16, opacity:0.5, className:'couche-hillshade'}),
        // labels par-dessus
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
          {maxZoom:20, attribution:'données © pyrenees-refuges.com'})
      ])
    },
    topo:{nom:'OpenTopoMap',clair:true,couche:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)'})}
  };
  fonds.sombre.couche.addTo(map);
  L.control.scale({imperial:false,metric:true,position:'bottomleft',maxWidth:160}).addTo(map);
  cluster=L.markerClusterGroup({
    maxClusterRadius:45,
    chunkedLoading:true,
    chunkInterval:100,
    chunkDelay:30,
    iconCreateFunction:c=>L.divIcon({html:`<div class="cluster" style="width:38px;height:38px">${c.getChildCount()}</div>`,className:'',iconSize:[38,38]})
  });
  map.addLayer(cluster);
  map.on('click',onClickCarte);
  map.attributionControl.addAttribution('<a href="legal/mentions-legales.html">Mentions légales</a> · <a href="legal/confidentialite.html">Confidentialité</a>');
  charger();

  alignerAutourMoiSurZoom();
  window.addEventListener('resize', alignerAutourMoiSurZoom);
}

// Aligne précisément le bouton "Autour de moi" sur le contrôle de zoom de
// Leaflet, en mesurant sa position réelle à l'écran (Leaflet ajoute ses
// propres marges internes qu'on ne maîtrise pas depuis le CSS seul, donc le
// calcul en pixels fixes ne tombait jamais juste).
function alignerAutourMoiSurZoom(){
  const zoom = document.querySelector('.leaflet-control-zoom');
  const bouton = document.querySelector('.autour-moi');
  if(!zoom || !bouton) return;
  requestAnimationFrame(()=>{
    const rz = zoom.getBoundingClientRect();
    const centreZoomX = rz.left + rz.width/2;
    const largeurBouton = bouton.offsetWidth;
    const rightActuel = window.innerWidth - (centreZoomX + largeurBouton/2);
    bouton.style.right = Math.round(rightActuel) + 'px';
  });
}

// ---------- Bascule thème clair/sombre ----------
function basculerTheme(){
  const clair = document.body.classList.toggle('theme-clair');
  try { localStorage.setItem('refuges_theme', clair ? 'clair' : 'sombre'); } catch(e){}
  // rafraîchir le fond de carte selon le thème
  if(typeof map!=='undefined' && map){
    if(clair && fondActuel==='sombre'){ /* garde le fond, juste l'UI change */ }
  }
}

// Applique le thème sauvegardé au chargement
(function(){
  try {
    if(localStorage.getItem('refuges_theme')==='clair')
      document.body.classList.add('theme-clair');
  } catch(e){}
})();
