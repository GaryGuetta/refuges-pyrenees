// =============================================================================
// corriger-altitudes.mjs — Lit le rapport produit par auditer-sources.mjs et
// génère un fichier SQL pour corriger UNIQUEMENT les altitudes où les deux
// sources externes s'accordent entre elles contre notre base.
//
// NE MODIFIE RIEN : produit un fichier .sql que tu relis avant de l'exécuter.
//
// Pourquoi cette règle stricte : refuges.info et OpenStreetMap sont deux bases
// indépendantes. Qu'elles tombent sur la même valeur au mètre près est un
// signal fort. À l'inverse, une source seule qui nous contredit ne prouve rien
// (cf. Cabane Boutas : OSM dit 615 m, refuges.info et nous disons 1585 —
// c'est OSM qui se trompe).
//
// Usage :
//   node outils/corriger-altitudes.mjs
//   node outils/corriger-altitudes.mjs --tolerance=10   (accord des sources à ±10 m)
//   node outils/corriger-altitudes.mjs --ecart-min=50   (ne corrige que si écart ≥ 50 m)
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RACINE, 'outils', 'audit-sources.json');
const DEST = path.join(RACINE, 'outils', 'corriger-altitudes.sql');

const arg = (nom, defaut) => {
  const t = process.argv.find(a => a.startsWith(`--${nom}=`));
  return t ? Number(t.split('=')[1]) : defaut;
};
// Écart maximum toléré ENTRE les deux sources pour les considérer d'accord.
// 0 = elles doivent dire exactement la même chose.
const TOLERANCE = arg('tolerance', 5);
// Écart minimum avec notre valeur pour que la correction vaille la peine.
const ECART_MIN = arg('ecart-min', 30);

// Échappe une valeur texte pour SQL (doublement des apostrophes)
const sqlTxt = s => "'" + String(s).replace(/'/g, "''") + "'";

let rapport;
try {
  rapport = JSON.parse(await readFile(SRC, 'utf8'));
} catch (e) {
  console.error(`✗ Impossible de lire ${path.relative(RACINE, SRC)}`);
  console.error('  Lance d\'abord :  node outils/auditer-sources.mjs --json');
  process.exit(1);
}

const candidats = [];
const rejets = [];

for (const l of rapport.ecarts_altitude || []) {
  const ri = l.refuges_info?.alt ?? null;
  const osm = l.osm?.alt ?? null;
  const nous = l.alt_base;

  if (nous == null) continue;

  // Règle : il faut DEUX sources avec une altitude.
  if (ri == null || osm == null) {
    rejets.push({ ...l, raison: 'une seule source a une altitude' });
    continue;
  }

  // Règle : les deux sources doivent être d'accord entre elles.
  if (Math.abs(ri - osm) > TOLERANCE) {
    rejets.push({ ...l, raison: `sources en désaccord (${ri} vs ${osm})` });
    continue;
  }

  // Valeur retenue : la moyenne (identiques dans l'immense majorité des cas).
  const valeur = Math.round((ri + osm) / 2);
  const ecart = Math.abs(valeur - nous);

  if (ecart < ECART_MIN) {
    rejets.push({ ...l, raison: `écart trop faible (${ecart} m)` });
    continue;
  }

  candidats.push({ id: l.id, nom: l.nom, ancienne: nous, nouvelle: valeur, ecart, ri, osm });
}

candidats.sort((a, b) => b.ecart - a.ecart);

// ── Affichage ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(74));
console.log('  CORRECTIONS PROPOSÉES — les 2 sources sont d\'accord contre notre base');
console.log('═'.repeat(74));
console.log(`  Règles : sources d'accord à ±${TOLERANCE} m, écart avec nous ≥ ${ECART_MIN} m\n`);

if (!candidats.length) {
  console.log('  Aucune correction ne remplit ces critères.\n');
  process.exit(0);
}

console.log(`  ${'REFUGE'.padEnd(38)} ${'ACTUEL'.padStart(7)} → ${'CORRIGÉ'.padStart(7)}   ÉCART`);
console.log('  ' + '─'.repeat(70));
for (const c of candidats) {
  console.log(`  ${(c.nom || '?').slice(0, 38).padEnd(38)} ${String(c.ancienne).padStart(5)} m → ${String(c.nouvelle).padStart(5)} m   ${String(c.ecart).padStart(4)} m`);
}
console.log(`\n  ${candidats.length} corrections retenues, ${rejets.length} écartées.`);

// Montre quelques rejets pour que la logique soit lisible
const parRaison = {};
for (const r of rejets) {
  const cle = r.raison.replace(/\(.*\)/, '(…)');
  (parRaison[cle] ||= []).push(r);
}
if (Object.keys(parRaison).length) {
  console.log('\n  Écartées, par motif :');
  for (const [raison, arr] of Object.entries(parRaison)) {
    console.log(`    · ${arr.length.toString().padStart(3)} — ${raison}`);
    arr.slice(0, 2).forEach(r => {
      const ri = r.refuges_info?.alt ?? '—', osm = r.osm?.alt ?? '—';
      console.log(`          ex : ${(r.nom || '?').slice(0, 30)} (nous ${r.alt_base}, ri ${ri}, osm ${osm})`);
    });
  }
}

// ── Génération du SQL ────────────────────────────────────────────────────────
const lignes = [];
lignes.push('-- =============================================================================');
lignes.push('-- corriger-altitudes.sql');
lignes.push(`-- Généré le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} par outils/corriger-altitudes.mjs`);
lignes.push('--');
lignes.push('-- Corrige les altitudes où refuges.info ET OpenStreetMap s\'accordent');
lignes.push('-- entre eux (±' + TOLERANCE + ' m) contre notre valeur, avec un écart ≥ ' + ECART_MIN + ' m.');
lignes.push('--');
lignes.push('-- Ces deux sources sont indépendantes l\'une de l\'autre et de la nôtre.');
lignes.push('-- Les cas où une seule source nous contredit ont été volontairement');
lignes.push('-- écartés : ils sont souvent dus à une erreur de leur côté.');
lignes.push('--');
lignes.push('-- À FAIRE AVANT : relis la liste. À FAIRE APRÈS : git push, pour que les');
lignes.push('-- pages statiques /refuge/xxx se régénèrent avec les bonnes valeurs.');
lignes.push('-- =============================================================================');
lignes.push('');
lignes.push('begin;');
lignes.push('');

for (const c of candidats) {
  lignes.push(`-- ${c.nom}  (refuges.info : ${c.ri} m, OSM : ${c.osm} m)`);
  lignes.push(`update refuges set altitude = ${c.nouvelle}, maj_le = now()`);
  lignes.push(`  where id = ${sqlTxt(c.id)} and altitude = ${c.ancienne};`);
  lignes.push('');
}

lignes.push('-- Vérifie le nombre de lignes touchées avant de valider.');
lignes.push(`-- Attendu : ${candidats.length} ligne(s).`);
lignes.push('-- Si le compte est bon :  commit;');
lignes.push('-- Sinon :                 rollback;');
lignes.push('');
lignes.push('commit;');
lignes.push('');

await writeFile(DEST, lignes.join('\n'), 'utf8');

console.log('\n' + '═'.repeat(74));
console.log(`  SQL écrit dans : ${path.relative(RACINE, DEST)}`);
console.log('  Relis-le, puis colle-le dans Supabase → SQL Editor.');
console.log('═'.repeat(74) + '\n');
