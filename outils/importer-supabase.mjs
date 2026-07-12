// =============================================================================
// importer-supabase.mjs — Importe donnees-carte/refuges-source.json (généré
// par generer-api.mjs) dans la table Supabase `refuges`. Écrase les lignes
// existantes (par id),
// SAUF si elles ont été modifiées manuellement (modifie=true) : dans ce cas
// on ne touche qu'à la colonne `origine`, pour ne jamais perdre une édition.
//
// Nécessite les variables d'environnement :
//   SUPABASE_URL           (Project URL, voir Project Settings > API)
//   SUPABASE_SERVICE_ROLE  (service_role key — SECRÈTE, jamais dans le site)
//
// Usage :
//   1) node outils/generer-api.mjs        (rafraîchit donnees-carte/refuges-source.json)
//   2) SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/importer-supabase.mjs
//   3) SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/generer-api-publique.mjs
//      (régénère l'API publique dans /api à partir de Supabase à jour)
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

async function chargerExistants(){
  const TAILLE_PAGE=1000;
  let debut=0, tous=[];
  while(true){
    const { data, error } = await supabase.from('refuges').select('id, modifie').range(debut,debut+TAILLE_PAGE-1);
    if (error) throw error;
    tous = tous.concat(data);
    if (data.length < TAILLE_PAGE) break;
    debut += TAILLE_PAGE;
  }
  return tous;
}

async function main(){
  const brut = await readFile(path.join(RACINE, 'donnees-carte', 'refuges-source.json'), 'utf8');
  const { refuges } = JSON.parse(brut);

  console.log(`Import de ${refuges.length} lieux…`);

  // Filet de sécurité : un nom manquant/vide ferait planter l'import
  // (colonne NOT NULL) — on corrige plutôt que d'échouer en bloc.
  let nomsManquants=0;
  refuges.forEach(r => { if(!r.nom || !r.nom.trim()){ r.nom = r.id || 'Sans nom'; nomsManquants++; } });
  if(nomsManquants) console.log(`⚠ ${nomsManquants} lieu(x) sans nom dans le JSON source — nom de secours utilisé.`);

  // Lignes déjà modifiées à la main → on ne touche pas leurs valeurs,
  // seulement leur copie "origine" (pour un futur reset toujours à jour).
  const existants = await chargerExistants();
  const modifies = new Set(existants.filter(r => r.modifie).map(r => r.id));

  const lignesCompletes = [];
  const misesAJourPartielles = [];
  for (const r of refuges){
    const base = {
      id: r.id,
      altitude: entier(r.altitude),
      region: r.region,
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
      // Lieu édité par un visiteur : on ne remet à jour QUE l'origine, à part
      // (jamais mélangée avec les lignes complètes dans le même envoi groupé —
      // Supabase mettrait sinon "nom" à NULL pour tout le lot).
      misesAJourPartielles.push({ id:r.id, origine:r });
    } else {
      lignesCompletes.push({ ...base, nom: r.nom, lat: r.lat, lon: r.lon, departement: null, eau_mois: null, modifie: false });
    }
  }

  // 1) Import/mise à jour groupée des lieux non modifiés (lignes uniformes)
  const TAILLE_LOT=300;
  let ok=0, echecs=0;
  for(let i=0;i<lignesCompletes.length;i+=TAILLE_LOT){
    const lot=lignesCompletes.slice(i,i+TAILLE_LOT);
    const { error } = await supabase.from('refuges').upsert(lot, { onConflict: 'id' });
    if (error){
      console.error(`\n✗ Échec du lot ${i}-${i+lot.length} (${error.message}) — recherche de la ligne fautive…`);
      // Retente une par une pour identifier précisément le/les coupable(s)
      for (const ligne of lot){
        const { error: errUne } = await supabase.from('refuges').upsert([ligne], { onConflict: 'id' });
        if (errUne){
          echecs++;
          console.error(`  ✗ ${ligne.id} :`, errUne.message);
          console.error('    contenu :', JSON.stringify(ligne));
        } else ok++;
      }
    } else {
      ok+=lot.length;
      process.stdout.write(`\r  ${ok}/${lignesCompletes.length} importés…`);
    }
  }
  console.log('');

  // 2) Rafraîchissement de l'origine, un par un, pour les lieux déjà édités
  //    (jamais mélangés au lot ci-dessus)
  let okPartiel=0, echecsPartiel=0;
  for (const p of misesAJourPartielles){
    const { error } = await supabase.from('refuges').update({ origine:p.origine }).eq('id', p.id);
    if (error) echecsPartiel++; else okPartiel++;
  }
  if (misesAJourPartielles.length) console.log(`  ${okPartiel}/${misesAJourPartielles.length} lieux déjà édités : origine rafraîchie.`);

  console.log(`\n✓ ${ok+okPartiel} lignes traitées${(echecs+echecsPartiel)?`, ✗ ${echecs+echecsPartiel} en échec`:''}.`);
}

main();
