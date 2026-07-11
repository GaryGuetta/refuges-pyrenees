// =============================================================================
// completer-donnees-csv.mjs — Rapproche un CSV externe (colonnes : URL, Nom,
// Type, Departement, Ville, Cap été, Cap hiver, Cheminée, Bois, Eau, Couchage,
// Rando) avec la table Supabase `refuges`, par nom + département, et complète
// les colonnes ville / cap_ete / cap_hiver / cheminee / couchage / rando.
//
// Ne touche JAMAIS aux champs déjà gérés ailleurs (nom, lat, lon, eau, bois,
// description...) — uniquement les nouvelles colonnes complémentaires.
//
// Usage :
//   1) Rapport seul, RIEN n'est modifié en base (à faire en premier) :
//      SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/completer-donnees-csv.mjs chemin/vers/fichier.csv
//
//   2) Une fois le rapport vérifié, applique les correspondances sûres :
//      SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/completer-donnees-csv.mjs chemin/vers/fichier.csv --appliquer
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE;
const cheminCsv = process.argv[2];
const APPLIQUER = process.argv.includes('--appliquer');

if (!URL || !CLE) {
  console.error('✗ Il faut définir SUPABASE_URL et SUPABASE_SERVICE_ROLE.');
  process.exit(1);
}
if (!cheminCsv) {
  console.error('✗ Usage : node outils/completer-donnees-csv.mjs chemin/vers/fichier.csv [--appliquer]');
  process.exit(1);
}

const supabase = createClient(URL, CLE);

function normaliser(s){
  return (s||'').toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}
function normaliserDept(s){
  return normaliser(s).replace(/s$/,''); // tolère singulier/pluriel (atlantique/atlantiques)
}
function entierOuNull(v){
  if (v===null||v===undefined||v==='') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g,''),10);
  return Number.isFinite(n) ? n : null;
}

// Parseur CSV simple (gère les guillemets et virgules internes)
function parseCsv(texte){
  const lignes = [];
  let ligne = [], champ = '', dansGuillemets = false;
  for (let i=0;i<texte.length;i++){
    const c = texte[i], suivant = texte[i+1];
    if (dansGuillemets){
      if (c === '"' && suivant === '"'){ champ+='"'; i++; }
      else if (c === '"'){ dansGuillemets=false; }
      else champ += c;
    } else {
      if (c === '"') dansGuillemets = true;
      else if (c === ','){ ligne.push(champ); champ=''; }
      else if (c === '\n'){ ligne.push(champ); lignes.push(ligne); ligne=[]; champ=''; }
      else if (c === '\r'){ /* ignore */ }
      else champ += c;
    }
  }
  if (champ.length || ligne.length){ ligne.push(champ); lignes.push(ligne); }
  return lignes.filter(l => l.length>1 || l[0]!=='');
}

async function chargerRefugesSupabase(){
  const TAILLE_PAGE=1000;
  let debut=0, tous=[];
  while(true){
    const { data, error } = await supabase.from('refuges').select('id,nom,region,departement').range(debut,debut+TAILLE_PAGE-1);
    if (error) throw error;
    tous = tous.concat(data);
    if (data.length < TAILLE_PAGE) break;
    debut += TAILLE_PAGE;
  }
  return tous;
}

async function main(){
  const texteCsv = (await readFile(path.resolve(cheminCsv), 'utf8')).replace(/^\uFEFF/,'');
  const lignes = parseCsv(texteCsv);
  const entetes = lignes[0].map(h=>h.trim());
  const idx = nom => entetes.indexOf(nom);
  const iNom=idx('Nom'), iDept=idx('Departement'), iVille=idx('Ville'),
        iCapEte=idx('Cap été'), iCapHiver=idx('Cap hiver'), iChem=idx('Cheminée'),
        iCouchage=idx('Couchage'), iRando=idx('Rando');

  const csvRows = lignes.slice(1).map(l => ({
    nom: l[iNom], departement: l[iDept], ville: l[iVille],
    capEte: l[iCapEte], capHiver: l[iCapHiver], cheminee: l[iChem],
    couchage: l[iCouchage], rando: l[iRando]
  })).filter(r => r.nom);

  console.log(`CSV lu : ${csvRows.length} lignes.`);
  console.log('Chargement des refuges Supabase…');
  const refuges = await chargerRefugesSupabase();
  console.log(`${refuges.length} refuges en base.\n`);

  // Index nom normalisé → liste de refuges candidats
  const index = new Map();
  for (const r of refuges){
    const cle = normaliser(r.nom);
    if (!index.has(cle)) index.set(cle, []);
    index.get(cle).push(r);
  }

  const matchUnique = [], matchDept = [], ambigus = [], nonTrouves = [];

  for (const row of csvRows){
    const candidats = index.get(normaliser(row.nom)) || [];
    if (candidats.length === 0){ nonTrouves.push(row); continue; }
    if (candidats.length === 1){ matchUnique.push({row, refuge:candidats[0]}); continue; }
    // plusieurs refuges portent ce nom → on tente de départager par département
    const ndept = normaliserDept(row.departement);
    const parDept = candidats.filter(c => normaliserDept(c.departement).includes(ndept) || ndept.includes(normaliserDept(c.departement)));
    if (parDept.length === 1){ matchDept.push({row, refuge:parDept[0]}); }
    else { ambigus.push({row, candidats}); }
  }

  const aAppliquer = [...matchUnique, ...matchDept].filter(({row}) =>
    row.ville || row.capEte || row.capHiver || row.cheminee || row.couchage || row.rando
  );

  // ---- Rapport ----
  const rapport = {
    total_csv: csvRows.length,
    correspondance_unique: matchUnique.length,
    correspondance_par_departement: matchDept.length,
    ambigues: ambigus.length,
    non_trouvees: nonTrouves.length,
    a_appliquer_avec_donnees: aAppliquer.length,
    detail_ambigues: ambigus.slice(0,30).map(a => ({
      nom_csv: a.row.nom, departement_csv: a.row.departement,
      candidats: a.candidats.map(c=>({id:c.id, nom:c.nom, departement:c.departement}))
    })),
    detail_non_trouvees: nonTrouves.slice(0,50).map(r => ({ nom: r.nom, departement: r.departement }))
  };
  await writeFile(path.join(RACINE,'outils','rapport-completion.json'), JSON.stringify(rapport, null, 2));

  console.log('── Rapport ──');
  console.log(`Correspondance directe (nom unique)     : ${matchUnique.length}`);
  console.log(`Correspondance via département          : ${matchDept.length}`);
  console.log(`Ambiguës (plusieurs candidats, ignorées) : ${ambigus.length}`);
  console.log(`Non trouvées (souvent hors zone FR/AD)   : ${nonTrouves.length}`);
  console.log(`→ Lignes avec au moins une donnée à écrire : ${aAppliquer.length}`);
  console.log(`\nDétail complet écrit dans outils/rapport-completion.json`);

  if (!APPLIQUER){
    console.log('\nMode RAPPORT uniquement — rien n\'a été modifié dans Supabase.');
    console.log('Relance avec --appliquer pour écrire les', aAppliquer.length, 'lignes correspondantes.');
    return;
  }

  console.log(`\nApplication de ${aAppliquer.length} mises à jour…`);
  let ok=0, echecs=0;
  for (const {row, refuge} of aAppliquer){
    const { error } = await supabase.from('refuges').update({
      ville: row.ville || null,
      cap_ete: entierOuNull(row.capEte),
      cap_hiver: entierOuNull(row.capHiver),
      cheminee: row.cheminee || null,
      couchage: row.couchage || null,
      rando: row.rando || null,
    }).eq('id', refuge.id);
    if (error){ echecs++; console.warn('\n✗', refuge.nom, error.message); }
    else ok++;
    process.stdout.write(`\r  ${ok+echecs}/${aAppliquer.length} traités (${ok} ok, ${echecs} échecs)…`);
  }
  console.log(`\n\n✓ ${ok} lignes mises à jour, ${echecs} échecs.`);
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
