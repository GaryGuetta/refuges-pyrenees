// =============================================================================
// importer-supabase.mjs — Importe api/refuges.json (généré par generer-api.mjs)
// dans la table Supabase `refuges`. Écrase les lignes existantes (par id),
// SAUF si elles ont été modifiées manuellement (modifie=true) : dans ce cas
// on ne touche qu'à la colonne `origine`, pour ne jamais perdre une édition.
//
// Nécessite les variables d'environnement :
//   SUPABASE_URL           (Project URL, voir Project Settings > API)
//   SUPABASE_SERVICE_ROLE  (service_role key — SECRÈTE, jamais dans le site)
//
// Usage :
//   1) node outils/generer-api.mjs        (rafraîchit api/refuges.json)
//   2) SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/importer-supabase.mjs
// =============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const URL = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE;

if (!URL || !CLE) {
  console.error('✗ Il faut définir SUPABASE_URL et SUPABASE_SERVICE_ROLE (variables d\'environnement).');
  process.exit(1);
}

const supabase = createClient(URL, CLE);

// L'API source renvoie parfois l'altitude avec une unité ("940m", "1 200 m"...)
// au lieu d'un nombre pur : on ne garde que les chiffres.
function entier(v){
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

async function main(){
  const brut = await readFile(path.join(RACINE, 'api', 'refuges.json'), 'utf8');
  const { refuges } = JSON.parse(brut);

  console.log(`Import de ${refuges.length} lieux…`);

  // Lignes déjà modifiées à la main → on ne touche pas leurs valeurs,
  // seulement leur copie "origine" (pour un futur reset toujours à jour).
  const { data: existants, error: errLecture } = await supabase
    .from('refuges').select('id, modifie');
  if (errLecture) { console.error('✗', errLecture.message); process.exit(1); }
  const modifies = new Set((existants || []).filter(r => r.modifie).map(r => r.id));

  const lignes = refuges.map(r => {
    const base = {
      id: r.id,
      altitude: entier(r.altitude),
      region: r.region,
      places: r.places,
      eau: r.eau,
      bois: r.bois,
      type_num: entier(r.type_num),
      categorie: r.categorie,
      description: r.description,
      lien: r.lien,
      origine: r,
      maj_le: new Date().toISOString(),
    };
    if (modifies.has(r.id)) {
      // Lieu édité par un visiteur : on ne remet à jour QUE l'origine,
      // pas les champs visibles (nom, lat, lon, etc.) déjà personnalisés.
      return { id: r.id, origine: r };
    }
    return { ...base, nom: r.nom, lat: r.lat, lon: r.lon, departement: null, eau_mois: null, modifie: false };
  });

  const { error } = await supabase.from('refuges').upsert(lignes, { onConflict: 'id' });
  if (error) { console.error('✗ Échec import :', error.message); process.exit(1); }

  console.log(`✓ ${lignes.length} lieux importés/mis à jour dans Supabase.`);
}

main();
