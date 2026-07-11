// =============================================================================
// departements.js — Badges de filtre par département/région. Sélectionner un
// badge zoome sur la zone et l'entoure d'un cercle en surbrillance, comme le
// halo affiché autour d'un refuge sélectionné.
// =============================================================================

let departementActif = null;
let cercleDepartement = null;

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
}

function toggleDepartement(nom){
  if(departementActif===nom){
    // déjà sélectionné → on désélectionne et on revient à la vue d'ensemble
    departementActif=null;
    recherche='';
    const champ=document.getElementById('recherche'); if(champ) champ.value='';
    if(cercleDepartement){ map.removeLayer(cercleDepartement); cercleDepartement=null; }
    appliquer();
    rendreDepartements();
    return;
  }

  departementActif=nom;
  recherche=nom;
  const champ=document.getElementById('recherche'); if(champ) champ.value=nom;
  appliquer();

  const lieux = REFUGES.filter(r => (r.departement||r.region)===nom);
  if(lieux.length===0){ rendreDepartements(); return; }

  const bounds = L.latLngBounds(lieux.map(r=>[r.lat,r.lon]));
  map.flyToBounds(bounds, { padding:[70,70], duration:.9 });

  if(cercleDepartement) map.removeLayer(cercleDepartement);
  const centre = bounds.getCenter();
  let rayon = 0;
  lieux.forEach(r => { rayon = Math.max(rayon, distM(centre.lat, centre.lng, r.lat, r.lon)); });
  rayon = Math.max(rayon*1.15, 900);

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f0a04b';
  cercleDepartement = L.circle(centre, {
    radius: rayon, color: accent, weight: 2, dashArray: '7 7',
    fillColor: accent, fillOpacity: 0.08, interactive: false
  }).addTo(map);

  rendreDepartements();
}
