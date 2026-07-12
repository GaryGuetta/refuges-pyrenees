// =============================================================================
// ajout-refuge.js — Permet à un compte connecté de proposer un NOUVEAU lieu :
// clic sur la carte pour le placer, puis formulaire pour ses infos. Écrit
// directement dans Supabase (RLS : réservé aux comptes connectés, voir
// outils/schema-supabase.sql, policy "creation par compte connecte").
// =============================================================================

let modeAjout = false;
let coordsNouveauRefuge = null;

function toggleModeAjout(){
  if(!estConnecte()){
    alert("Connecte-toi d'abord pour ajouter un refuge (bouton profil en haut à droite).");
    return;
  }
  modeAjout = !modeAjout;
  document.getElementById('bandeau-ajout').classList.toggle('actif', modeAjout);
  document.querySelector('.btn-ajouter-refuge').classList.toggle('actif', modeAjout);
  document.getElementById('map').style.cursor = modeAjout ? 'crosshair' : '';
}

// Appelé depuis carte.js (onClickCarte) quand modeAjout est actif, à la
// place de la recherche de point d'eau habituelle.
function demarrerAjoutRefuge(lat, lon){
  modeAjout = false;
  document.getElementById('bandeau-ajout').classList.remove('actif');
  document.querySelector('.btn-ajouter-refuge').classList.remove('actif');
  document.getElementById('map').style.cursor = '';

  coordsNouveauRefuge = { lat, lon };
  document.getElementById('a-nom').value = '';
  document.getElementById('a-alt').value = '';
  document.getElementById('a-type').value = 'cabane';
  document.getElementById('a-eau').value = '';
  document.getElementById('a-bois').value = '';
  document.getElementById('a-ville').value = '';
  document.getElementById('a-cheminee').value = '';
  document.getElementById('a-lat').value = lat.toFixed(5);
  document.getElementById('a-lon').value = lon.toFixed(5);
  document.getElementById('a-desc').value = '';
  document.getElementById('overlay-ajout').classList.add('ouvert');
}

function fermerFormulaireAjout(){
  document.getElementById('overlay-ajout').classList.remove('ouvert');
  coordsNouveauRefuge = null;
}

async function enregistrerNouveauRefuge(){
  if(!estConnecte()){ alert("Connecte-toi d'abord."); return; }

  const nom = document.getElementById('a-nom').value.trim();
  const lat = parseFloat(document.getElementById('a-lat').value);
  const lon = parseFloat(document.getElementById('a-lon').value);
  if(!nom){ alert("Le nom du lieu est obligatoire."); return; }
  if(isNaN(lat) || isNaN(lon)){ alert("Coordonnées invalides."); return; }

  const alt = parseInt(document.getElementById('a-alt').value) || null;
  const cat = document.getElementById('a-type').value;
  const eau = document.getElementById('a-eau').value || null;
  const bois = document.getElementById('a-bois').value || null;
  const ville = document.getElementById('a-ville').value.trim() || null;
  const cheminee = document.getElementById('a-cheminee').value || null;
  const desc = document.getElementById('a-desc').value.trim() || null;

  const region = 'Occitanie'; // par défaut ; departementDe() affine l'affichage ensuite
  const departement = departementDe(lat, lon);
  const id = slug(`${nom}-${lat.toFixed(4)}-${lon.toFixed(4)}`);

  const ligne = {
    id, nom, lat, lon, altitude: alt, categorie: cat, region, departement,
    eau, bois, ville, cheminee, description: desc,
    modifie: true, maj_le: new Date().toISOString(),
  };

  const { data, error } = await supabaseClient.from('refuges').insert(ligne).select().single();
  if(error){
    alert("Impossible d'ajouter ce refuge : " + error.message);
    return;
  }

  // Ajout immédiat côté client, sans recharger toute la page
  const r = {
    id: data.id, nom: data.nom, lat: data.lat, lon: data.lon, alt: data.altitude,
    region: data.region, departement: data.departement, ville: data.ville,
    eau: data.eau, bois: data.bois, eauMois: null, typeNum: null, cat: data.categorie,
    desc: data.description, lien: null, modifie: true, cheminee: data.cheminee,
    capEte: null, capHiver: null, couchage: null, rando: null,
  };
  const i = REFUGES.length;
  r._i = i;
  r._cle = `${r.nom}|${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
  REFUGES.push(r);

  const m = L.marker([r.lat, r.lon], { icon: iconeRefuge(r) });
  m.on('click', () => selectionner(i, true));
  marqueurs[i] = m;
  if(typeof zoneDe === 'function' && zoneDe(r) === zoneActive) cluster.addLayer(m);

  document.getElementById('s-total').textContent = REFUGES.length;
  if(typeof rendreZones === 'function') rendreZones();

  fermerFormulaireAjout();
  appliquer();
  map.flyTo([r.lat, r.lon], Math.max(map.getZoom(), 13), { duration:.8 });
  setTimeout(() => selectionner(i, false), 500);
}
