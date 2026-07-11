// =============================================================================
// eau.js — Recherche eau (OSM + IGN)
// =============================================================================

const eauCache = {};

function distGeomGJ(r, geom){
  if(!geom||!geom.coordinates) return {dist:null};
  let best=Infinity, blat=null, blon=null;
  const test=(lon,lat)=>{ const d=distM(r.lat,r.lon,lat,lon); if(d<best){best=d;blat=lat;blon=lon;} };
  const walk=c=>{ if(typeof c[0]==='number'){ test(c[0],c[1]); } else c.forEach(walk); };
  walk(geom.coordinates);
  return {dist:isFinite(best)?best:null, plat:blat, plon:blon};
}

async function chercherEauIGN(r){
  const dLat=RAYON_EAU/111320, dLon=RAYON_EAU/(111320*Math.cos(r.lat*Math.PI/180));
  const bbox=`${(r.lon-dLon).toFixed(6)},${(r.lat-dLat).toFixed(6)},${(r.lon+dLon).toFixed(6)},${(r.lat+dLat).toFixed(6)}`;
  // couches hydrographie BD TOPO ; sortie GeoJSON en lon/lat (CRS84) pour éviter l'inversion d'axe
  const couches=[
    {nom:'BDTOPO_V3:detail_hydrographique', type:'point'},
    {nom:'BDTOPO_V3:cours_d_eau',           type:'cours'},
    {nom:'BDTOPO_V3:plan_d_eau',            type:'plan'}
  ];
  const base='https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=CRS:84&COUNT=40';
  // les 3 couches en parallèle
  const lots=await Promise.all(couches.map(async c=>{
    const pts=[];
    try{
      const url=`${base}&TYPENAMES=${encodeURIComponent(c.nom)}&BBOX=${bbox},CRS:84`;
      const rep=await fetchTimeout(url, 6000);
      if(!rep.ok) return pts;
      const gj=await rep.json();
      (gj.features||[]).forEach(f=>{
        const p=f.properties||{};
        const {dist,plat,plon}=distGeomGJ(r, f.geometry);
        if(dist==null||dist>RAYON_EAU+50) return;
        const nat=(p.nature||p.nature_detaillee||'').toString().toLowerCase();
        let type='Point d\'eau';
        if(c.type==='point'){
          if(nat.includes('source')) type='Source';
          else if(nat.includes('fontaine')) type='Fontaine';
          else if(nat.includes('captage')||nat.includes('puits')) type='Robinet / captage';
          else type='Source';
        }else if(c.type==='cours'){
          type='Ruisseau';
        }else{
          type='Plan d\'eau';
        }
        const regime=(p.persistance||p.regime||p.etat||'').toString().toLowerCase();
        const saisonnier=/intermittent|temporaire|sec/.test(regime);
        pts.push({type, nom:p.toponyme||p.nom||p.cpx_toponyme||null, dist, plat, plon, saisonnier, src:'IGN'});
      });
    }catch(e){ /* couche ignorée */ }
    return pts;
  }));
  return lots.flat();
}

async function chercherEauOverpass(r){
  const q=`
    [out:json][timeout:15];
    (
      node["natural"="spring"](around:${RAYON_EAU},${r.lat},${r.lon});
      node["amenity"="drinking_water"](around:${RAYON_EAU},${r.lat},${r.lon});
      node["man_made"~"water_well|water_tap|water_point"](around:${RAYON_EAU},${r.lat},${r.lon});
      way["natural"="water"](around:${RAYON_EAU},${r.lat},${r.lon});
      node["waterway"~"stream|river"](around:${RAYON_EAU},${r.lat},${r.lon});
      way["waterway"~"stream|river"](around:${RAYON_EAU},${r.lat},${r.lon});
    );
    out geom tags;
  `;
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  let data=null, err=null;
  for(const url of endpoints){
    try{
      const rep=await fetchTimeout(url, 10000, {method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      if(!rep.ok) throw new Error('HTTP '+rep.status);
      data=await rep.json(); break;
    }catch(e){ err=e; }
  }
  if(!data){ return {erreur:true, points:[]}; }

  const points=(data.elements||[]).map(el=>{
    const type=typeEau(el.tags||{});
    const tg=el.tags||{};
    let dist=Infinity, plat=null, plon=null;
    if(el.type==='node' && el.lat!=null){
      dist=distM(r.lat,r.lon,el.lat,el.lon); plat=el.lat; plon=el.lon;
    }else if(Array.isArray(el.geometry) && el.geometry.length){
      for(const g of el.geometry){
        if(g.lat==null) continue;
        const d=distM(r.lat,r.lon,g.lat,g.lon);
        if(d<dist){ dist=d; plat=g.lat; plon=g.lon; }
      }
    }else if(el.center){
      dist=distM(r.lat,r.lon,el.center.lat,el.center.lon); plat=el.center.lat; plon=el.center.lon;
    }
    if(!isFinite(dist)) return null;
    const saisonnier = tg.seasonal==='yes' || tg.intermittent==='yes';
    return {type, nom:tg.name||null, dist, plat, plon, saisonnier, src:'OSM'};
  }).filter(Boolean)
    .filter(p=>p.dist<=RAYON_EAU+50)
    .sort((a,b)=>a.dist-b.dist);

  return {erreur:false, points};
}

async function chercherEauOSM(r){
  if(eauCache[r._cle]) return eauCache[r._cle];

  // 1) IGN d'abord (rapide, officiel)
  let ptsIGN=[];
  try{ ptsIGN=await chercherEauIGN(r); }catch(e){ ptsIGN=[]; }

  let points=ptsIGN, erreur=false;

  // 2) OSM seulement si l'IGN n'a rien trouvé (évite la requête Overpass lente le plus souvent)
  if(ptsIGN.length===0){
    let resOSM;
    try{ resOSM=await chercherEauOverpass(r); }catch(e){ resOSM={erreur:true, points:[]}; }
    points=resOSM.points||[];
    erreur=resOSM.erreur && points.length===0;
  }

  // dédoublonnage (points à moins de ~40 m et même famille = doublon)
  const gardes=[];
  for(const p of points.sort((a,b)=>a.dist-b.dist)){
    const doublon=gardes.find(g=>distM(g.plat??r.lat,g.plon??r.lon,p.plat??r.lat,p.plon??r.lon)<40 && familleEau(g.type)===familleEau(p.type));
    if(!doublon) gardes.push(p);
  }
  gardes.sort((a,b)=>a.dist-b.dist);

  const res={erreur, points:gardes};
  eauCache[r._cle]=res;
  return res;
}

async function majEauOSM(r, prefixe=''){
  const box=document.getElementById(prefixe+'eau-osm-val');
  if(!box) return;
  let res;
  try{ res=await chercherEauOSM(r); }catch(e){ res={erreur:true}; }
  // si l'utilisateur a changé de refuge entre-temps, on abandonne (uniquement pertinent pour le petit panneau)
  if(!prefixe && (actif===null || REFUGES[actif]!==r)) return;
  const cont=document.getElementById(prefixe+'eau-osm');
  if(!cont) return;

  if(res.erreur){
    box.innerHTML='<span class="eau-osm-rien">Recherche indisponible (OpenStreetMap injoignable).</span>';
    return;
  }
  if(!res.points.length){
    box.innerHTML=`<span class="eau-osm-rien">Aucun point d'eau référencé dans un rayon de ${RAYON_EAU} m.</span>`;
    return;
  }
  // point principal : le plus proche, en privilégiant eau potable/source à distance comparable
  const prioritaire=res.points.slice().sort((a,b)=>(scoreEau(a.type)-scoreEau(b.type))||(a.dist-b.dist))[0];
  const plusProche=res.points[0];
  const principal = plusProche.dist <= prioritaire.dist+50 ? plusProche : prioritaire;
  const autres=res.points.filter(p=>p!==principal).slice(0,3);

  // affiche le nom si connu, sinon le type (pas de "Ruisseau · Ruisseau du...")
  const nomEau = p => p.nom || p.type;

  const saison = principal.saisonnier ? ' <span class="eau-saison">saisonnier</span>' : '';
  const srcP = principal.src ? ` <span class="eau-src-tag">${principal.src}</span>` : '';
  box.innerHTML=`<span style="color:var(--cyan)">${nomEau(principal)}${saison}${srcP}</span><span class="eau-osm-dist">à ${fmtDist(principal.dist)}</span>`;

  // Renseigne automatiquement "Eau à proximité : Oui" si un point d'eau est à moins de 250 m
  if(principal.dist <= 250){
    const cell=document.getElementById(prefixe+'cell-eau-proximite');
    if(cell && cell.textContent.trim()!=='Oui'){
      cell.textContent='Oui';
      cell.style.color='var(--cyan)';
      cell.title=`Point d'eau détecté à ${Math.round(principal.dist)} m`;
    }
  }
  cont.querySelector('.eau-osm-liste')?.remove();
  cont.querySelector('.eau-osm-src')?.remove();
  let html='';
  if(autres.length) html='<div class="eau-osm-liste">'+autres.map(p=>`<div class="eau-osm-item"><span>${nomEau(p)}${p.saisonnier?' <span class="eau-saison">saisonnier</span>':''}${p.src?' <span class="eau-src-tag">'+p.src+'</span>':''}</span><span class="d">${fmtDist(p.dist)}</span></div>`).join('')+'</div>';
  // mention des sources réellement utilisées
  const srcs=[...new Set(res.points.map(p=>p.src).filter(Boolean))];
  const srcTxt = srcs.length ? srcs.map(s=>s==='IGN'?'IGN BD TOPO':'OpenStreetMap').join(' + ') : 'OpenStreetMap';
  html+='<div class="eau-osm-src">Distances à vol d\'oiseau · '+srcTxt+' · rayon '+RAYON_EAU+' m</div>';
  box.insertAdjacentHTML('afterend', html);
}

