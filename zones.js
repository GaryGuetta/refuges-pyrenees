// =============================================================================
// zones.js — Filtre l'affichage par grande zone : "France & Andorre" ou
// "Espagne". Une seule zone active à la fois. France & Andorre est affichée
// par défaut. Ne montrer qu'une zone garde la carte fluide (au lieu des
// 1600+ marqueurs d'un coup) et son contour est tracé en surbrillance.
// =============================================================================

// Régions sources rattachées à chaque zone
const ZONES = {
  'France & Andorre': ['Andorre', 'Occitanie', 'Nouvelle-Aquitaine'],
  'Espagne': ['Aragon', 'Catalonia', 'Navarre'],
};

let zoneActive = 'France & Andorre'; // affichée par défaut
let coucheZone = null;
let contoursZones = null;
let contoursChargement = null;

async function chargerContoursZones(){
  if(contoursZones) return contoursZones;
  if(!contoursChargement){
    contoursChargement = fetch('donnees-carte/zones-contours.geojson')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        contoursZones = {};
        (data?.features||[]).forEach(f => { contoursZones[f.properties.nom] = f; });
        return contoursZones;
      })
      .catch(e => { console.warn('Contours zones indisponibles:', e); contoursZones = {}; return contoursZones; });
  }
  return contoursChargement;
}

// À quelle zone appartient un refuge ?
function zoneDe(r){
  const region = r.region;
  for(const [zone, regions] of Object.entries(ZONES)){
    if(regions.includes(region)) return zone;
  }
  // par défaut, tout ce qui n'est pas espagnol est rattaché à France & Andorre
  return 'France & Andorre';
}

function rendreZones(){
  const box=document.getElementById('zones');
  if(!box) return;
  box.innerHTML = Object.keys(ZONES).map(nom=>{
    const n = REFUGES.filter(r=>zoneDe(r)===nom).length;
    return `<button class="zone-badge${zoneActive===nom?' actif':''}" onclick="choisirZone('${nom.replace(/'/g,"\\'")}')">
      ${nom} <span class="zone-n">${n}</span>
    </button>`;
  }).join('');
  chargerContoursZones();
}

async function choisirZone(nom){
  if(zoneActive===nom) return; // déjà active, rien à faire
  zoneActive = nom;
  recherche = '';
  const champ=document.getElementById('recherche'); if(champ) champ.value='';
  majMarqueursVisibles();
  appliquer();
  rendreZones();

  // recadre la carte sur la zone, sans dessiner de contour
  const contours = await chargerContoursZones();
  const feature = contours[nom];
  if(feature){
    const bounds = L.geoJSON(feature).getBounds();
    map.flyToBounds(bounds, { padding:[40,40], duration:.9 });
  }
}

function retirerCoucheZone(){
  if(!coucheZone) return;
  map.removeLayer(coucheZone);
  coucheZone=null;
}

// Cadre la carte sur la zone par défaut au chargement (sans contour)
async function initZoneParDefaut(zoneForcee){
  if(zoneForcee && ZONES[zoneForcee]) zoneActive = zoneForcee;
  rendreZones();
  majMarqueursVisibles();
  const contours = await chargerContoursZones();
  const feature = contours[zoneActive];
  if(feature){
    const bounds = L.geoJSON(feature).getBounds();
    map.flyToBounds(bounds, { padding:[40,40], duration:.7 });
  }
}
