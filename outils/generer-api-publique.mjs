// =============================================================================
// generer-api-publique.mjs — Génère l'API publique dans /api à partir de la
// table Supabase `refuges` (la vraie source de vérité : données d'origine +
// corrections communautaires + enrichissement CSV + Espagne/Andorre/Navarre).
//
// Chaque refuge inclut un champ "url" prêt à l'emploi : le lien direct vers
// sa fiche sur la carte interactive. C'est ce champ qu'un site tiers utilise
// pour faire un bouton "Voir ce refuge" qui redirige au bon endroit.
//
// À la différence de outils/generer-api.mjs (qui interroge pyrenees-refuges.com
// et sert à ALIMENTER Supabase via importer-supabase.mjs), ce script-ci lit
// Supabase et sert à PUBLIER l'API que les autres sites consomment.
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/generer-api-publique.mjs
// (la clé anon publique fonctionne aussi, en lecture seule c'est suffisant)
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_API = path.join(RACINE, 'api');
const URL_SITE = process.env.URL_SITE || 'https://refuges-pyrenees.vercel.app';

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_CLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_CLE) {
  console.error('✗ Il faut définir SUPABASE_URL et SUPABASE_SERVICE_ROLE (ou SUPABASE_ANON_KEY).');
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_CLE);

const TYPE_LABEL = {
  1:'Cabane fermée', 2:'Cabane ouverte',
  3:"Cabane ouverte, occupée par le berger l'été",
  4:'Orri, toue, abri en pierre',
  5:"Refuge gardé l'été, partie hivernale",
  6:"Refuge gardé toute l'année", 7:'Ruine'
};

function slug(s){
  return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
}

async function chargerTousLesRefuges(){
  const TAILLE_PAGE = 1000;
  let debut = 0, tous = [];
  while (true) {
    const { data, error } = await supabase.from('refuges').select('*').range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    tous = tous.concat(data);
    if (data.length < TAILLE_PAGE) break;
    debut += TAILLE_PAGE;
  }
  return tous;
}

// Forme publique d'un refuge : champs utiles à un consommateur externe,
// avec l'URL de redirection prête à l'emploi.
function versPublic(r){
  return {
    id: r.id,
    url: `${URL_SITE}/carte.html?refuge=${encodeURIComponent(r.id)}`,
    nom: r.nom,
    lat: r.lat,
    lon: r.lon,
    altitude: r.altitude,
    region: r.region,
    departement: r.departement,
    ville: r.ville,
    type_num: r.type_num,
    type_libelle: TYPE_LABEL[r.type_num] || null,
    categorie: r.categorie,
    places: r.cap_ete!=null || r.cap_hiver!=null ? { ete:r.cap_ete, hiver:r.cap_hiver } : null,
    eau: r.eau,
    bois: r.bois,
    cheminee: r.cheminee,
    couchage: r.couchage,
    eau_mois: r.eau_mois,
    description: r.description,
    rando: r.rando,
    lien_source: r.lien,
    modifie_par_la_communaute: !!r.modifie,
    maj_le: r.maj_le,
  };
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
  console.log('Génération de l’API publique depuis Supabase…');
  await mkdir(DOSSIER_API, { recursive: true });

  const brut = await chargerTousLesRefuges();
  const tous = brut.filter(r => r.lat!=null && r.lon!=null).map(versPublic);
  console.log(`  ${tous.length} lieux chargés.`);

  const regions = [...new Set(tous.map(r => r.region).filter(Boolean))];
  const meta = {
    source: 'Refuges des Pyrénées — base communautaire (origine : pyrenees-refuges.com)',
    licence: 'Merci de conserver l’attribution et de créditer refuges-pyrenees en cas de réutilisation.',
    genere_le: new Date().toISOString(),
    nombre: tous.length,
    regions,
    categories: { refuge:'Refuge gardé', cabane:'Cabane / abri', ruine:'Ruine', fermee:'Fermée (édition manuelle)' },
    usage: "Chaque refuge inclut un champ \"url\" : lien direct vers sa fiche sur la carte interactive, prêt à l'emploi pour un bouton de redirection depuis un site tiers."
  };

  await writeFile(path.join(DOSSIER_API,'refuges.json'),
    JSON.stringify({ meta, refuges: tous }, null, 1));
  await writeFile(path.join(DOSSIER_API,'refuges.geojson'),
    JSON.stringify(versGeoJSON(tous)));

  for (const region of regions){
    const sel = tous.filter(r => r.region === region);
    await writeFile(path.join(DOSSIER_API, `refuges-${slug(region)}.json`),
      JSON.stringify({ meta: { ...meta, nombre: sel.length, regions:[region] }, refuges: sel }, null, 1));
  }
  for (const cat of ['refuge','libre','cabane','ruine']){
    const sel = tous.filter(r => r.categorie === cat);
    await writeFile(path.join(DOSSIER_API, `refuges-cat-${cat}.json`),
      JSON.stringify({ meta: { ...meta, nombre: sel.length }, refuges: sel }, null, 1));
  }

  // Table de correspondance légère id → url, pratique pour un site tiers qui
  // veut juste "le lien du refuge X" sans charger toute la fiche.
  const urls = Object.fromEntries(tous.map(r => [r.id, r.url]));
  await writeFile(path.join(DOSSIER_API, 'urls.json'), JSON.stringify(urls, null, 1));

  console.log(`\n✓ API publique générée dans /api — ${tous.length} lieux, ${3 + regions.length + 4} fichiers.`);
}

main().catch(e => { console.error('\n✗ Échec :', e.message); process.exit(1); });
