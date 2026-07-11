// =============================================================================
// departements.js — Badges de filtre par département/région. Sélectionner un
// badge zoome sur la zone et dessine son contour administratif réel en
// surbrillance sur la carte (données simplifiées, voir donnees-carte/).
// =============================================================================

let departementActif = null;
let coucheDepartement = null;
let contoursDepartements = null; // {nom: geojson feature}
let contoursChargement = null;

async function chargerContoursDepartements(){
  if(contoursDepartements) return contoursDepartements;
  if(!contoursChargement){
    contoursChargement = fetch('donnees-carte/departements-contours.geojson')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        contoursDepartements = {};
        (data?.features||[]).forEach(f => { contoursDepartements[f.properties.nom] = f; });
        return contoursDepartements;
      })
      .catch(e => { console.warn('Contours départements indisponibles:', e); contoursDepartements = {}; return contoursDepartements; });
  }
  return contoursChargement;
}

function departementsUniques(){
  const compte = {};
  REFUGES.forEach(r=>{
    const nom = r.departement || r.region;
    if(!nom) return;
    compte[nom] = (compte[nom]||0) + 1;
  });
  return Object.entries(compte).sort((a,b)=>a[0].localeCompare(b[0]));
}

function rendreDepartements(){
  const box=document.getElementById('departements');
  if(!box) return;
  const deps=departementsUniques();
  box.innerHTML = deps.map(([nom,n])=>`
    <button class="dept-badge${departementActif===nom?' actif':''}" onclick="toggleDepartement('${nom.replace(/'/g,"\\'")}')">
      ${nom} <span class="dept-n">${n}</span>
    </button>
  `).join('');
  chargerContoursDepartements(); // préchauffe le cache dès l'affichage des badges
}

async function toggleDepartement(nom){
  if(departementActif===nom){
    // déjà sélectionné → on désélectionne et on revient à la vue d'ensemble
    departementActif=null;
    recherche='';
    const champ=document.getElementById('recherche'); if(champ) champ.value='';
    retirerCoucheDepartement();
    majMarqueursVisibles(); // retire les marqueurs → carte légère
    appliquer();
    rendreDepartements();
    return;
  }

  departementActif=nom;
  recherche=nom;
  const champ=document.getElementById('recherche'); if(champ) champ.value=nom;
  majMarqueursVisibles(); // n'affiche que les marqueurs de ce département
  appliquer();
  rendreDepartements();

  retirerCoucheDepartement();

  const contours = await chargerContoursDepartements();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f0a04b';
  const feature = contours[nom];

  if(feature){
    coucheDepartement = L.geoJSON(feature, {
      style: { color: accent, weight: 2.5, dashArray: '7 6', fillColor: accent, fillOpacity: 0, opacity: 0, interactive: false }
    }).addTo(map);
    map.flyToBounds(coucheDepartement.getBounds(), { padding:[50,50], duration:.9 });
    // fondu d'apparition, une fois la couche posée sur la carte
    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      if(coucheDepartement) coucheDepartement.setStyle({ opacity:1, fillOpacity:0.08 });
    }));
    return;
  }

  // filet de secours si un contour venait à manquer : cercle approximatif
  const lieux = REFUGES.filter(r => (r.departement||r.region)===nom);
  if(lieux.length===0) return;
  const bounds = L.latLngBounds(lieux.map(r=>[r.lat,r.lon]));
  map.flyToBounds(bounds, { padding:[70,70], duration:.9 });
  const centre = bounds.getCenter();
  let rayon = 0;
  lieux.forEach(r => { rayon = Math.max(rayon, distM(centre.lat, centre.lng, r.lat, r.lon)); });
  rayon = Math.max(rayon*1.15, 900);
  coucheDepartement = L.circle(centre, {
    radius: rayon, color: accent, weight: 2, dashArray: '7 7',
    fillColor: accent, fillOpacity: 0, opacity: 0, interactive: false
  }).addTo(map);
  requestAnimationFrame(()=> requestAnimationFrame(()=>{
    if(coucheDepartement) coucheDepartement.setStyle({ opacity:1, fillOpacity:0.08 });
  }));
}

function retirerCoucheDepartement(){
  if(!coucheDepartement) return;
  const couche=coucheDepartement;
  coucheDepartement=null;
  couche.setStyle({ opacity:0, fillOpacity:0 });
  setTimeout(()=> map.removeLayer(couche), 260);
}
