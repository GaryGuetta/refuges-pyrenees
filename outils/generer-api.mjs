// =============================================================================
// generer-api.mjs — Récupère les données FRAÎCHES depuis pyrenees-refuges.com
// (le site source d'origine). Sert UNIQUEMENT à ALIMENTER/rafraîchir la table
// Supabase via outils/importer-supabase.mjs — ce n'est PAS l'API publique du
// site (pour ça, voir outils/generer-api-publique.mjs, qui lit Supabase et
// inclut les corrections communautaires + l'enrichissement CSV + le champ url).
//
// Usage :  node outils/generer-api.mjs
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_SORTIE = path.join(RACINE, 'donnees-carte');

const REGIONS = ['Andorre', 'Occitanie', 'Nouvelle-Aquitaine', 'Aragon', 'Catalonia', 'Navarre'];

const TYPE_LABEL = {
  1:'Cabane fermée', 2:'Cabane ouverte',
  3:"Cabane ouverte, occupée par le berger l'été",
  4:'Orri, toue, abri en pierre',
  5:"Refuge gardé l'été, partie hivernale",
  6:"Refuge gardé toute l'année", 7:'Ruine'
};

function categorie(t){
  t = +t;
  if (t===5 || t===6) return 'refuge';
  if (t===2 || t===3) return 'libre';
  if (t===1 || t===4) return 'cabane';
  if (t===7) return 'ruine';
  return 'cabane';
}

function lireCoord(g){
  if (g?.type === 'Point') return { lon:g.coordinates[0], lat:g.coordinates[1], alt:g.coordinates[2] };
  return null;
}

function slug(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
}

async function chargerRegion(region){
  const url = `https://www.pyrenees-refuges.com/api.php?type_fichier=GEOJSON&region=${encodeURIComponent(region)}`;
  const rep = await fetch(url, { headers: { 'User-Agent': 'RefugesPyrenees-API-Builder/1.0 (+site statique)' } });
  if (!rep.ok) throw new Error(`${region} → HTTP ${rep.status}`);
  const data = await rep.json();

  return (data.features || []).map(f => {
    const c = lireCoord(f.geometry);
    if (!c) return null;
    const p = f.properties || {};
    const t = p.type_lieu ?? p.type ?? p.categorie;
    const desc = (p.description || p.commentaire || p.info || '')
      .toString().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

    return {
      id: slug(`${p.nom || p.name || 'sans-nom'}-${c.lat.toFixed(4)}-${c.lon.toFixed(4)}`),
      nom: p.nom || p.name || p.title || 'Sans nom',
      lat: c.lat,
      lon: c.lon,
      altitude: p.altitude || p.alt || (c.alt ? Math.round(c.alt) : null),
      region,
      places: p.places || p.capacite || null,
      eau: p.eau || p.eau_proximite || p.point_eau || p.water || null,
      bois: p.bois || p.bois_proximite || p.foret || p.wood || null,
      type_num: +t || null,
      type_libelle: TYPE_LABEL[+t] || null,
      categorie: categorie(t),
      description: desc || null,
      lien: p.url || p.lien || null
    };
  }).filter(Boolean).filter(r => r.lat && r.lon);
}

async function main(){
  console.log('Récupération des données fraîches depuis pyrenees-refuges.com…');
  await mkdir(DOSSIER_SORTIE, { recursive: true });

  const parRegion = {};
  for (const region of REGIONS){
    process.stdout.write(`  ${region}… `);
    parRegion[region] = await chargerRegion(region);
    console.log(`${parRegion[region].length} lieux`);
  }

  const tous = Object.values(parRegion).flat();
  const meta = {
    source: 'pyrenees-refuges.com',
    licence: 'Données © pyrenees-refuges.com — merci de conserver l’attribution',
    genere_le: new Date().toISOString(),
    nombre: tous.length,
    regions: REGIONS,
  };

  // Fichier de staging, lu par outils/importer-supabase.mjs — pas l'API
  // publique du site (voir outils/generer-api-publique.mjs pour ça).
  await writeFile(path.join(DOSSIER_SORTIE,'refuges-source.json'),
    JSON.stringify({ meta, refuges: tous }, null, 1));

  console.log(`\n✓ Snapshot source écrit dans donnees-carte/refuges-source.json — ${tous.length} lieux.`);
  console.log('  Prochaine étape : node outils/importer-supabase.mjs');
}

main().catch(e => { console.error('\n✗ Échec :', e.message); process.exit(1); });
