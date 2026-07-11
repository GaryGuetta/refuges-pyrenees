// =============================================================================
// generer-api.mjs — Génère l'API statique dans /api à partir des données
// live de pyrenees-refuges.com (mêmes règles de normalisation que le site).
//
// Usage :  node outils/generer-api.mjs
// À relancer avant chaque déploiement pour rafraîchir les données.
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_API = path.join(RACINE, 'api');

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

function versGeoJSON(refuges){
  return {
    type: 'FeatureCollection',
    features: refuges.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat, r.altitude ?? undefined].filter(v => v !== undefined) },
      properties: Object.fromEntries(Object.entries(r).filter(([k]) => !['lat','lon'].includes(k)))
    }))
  };
}

async function main(){
  console.log('Génération de l’API statique…');
  await mkdir(DOSSIER_API, { recursive: true });

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
    categories: { refuge:'Refuge gardé', libre:'Cabane ouverte', cabane:'Cabane / abri', ruine:'Ruine' }
  };

  // Endpoint principal
  await writeFile(path.join(DOSSIER_API,'refuges.json'),
    JSON.stringify({ meta, refuges: tous }, null, 1));
  // GeoJSON
  await writeFile(path.join(DOSSIER_API,'refuges.geojson'),
    JSON.stringify(versGeoJSON(tous)));
  // Par région
  for (const region of REGIONS){
    await writeFile(path.join(DOSSIER_API, `refuges-${slug(region)}.json`),
      JSON.stringify({ meta: { ...meta, nombre: parRegion[region].length, regions:[region] }, refuges: parRegion[region] }, null, 1));
  }
  // Par catégorie
  for (const cat of ['refuge','libre','cabane','ruine']){
    const sel = tous.filter(r => r.categorie === cat);
    await writeFile(path.join(DOSSIER_API, `refuges-cat-${cat}.json`),
      JSON.stringify({ meta: { ...meta, nombre: sel.length }, refuges: sel }, null, 1));
  }

  console.log(`\n✓ API générée dans /api — ${tous.length} lieux, ${3 + REGIONS.length + 4} fichiers.`);
}

main().catch(e => { console.error('\n✗ Échec :', e.message); process.exit(1); });
