// =============================================================================
// gpx.js — Import GPX et détection le long du tracé
// =============================================================================

let traceGPX = null, marqueursGPX = [], traceCourante = null, nomCourant = '';

function distPointSegment(plat,plon, alat,alon, blat,blon){
  // projection locale équirectangulaire autour de P
  const R=6371000, toR=x=>x*Math.PI/180;
  const lat0=toR(plat);
  const X=(lon,lat)=>({x:R*toR(lon)*Math.cos(lat0), y:R*toR(lat)});
  const P=X(plon,plat), A=X(alon,alat), B=X(blon,blat);
  const dx=B.x-A.x, dy=B.y-A.y;
  const len2=dx*dx+dy*dy;
  let t = len2>0 ? ((P.x-A.x)*dx+(P.y-A.y)*dy)/len2 : 0;
  t=Math.max(0,Math.min(1,t));
  const cx=A.x+t*dx, cy=A.y+t*dy;
  return Math.hypot(P.x-cx, P.y-cy);
}

function distAuTrace(lat,lon, trace){
  let best=Infinity;
  for(let k=0;k<trace.length-1;k++){
    const d=distPointSegment(lat,lon, trace[k][0],trace[k][1], trace[k+1][0],trace[k+1][1]);
    if(d<best){ best=d; if(best<5) break; }
  }
  return best;
}

function longueurTrace(trace){
  let tot=0;
  for(let k=0;k<trace.length-1;k++) tot+=distM(trace[k][0],trace[k][1],trace[k+1][0],trace[k+1][1]);
  return tot/1000;
}

function importerGPX(ev){
  const file=ev.target.files&&ev.target.files[0];
  if(!file) return;
  const btn=document.querySelector('.import-gpx'); btn.classList.add('charge');
  const reader=new FileReader();
  reader.onload=e=>{
    btn.classList.remove('charge');
    try{ traiterGPX(e.target.result, file.name); }
    catch(err){ alert("Impossible de lire ce fichier GPX : "+err.message); }
    ev.target.value=''; // permet de recharger le même fichier
  };
  reader.onerror=()=>{ btn.classList.remove('charge'); alert("Erreur de lecture du fichier."); };
  reader.readAsText(file);
}

function traiterGPX(texte, nom){
  const xml=new DOMParser().parseFromString(texte,'application/xml');
  if(xml.querySelector('parsererror')) throw new Error('format invalide');
  // points : trkpt en priorité, sinon rtept
  let pts=[...xml.querySelectorAll('trkpt')];
  if(!pts.length) pts=[...xml.querySelectorAll('rtept')];
  if(!pts.length) throw new Error('aucun point de tracé trouvé');
  const trace=pts.map(p=>{
    const lat=parseFloat(p.getAttribute('lat'));
    const lon=parseFloat(p.getAttribute('lon'));
    const eleEl=p.querySelector('ele');
    const alt=eleEl ? parseFloat(eleEl.textContent) : null;
    return [lat, lon, alt];
  }).filter(c=>!isNaN(c[0])&&!isNaN(c[1]));
  if(trace.length<2) throw new Error('tracé trop court');

  effacerGPX(true);

  // tracé sur la carte
  traceGPX=L.polyline(trace,{color:'#5eba7d',weight:4,opacity:.9}).addTo(map);
  map.fitBounds(traceGPX.getBounds(),{padding:[40,40]});

  analyserItineraire(trace, nom);
  afficherBtnPlanifier();
}

function analyserItineraire(trace, nom){
  traceCourante=trace; nomCourant=nom;
  const panneau=document.getElementById('gpx-panneau');
  panneau.classList.add('ouvert');
  document.getElementById('gpx-titre').textContent=nom.replace(/\.gpx$/i,'').slice(0,40);
  const km=longueurTrace(trace);

  // cumul + index spatial (construits une fois, réutilisés pour refuges ET eau)
  const cumul=[0];
  for(let k=1;k<trace.length;k++) cumul[k]=cumul[k-1]+distM(trace[k-1][0],trace[k-1][1],trace[k][0],trace[k][1]);
  const idx=construireIndexTrace(trace,cumul);

  // bbox du tracé (filtre rapide avant le calcul précis)
  let minLat=90,maxLat=-90,minLon=180,maxLon=-180;
  for(const [la,lo] of trace){ if(la<minLat)minLat=la; if(la>maxLat)maxLat=la; if(lo<minLon)minLon=lo; if(lo>maxLon)maxLon=lo; }
  const mLat=MARGE_REFUGE/111320, mLon=MARGE_REFUGE/(111320*Math.cos((minLat+maxLat)/2*Math.PI/180));

  // 1) refuges proches : filtre bbox rapide, puis distance précise via l'index
  const refugesProches=[];
  REFUGES.forEach(r=>{
    if(r.lat<minLat-mLat||r.lat>maxLat+mLat||r.lon<minLon-mLon||r.lon>maxLon+mLon) return;
    const {dist,pk}=pkSurTraceIndex(r.lat,r.lon,idx);
    if(dist<=MARGE_REFUGE) refugesProches.push({r,d:dist,pk});
  });
  refugesProches.sort((a,b)=>a.pk-b.pk);

  document.getElementById('gpx-stats').innerHTML=`<span><b>${km.toFixed(1)} km</b> de tracé</span><span><b>${refugesProches.length}</b> refuge(s)</span><span id="gpx-nb-eau"><span class="eau-osm-spin"></span> eau…</span><span class="gpx-marge">marge ${MARGE_GPX} m · <a onclick="changerMarge()">modifier</a></span>`;

  rendreResultatsGPX(refugesProches, null);

  detecterEauTrace(trace).then(eaux=>{
    const nb=document.getElementById('gpx-nb-eau');
    const nbPlages=eaux.filter(p=>!p.potable).length;
    const nbPot=eaux.filter(p=>p.potable).length;
    if(nb) nb.innerHTML=`<b>${nbPlages}</b> point(s) d'eau · <b style="color:var(--vert)">${nbPot}</b> potable`;
    rendreResultatsGPX(refugesProches, eaux);

    // Affichage carte : zones = ligne avec halo, points = goutte d'eau avec icône
    eaux.forEach((p,i)=>{
      if(p.forme==='zone'){
        const segPts=[];
        for(let k=0;k<trace.length;k++){
          if(cumul[k]>=p.pkMin && cumul[k]<=p.pkMax) segPts.push([trace[k][0],trace[k][1]]);
        }
        if(segPts.length>1){
          // halo doux dessous
          const halo=L.polyline(segPts,{color:'#38bdf8',weight:12,opacity:0.18,lineCap:'round'}).addTo(map);
          // ligne nette dessus
          const ligne=L.polyline(segPts,{color:'#0ea5e9',weight:5,opacity:0.95,lineCap:'round'}).addTo(map);
          const popup=creerPopupEau(p);
          ligne.bindPopup(popup,{className:'popup-eau-carte',maxWidth:240});
          marqueursGPX.push(halo,ligne);
        }
      }else{
        // goutte d'eau avec icône dedans
        const m=L.marker([p.lat,p.lon],{
          icon:iconeGoutteEau(p), zIndexOffset:600
        }).addTo(map);
        m.bindPopup(creerPopupEau(p),{className:'popup-eau-carte',maxWidth:240});
        marqueursGPX.push(m);
      }
    });
  }).catch(()=>{
    const nb=document.getElementById('gpx-nb-eau');
    if(nb) nb.textContent='eau indisponible';
  });
}

// Marqueur pastille ronde minimaliste avec le symbole du type au centre
function iconeGoutteEau(p){
  const couleur = p.potable ? '#5eba7d' : '#0ea5e9';
  const ico = iconeEauMini(p);
  const html = `<div class="pastille-eau" style="--c:${couleur}">${ico}</div>`;
  return L.divIcon({html, className:'', iconSize:[22,22], iconAnchor:[11,11], popupAnchor:[0,-13]});
}

// Petite icône blanche pour l'intérieur de la goutte
function iconeEauMini(p){
  if(p.potable) return '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z"/></svg>';
  const t=p.type;
  if(t==='Cascade') return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M6 3v18M12 3v18M18 3v18"/></svg>';
  if(['Lac','Étang','Plan d\'eau','Réservoir'].includes(t)) return '<svg viewBox="0 0 24 24" fill="#fff"><ellipse cx="12" cy="13" rx="8" ry="4.5"/></svg>';
  if(t==='Source') return '<svg viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="3.5"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M3 9c2 0 2-1.5 4-1.5S9 9 11 9s2-1.5 4-1.5S17 9 19 9"/><path d="M3 15c2 0 2-1.5 4-1.5S9 15 11 15s2-1.5 4-1.5S17 15 19 15"/></svg>';
}

// Popup riche pour un point/zone d'eau
function creerPopupEau(p){
  const couleur = p.potable ? '#5eba7d' : '#0ea5e9';
  const titre = p.nom || p.type;
  let sousTitre;
  if(p.potable){
    sousTitre = `Eau potable${p.d!=null?` · à ${Math.round(p.d)} m du sentier`:''}`;
  }else if(p.forme==='zone'){
    sousTitre = `${p.type} · longé sur ${Math.round(p.pkMax-p.pkMin)} m`;
  }else{
    sousTitre = `${p.type}${p.d!=null?` · à ${Math.round(p.d)} m du sentier`:''}`;
  }
  const km = p.forme==='zone'
    ? `km ${fmtPK(p.pkMin)} → ${fmtPK(p.pkMax)}`
    : `km ${fmtPK(p.pk)}`;
  return `
    <div class="pop-eau" style="--c:${couleur}">
      <div class="pop-eau-titre">${titre}</div>
      <div class="pop-eau-sous">${sousTitre}</div>
      <div class="pop-eau-km">${km}</div>
    </div>`;
}

function changerMarge(){
  const choix=prompt("Distance maximale au tracé, en mètres (ex: 250, 500, 1000) :", MARGE_GPX);
  if(choix===null) return;
  const v=parseInt(choix);
  if(isNaN(v)||v<50||v>5000){ alert("Entre une valeur entre 50 et 5000 mètres."); return; }
  MARGE_GPX=v;
  // on efface les marqueurs d'eau et on relance l'analyse sur le même tracé
  marqueursGPX.forEach(m=>map.removeLayer(m)); marqueursGPX=[];
  if(traceCourante) analyserItineraire(traceCourante, nomCourant);
}

function rendreResultatsGPX(refuges, eaux){
  const box=document.getElementById('gpx-resultats');
  let html='';
  // refuges
  html+='<div class="gpx-sec-titre">Refuges & cabanes sur le parcours</div>';
  if(refuges.length===0){
    html+='<div class="gpx-vide">Aucun refuge à moins de '+MARGE_REFUGE+' m du tracé.</div>';
  }else{
    html+=refuges.map(({r,d,pk})=>`
      <div class="gpx-item" onclick="selectionner(${r._i},true)">
        <span class="gpx-pastille ${r.cat}"></span>
        <div class="gpx-item-txt">
          <div class="gpx-item-nom">${r.nom}</div>
          <div class="gpx-item-sous">${tagTxt(r.cat)}${r.alt?' · '+r.alt+' m':''} · <span style="color:var(--texte-3)">${Math.round(d)} m du sentier</span></div>
        </div>
        <span class="gpx-item-km">km ${fmtPK(pk)}</span>
      </div>`).join('');
  }
  // points d'eau
  html+='<div class="gpx-sec-titre">Eau sur le parcours</div>';
  if(eaux===null){
    html+='<div class="gpx-charge"><span class="eau-osm-spin"></span> recherche de l\'eau…</div>';
  }else if(eaux.length===0){
    html+='<div class="gpx-vide">Aucune eau détectée le long du tracé.</div>';
  }else{
    // Tri intelligent : eau potable d'abord (le plus précieux), puis par ordre du parcours
    const potables = eaux.filter(p=>p.potable);
    const zones    = eaux.filter(p=>!p.potable && p.forme==='zone');
    const pts      = eaux.filter(p=>!p.potable && p.forme!=='zone');

    // Bloc eau potable, mis en avant
    if(potables.length){
      html+='<div class="eau-groupe">';
      html+=potables.map(p=>ligneEau(p,'potable')).join('');
      html+='</div>';
    }
    // Zones longées
    if(zones.length){
      html+=zones.map(p=>ligneEau(p,'zone')).join('');
    }
    // Points de croisement / proximité
    if(pts.length){
      html+=pts.map(p=>ligneEau(p,'point')).join('');
    }
  }
  box.innerHTML=html;
}

// Génère une ligne d'affichage pour un élément d'eau
function ligneEau(p, variante){
  const icone = iconeEau(p);
  if(variante==='potable'){
    return `
    <div class="eau-ligne potable" onclick="map.setView([${p.lat},${p.lon}],15)">
      <div class="eau-ico">${icone}</div>
      <div class="eau-txt">
        <div class="eau-nom">${p.nom||p.type}</div>
        <div class="eau-detail">Eau potable${p.d!=null?` · à ${Math.round(p.d)} m`:''}</div>
      </div>
      <div class="eau-km">km ${fmtPK(p.pk)}</div>
    </div>`;
  }
  if(variante==='zone'){
    return `
    <div class="eau-ligne zone" onclick="map.setView([${p.lat},${p.lon}],14)">
      <div class="eau-ico">${icone}</div>
      <div class="eau-txt">
        <div class="eau-nom">${p.nom||p.type}</div>
        <div class="eau-detail"><span class="eau-badge-longe">longé</span> sur ${Math.round(p.pkMax-p.pkMin)} m</div>
      </div>
      <div class="eau-km">${fmtPK(p.pkMin)}–${fmtPK(p.pkMax)}</div>
    </div>`;
  }
  // point
  return `
  <div class="eau-ligne" onclick="map.setView([${p.lat},${p.lon}],15)">
    <div class="eau-ico">${icone}</div>
    <div class="eau-txt">
      <div class="eau-nom">${p.nom||p.type}</div>
      <div class="eau-detail">${p.type}${p.d!=null?` · à ${Math.round(p.d)} m du sentier`:''}</div>
    </div>
    <div class="eau-km">km ${fmtPK(p.pk)}</div>
  </div>`;
}

// Icône SVG selon le type d'eau
function iconeEau(p){
  if(p.potable) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>';
  const t=p.type;
  if(t==='Cascade') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v18M9 3v18M14 3v10M19 3v7"/><path d="M14 17c0 2 1 4 2.5 4s2.5-2 2.5-4-1-4-2.5-4"/></svg>';
  if(t==='Lac'||t==='Étang'||t==='Plan d\'eau'||t==='Réservoir') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="9" ry="5"/><path d="M3 14c2-1 4-1 6 0"/></svg>';
  if(t==='Source') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>';
  // ruisseau / rivière / cours d'eau : vaguelettes
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/></svg>';
}

// ---------- Index spatial du tracé (grille de hachage) ----------
// Permet de trouver le segment de tracé le plus proche en O(1) au lieu de O(n)
function construireIndexTrace(trace, cumul){
  // taille de cellule ~ MARGE_GPX pour que les voisins immédiats suffisent
  const tailleDeg = MARGE_GPX / 111320; // ~degrés de latitude pour MARGE_GPX mètres
  const grille = new Map();
  const cle = (gx, gy) => gx + ',' + gy;

  for(let k=0;k<trace.length-1;k++){
    // cellules couvertes par les extrémités du segment
    const x1=Math.floor(trace[k][1]/tailleDeg),  y1=Math.floor(trace[k][0]/tailleDeg);
    const x2=Math.floor(trace[k+1][1]/tailleDeg), y2=Math.floor(trace[k+1][0]/tailleDeg);
    const xmin=Math.min(x1,x2), xmax=Math.max(x1,x2);
    const ymin=Math.min(y1,y2), ymax=Math.max(y1,y2);
    for(let gx=xmin; gx<=xmax; gx++){
      for(let gy=ymin; gy<=ymax; gy++){
        const c=cle(gx,gy);
        if(!grille.has(c)) grille.set(c,[]);
        grille.get(c).push(k);
      }
    }
  }
  return { grille, tailleDeg, trace, cumul };
}

// Distance + PK + point projeté sur la trace, via l'index spatial
function pkSurTraceIndex(lat, lon, idx){
  const { grille, tailleDeg, trace, cumul } = idx;
  const gx=Math.floor(lon/tailleDeg), gy=Math.floor(lat/tailleDeg);
  let best=Infinity, pk=0, plat=lat, plon=lon;
  const vus=new Set();
  // on regarde la cellule du point + les 8 voisines
  for(let dx=-1; dx<=1; dx++){
    for(let dy=-1; dy<=1; dy++){
      const segs=grille.get((gx+dx)+','+(gy+dy));
      if(!segs) continue;
      for(const k of segs){
        if(vus.has(k)) continue; vus.add(k);
        const a=trace[k], b=trace[k+1];
        const d=distPointSegment(lat,lon, a[0],a[1], b[0],b[1]);
        if(d<best){
          best=d;
          const R=6371000, toR=x=>x*Math.PI/180, lat0=toR(lat);
          const X=(lo,la)=>({x:R*toR(lo)*Math.cos(lat0), y:R*toR(la)});
          const P=X(lon,lat), A=X(a[1],a[0]), B=X(b[1],b[0]);
          const ddx=B.x-A.x, ddy=B.y-A.y, len2=ddx*ddx+ddy*ddy;
          let t= len2>0 ? ((P.x-A.x)*ddx+(P.y-A.y)*ddy)/len2 : 0;
          t=Math.max(0,Math.min(1,t));
          pk = cumul[k] + t*(cumul[k+1]-cumul[k]);
          // point projeté sur la trace (là où le chemin touche l'eau)
          plat = a[0] + t*(b[0]-a[0]);
          plon = a[1] + t*(b[1]-a[1]);
        }
      }
    }
  }
  return {dist:best, pk, plat, plon};
}

// Ancienne version (fallback) — boucle complète, gardée pour compatibilité
function pkSurTrace(lat,lon, trace, cumul){
  let best=Infinity, pk=0;
  for(let k=0;k<trace.length-1;k++){
    const a=trace[k], b=trace[k+1];
    const d=distPointSegment(lat,lon, a[0],a[1], b[0],b[1]);
    if(d<best){
      best=d;
      const R=6371000, toR=x=>x*Math.PI/180, lat0=toR(lat);
      const X=(lo,la)=>({x:R*toR(lo)*Math.cos(lat0), y:R*toR(la)});
      const P=X(lon,lat), A=X(a[1],a[0]), B=X(b[1],b[0]);
      const dx=B.x-A.x, dy=B.y-A.y, len2=dx*dx+dy*dy;
      let t= len2>0 ? ((P.x-A.x)*dx+(P.y-A.y)*dy)/len2 : 0;
      t=Math.max(0,Math.min(1,t));
      pk = cumul[k] + t*(cumul[k+1]-cumul[k]);
    }
  }
  return {dist:best, pk};
}

function fmtPK(m){ return (m/1000).toFixed(1); }

async function detecterEauTrace(trace){
  // cumul des distances le long du tracé (pour les PK)
  const cumul=[0];
  for(let k=1;k<trace.length;k++) cumul[k]=cumul[k-1]+distM(trace[k-1][0],trace[k-1][1],trace[k][0],trace[k][1]);

  // Bbox englobant le tracé + marge (une seule requête simple, la plus fiable)
  let minLat=90,maxLat=-90,minLon=180,maxLon=-180;
  for(const [la,lo] of trace){
    if(la<minLat)minLat=la; if(la>maxLat)maxLat=la;
    if(lo<minLon)minLon=lo; if(lo>maxLon)maxLon=lo;
  }
  const mLat=MARGE_GPX/111320;
  const mLon=MARGE_GPX/(111320*Math.cos((minLat+maxLat)/2*Math.PI/180));
  const bbox=`${(minLat-mLat).toFixed(4)},${(minLon-mLon).toFixed(4)},${(maxLat+mLat).toFixed(4)},${(maxLon+mLon).toFixed(4)}`;

  // Requête élargie : tous les types d'eau utiles en montagne
  const qFinal = `[out:json][timeout:60];`+
    `(`+
      `node["natural"="spring"](${bbox});`+
      `node["natural"="water"](${bbox});`+
      `node["amenity"="drinking_water"](${bbox});`+
      `node["man_made"~"water_well|water_tap|water_point|reservoir_covered"](${bbox});`+
      `node["waterway"~"waterfall|stream_end"](${bbox});`+
      `way["waterway"~"stream|river|canal|drain|ditch"](${bbox});`+
      `way["natural"="water"](${bbox});`+
      `way["water"~"lake|pond|reservoir|river|stream_pool"](${bbox});`+
      `way["landuse"="reservoir"](${bbox});`+
    `);`+
    `out geom tags;`;

  const endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];
  let data=null;
  for(const url of endpoints){
    try{
      const rep=await fetchTimeout(url, 30000, {method:'POST',body:'data='+encodeURIComponent(qFinal),headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      if(!rep.ok) throw 0;
      data=await rep.json(); break;
    }catch(e){}
  }
  if(!data) throw new Error('Overpass injoignable');

  // Index spatial du tracé (construit UNE fois) — accélère tous les calculs de distance
  const idx = construireIndexTrace(trace, cumul);

  const MARGE_POINT = 40; // m : seuil pour points isolés (sources, fontaines) — un peu de tolérance
  const potables=[];
  const sortie=[];

  (data.elements||[]).forEach(el=>{
    const t=el.tags||{};
    const type=typeEau(t);
    const nom=t.name||null;
    const saisonnier=t.seasonal==='yes'||t.intermittent==='yes';

    // Ignore l'eau souterraine (conduite enterrée, tunnel, siphon) : pas accessible
    if(t.tunnel && t.tunnel!=='no') return;
    if(t.location==='underground' || t.covered==='yes') return;
    if(t.layer && parseInt(t.layer)<0 && t.waterway) return;

    // --- eau potable / fontaine → point vert, seuil strict ---
    if(['Eau potable','Fontaine','Robinet / captage'].includes(type)){
      if(el.lat!=null){
        const {dist,pk}=pkSurTraceIndex(el.lat,el.lon,idx);
        if(dist<=MARGE_POINT) potables.push({lat:el.lat,lon:el.lon,type,nom,dist,pk});
      }
      return;
    }

    // --- nœud isolé (source, point d'eau ponctuel) → seuil strict 30 m ---
    if(el.type==='node' && el.lat!=null){
      const {dist,pk}=pkSurTraceIndex(el.lat,el.lon,idx);
      if(dist<=MARGE_POINT)
        sortie.push({forme:'point', type, nom, potable:false, saisonnier, lat:el.lat, lon:el.lon, d:dist, pk, pkMin:pk, pkMax:pk});
      return;
    }

    // --- ligne / surface (ruisseau, rivière, lac) ---
    const pts=(el.geometry||[]).filter(g=>g.lat!=null);
    if(!pts.length) return;

    // Collecte les contacts (sommets + densification) proches du tracé
    const contacts=[];
    for(const g of pts){
      const {dist,pk,plat,plon}=pkSurTraceIndex(g.lat,g.lon,idx);
      if(dist<=MARGE_GPX) contacts.push({pk,dist,lat:plat,lon:plon}); // point SUR la trace
    }
    // Densification des segments de la ligne d'eau (40m, plafonné)
    for(let i=0;i<pts.length-1;i++){
      const d=distM(pts[i].lat,pts[i].lon,pts[i+1].lat,pts[i+1].lon);
      const n=Math.min(20, Math.max(2,Math.ceil(d/40)));
      for(let j=1;j<n;j++){
        const f=j/n;
        const la=pts[i].lat+(pts[i+1].lat-pts[i].lat)*f;
        const lo=pts[i].lon+(pts[i+1].lon-pts[i].lon)*f;
        const {dist,pk,plat,plon}=pkSurTraceIndex(la,lo,idx);
        if(dist<=MARGE_GPX) contacts.push({pk,dist,lat:plat,lon:plon});
      }
    }
    if(!contacts.length) return;

    // Seuil : l'eau n'est "accessible le long du sentier" que si elle est proche.
    const MARGE_LONGE = 60; // m
    const contactsProches = contacts.filter(c=>c.dist<=MARGE_LONGE);
    if(!contactsProches.length) return;

    contactsProches.sort((a,b)=>a.pk-b.pk);

    // Regroupe en tronçons : coupure dès que l'eau s'écarte du sentier (trou > 120m de PK).
    // Un simple croisement laisse un ou deux contacts isolés → deviendra un point.
    // Un vrai longement laisse une longue série de contacts continus → deviendra une zone.
    const COUPURE_EL=120;
    let grp=[contactsProches[0]];
    const grps=[];
    for(let i=1;i<contactsProches.length;i++){
      if(contactsProches[i].pk - grp[grp.length-1].pk > COUPURE_EL){ grps.push(grp); grp=[]; }
      grp.push(contactsProches[i]);
    }
    grps.push(grp);

    grps.forEach(g=>{
      const pkMin=g[0].pk, pkMax=g[g.length-1].pk;
      const proche=g.reduce((a,b)=>b.dist<a.dist?b:a);
      const longueur=pkMax-pkMin;

      // ZONE (ligne bleue) seulement si le sentier longe l'eau sur ≥ 250 m de façon continue.
      // Sinon c'est un croisement / une proximité ponctuelle → POINT.
      if(longueur>=250){
        const ligne = g.map(c=>[c.lat,c.lon]);
        sortie.push({
          forme:'zone', type, nom, potable:false, saisonnier,
          lat:proche.lat, lon:proche.lon, d:proche.dist,
          pkMin, pkMax, pk:(pkMin+pkMax)/2, ligne
        });
      }else{
        // point unique au meilleur contact (là où le sentier touche l'eau)
        sortie.push({
          forme:'point', type, nom, potable:false, saisonnier,
          lat:proche.lat, lon:proche.lon, d:proche.dist,
          pk:proche.pk??((pkMin+pkMax)/2), pkMin:proche.pk??pkMin, pkMax:proche.pk??pkMax
        });
      }
    });
    return; // fin du traitement de cet élément
  });

  // ---- NETTOYAGE FINAL ----

  // 1) Points potables : dédoublonnage strict (< 150m de PK)
  const potVus=[];
  potables.sort((a,b)=>a.pk-b.pk);
  potables.forEach(pt=>{
    if(!potVus.find(v=>Math.abs(v.pk-pt.pk)<150))
      potVus.push({forme:'point',type:pt.type,nom:pt.nom,potable:true,lat:pt.lat,lon:pt.lon,d:pt.dist,pk:pt.pk,pkMin:pt.pk,pkMax:pt.pk});
  });

  // 2) Fusionne uniquement les ZONES contiguës du même cours d'eau (ruisseau découpé en
  //    plusieurs way OSM). Les points de croisement restent des points distincts.
  const zones=sortie.filter(p=>!p.potable && p.forme==='zone').sort((a,b)=>a.pkMin-b.pkMin);
  const points=sortie.filter(p=>!p.potable && p.forme==='point');

  const zonesFuses=[];
  for(const s of zones){
    const prev=zonesFuses[zonesFuses.length-1];
    // fusion seulement si les zones se touchent presque (< 150m) ET même nom (ou sans nom)
    const memeNom = !prev || !prev.nom || !s.nom || prev.nom===s.nom;
    if(prev && s.pkMin - prev.pkMax < 150 && memeNom){
      prev.pkMax=Math.max(prev.pkMax, s.pkMax);
      if(s.d<prev.d){ prev.d=s.d; prev.lat=s.lat; prev.lon=s.lon; }
      if(!prev.nom && s.nom) prev.nom=s.nom;
      if(s.ligne){ prev.ligne=(prev.ligne||[]).concat(s.ligne); }
    }else{
      zonesFuses.push({...s});
    }
  }
  zonesFuses.forEach(s=>{ s.pk=(s.pkMin+s.pkMax)/2; });

  // Retire les points de croisement qui tombent dans une zone déjà tracée (doublon)
  const pointsFiltres=points.filter(p=>
    !zonesFuses.some(z=> p.pk>=z.pkMin-80 && p.pk<=z.pkMax+80)
  );
  // Dédoublonne les points proches entre eux (< 200m de PK)
  pointsFiltres.sort((a,b)=>a.pk-b.pk);
  const pointsVus=[];
  pointsFiltres.forEach(p=>{
    if(!pointsVus.find(v=>Math.abs(v.pk-p.pk)<200)) pointsVus.push(p);
  });

  const tout=[...zonesFuses, ...pointsVus, ...potVus];
  tout.sort((a,b)=>(a.pkMin??a.pk)-(b.pkMin??b.pk));
  return tout;
}

function effacerGPX(silencieux){
  if(traceGPX){ map.removeLayer(traceGPX); traceGPX=null; }
  marqueursGPX.forEach(m=>map.removeLayer(m)); marqueursGPX=[];
  traceCourante=null; nomCourant='';
  document.getElementById('btn-planifier').style.display='none';
  if(typeof fermerPlanificateur==='function') fermerPlanificateur();
  if(!silencieux){
    document.getElementById('gpx-panneau').classList.remove('ouvert');
  }
}

