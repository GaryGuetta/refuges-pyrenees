// =============================================================================
// auditer-sources.mjs — Compare la base Supabase à deux sources INDÉPENDANTES
// (refuges.info et OpenStreetMap) et signale les écarts sur les faits
// mesurables : altitude, position, lieux absents.
//
// LECTURE SEULE : ce script ne modifie jamais la base ni le site. Il produit
// un rapport que tu lis pour décider quoi corriger à la main.
//
// Pourquoi ces deux sources et pas plus : elles sont généalogiquement
// distinctes de pyrenees-refuges.com (notre source d'origine). Ajouter un
// site qui recopie déjà pyrenees-refuges.com ne prouverait rien — trois
// copies d'une même erreur restent une erreur.
//
// Aucune donnée n'est copiée depuis ces sources : on ne fait que comparer des
// faits bruts (coordonnées, altitude), ce qui ne relève pas du droit d'auteur.
// Si un jour tu veux afficher leur contenu (descriptions, commentaires), il
// faudra alors respecter leurs licences : CC BY-SA pour refuges.info
// ("©Les contributeurs de Refuges.info"), ODbL pour OpenStreetMap.
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/auditer-sources.mjs
//
// Options :
//   --ecart-alt=30   seuil d'alerte sur l'altitude, en mètres (défaut : 30)
//   --rayon=150      distance max pour considérer que deux fiches parlent du
//                    même lieu, en mètres (défaut : 150)
//   --json           écrit aussi un rapport détaillé dans outils/audit-sources.json
// =============================================================================

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_CLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_CLE) {
  console.error('✗ Il faut définir SUPABASE_URL et SUPABASE_SERVICE_ROLE (ou SUPABASE_ANON_KEY).');
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_CLE);

const arg = (nom, defaut) => {
  const t = process.argv.find(a => a.startsWith(`--${nom}=`));
  return t ? Number(t.split('=')[1]) : defaut;
};
const ECART_ALT = arg('ecart-alt', 30);
const RAYON = arg('rayon', 150);
const EN_JSON = process.argv.includes('--json');

// Emprise Pyrénées (ouest, sud, est, nord) — couvre France, Andorre, Espagne
const BBOX = { o: -2.0, s: 42.0, e: 3.5, n: 43.6 };

// ── Utilitaires ──────────────────────────────────────────────────────────────

// Distance entre deux points en mètres (formule de Haversine)
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Normalise un nom pour comparaison : minuscules, sans accents ni ponctuation,
// sans les mots génériques qui varient d'une base à l'autre.
function normNom(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(cabane|refuge|abri|orri|cabana|refugi|gite|gîte|de|du|des|la|le|les|l|d)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Une altitude n'est retenue que si elle est plausible dans les Pyrénées.
// Sans ce garde-fou, un tag OSM mal saisi ("1 905" → 1) ou un 0 signifiant
// "non renseigné" produirait des écarts spectaculaires mais imaginaires.
const ALT_MIN = 20, ALT_MAX = 3500;   // Aneto = 3404 m
function altPlausible(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n) || n < ALT_MIN || n > ALT_MAX) return null;
  return Math.round(n);
}

async function getJSON(url, options = {}) {
  const rep = await fetch(url, {
    headers: { 'User-Agent': 'refuges-pyrenees-audit/1.0 (+https://refuges-pyrenees.vercel.app)' },
    ...options,
  });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${url}`);
  return rep.json();
}

// ── Sources ──────────────────────────────────────────────────────────────────

async function chargerBase() {
  const TAILLE = 1000;
  let tous = [], debut = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('refuges')
      .select('id,nom,lat,lon,altitude,categorie,departement,region')
      .range(debut, debut + TAILLE - 1);
    if (error) throw new Error('Supabase : ' + error.message);
    if (!data || !data.length) break;
    tous = tous.concat(data);
    if (data.length < TAILLE) break;
    debut += TAILLE;
  }
  return tous;
}

// refuges.info — API publique, lecture seule, sans clé.
// Types : 7 = cabane non gardée, 9 = gîte d'étape, 10 = refuge gardé,
//         23 = bâtiment en montagne. On exclut points d'eau et passages.
async function chargerRefugesInfo() {
  const url = 'https://www.refuges.info/api/bbox'
    + `?bbox=${BBOX.o},${BBOX.s},${BBOX.e},${BBOX.n}`
    + '&type_points=7,9,10,23&nb_points=all&detail=complet&format=geojson';
  const geo = await getJSON(url);
  return (geo.features || []).map(f => {
    const c = f.geometry?.coordinates || [];
    const p = f.properties || {};
    // Attention : refuges.info renvoie 0 quand l'altitude n'est pas renseignée.
    // Une cabane à 0 m dans les Pyrénées n'existe pas — on traite ça comme une
    // absence de donnée, sinon on fabrique de faux écarts de 2000 m.
    return {
      source: 'refuges.info',
      id: p.id,
      nom: p.nom,
      lon: c[0], lat: c[1],
      alt: altPlausible(c[2] ?? p.coord?.alt),
      type: p.type?.valeur || null,
      lien: p.lien || (p.id ? `https://www.refuges.info/point/${p.id}` : null),
    };
  }).filter(p => p.lat != null && p.lon != null);
}

// OpenStreetMap via Overpass — source la plus indépendante : cartographiée
// sur le terrain, sans lien de parenté avec les bases de refuges.
async function chargerOSM() {
  const requete = `
    [out:json][timeout:180];
    (
      nwr["tourism"="alpine_hut"](${BBOX.s},${BBOX.o},${BBOX.n},${BBOX.e});
      nwr["tourism"="wilderness_hut"](${BBOX.s},${BBOX.o},${BBOX.n},${BBOX.e});
      nwr["amenity"="shelter"]["shelter_type"~"basic_hut|weather_shelter|lean_to"](${BBOX.s},${BBOX.o},${BBOX.n},${BBOX.e});
    );
    out center tags;`;
  const serveurs = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let dernierErr;
  for (const srv of serveurs) {
    try {
      const rep = await fetch(srv, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'refuges-pyrenees-audit/1.0 (+https://refuges-pyrenees.vercel.app)',
        },
        body: 'data=' + encodeURIComponent(requete),
      });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const j = await rep.json();
      return (j.elements || []).map(e => {
        // Le tag ele d'OSM est du texte libre : vide, à 0, avec une virgule,
        // une espace, voire non numérique. altPlausible fait le tri.
        return {
          source: 'osm',
          id: `${e.type}/${e.id}`,
          nom: e.tags?.name || null,
          lat: e.lat ?? e.center?.lat,
          lon: e.lon ?? e.center?.lon,
          alt: altPlausible(e.tags?.ele),
          type: e.tags?.tourism || e.tags?.amenity || null,
          lien: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        };
      }).filter(p => p.lat != null && p.lon != null);
    } catch (err) { dernierErr = err; }
  }
  throw dernierErr;
}

// ── Rapprochement ────────────────────────────────────────────────────────────

// Cherche, parmi les points d'une source, celui qui correspond le mieux à `r`.
// Priorité à la proximité géographique ; le nom sert à confirmer un doute
// quand plusieurs candidats sont proches (fréquent en fond de vallée).
function apparier(r, points, rayon = RAYON) {
  const proches = points
    .map(p => ({ p, d: distM(r.lat, r.lon, p.lat, p.lon) }))
    .filter(x => x.d <= rayon)
    .sort((a, b) => a.d - b.d);
  if (!proches.length) return null;

  const nr = normNom(r.nom);
  if (nr) {
    const parNom = proches.find(x => {
      const np = normNom(x.p.nom);
      return np && (np === nr || np.includes(nr) || nr.includes(np));
    });
    if (parNom) return { ...parNom, parNom: true };
  }
  return { ...proches[0], parNom: false };
}

// Cherche un lieu de MÊME NOM beaucoup plus loin. Sert à distinguer deux cas
// très différents qui se ressemblent : un lieu qu'on est seul à connaître,
// et un lieu dont nos coordonnées sont franchement fausses (mauvaise vallée).
// On exige ici une correspondance de nom stricte : à 2 km, la proximité ne
// prouve plus rien, seul le nom peut établir qu'il s'agit du même endroit.
const RAYON_LARGE = 3000;
function chercherLoin(r, points) {
  const nr = normNom(r.nom);
  if (!nr || nr.length < 4) return null;   // noms trop courts = trop de faux positifs
  const cands = points
    .map(p => ({ p, d: distM(r.lat, r.lon, p.lat, p.lon) }))
    .filter(x => x.d > RAYON && x.d <= RAYON_LARGE)
    .filter(x => {
      const np = normNom(x.p.nom);
      return np && np.length >= 4 && np === nr;
    })
    .sort((a, b) => a.d - b.d);
  return cands.length ? cands[0] : null;
}

// ── Programme principal ──────────────────────────────────────────────────────

(async () => {
  console.log('Audit des sources — lecture seule, rien ne sera modifié.\n');

  process.stdout.write('  Base Supabase…       ');
  const base = await chargerBase();
  console.log(`${base.length} lieux`);

  process.stdout.write('  refuges.info…        ');
  let ri = [];
  try { ri = await chargerRefugesInfo(); console.log(`${ri.length} points`); }
  catch (e) { console.log('échec — ' + e.message); }

  process.stdout.write('  OpenStreetMap…       ');
  let osm = [];
  try { osm = await chargerOSM(); console.log(`${osm.length} points`); }
  catch (e) { console.log('échec — ' + e.message); }

  if (!ri.length && !osm.length) {
    console.error('\n✗ Aucune source externe joignable, audit impossible.');
    process.exit(1);
  }

  const rapport = [];
  const ecartsAlt = [], deplaces = [], inconnus = [], confirmes = [], malPlaces = [];

  for (const r of base) {
    if (r.lat == null || r.lon == null) continue;
    const aRI = ri.length ? apparier(r, ri) : null;
    const aOSM = osm.length ? apparier(r, osm) : null;
    const sources = [aRI, aOSM].filter(Boolean);

    const ligne = {
      id: r.id, nom: r.nom, alt_base: r.altitude,
      departement: r.departement || r.region || null,
      trouve_sur: sources.length,
      refuges_info: aRI ? { nom: aRI.p.nom, alt: aRI.p.alt, dist_m: Math.round(aRI.d), lien: aRI.p.lien } : null,
      osm:          aOSM ? { nom: aOSM.p.nom, alt: aOSM.p.alt, dist_m: Math.round(aOSM.d), lien: aOSM.p.lien } : null,
    };
    rapport.push(ligne);

    if (!sources.length) {
      // Rien à proximité : soit on est seul à connaître ce lieu, soit nos
      // coordonnées sont fausses. On cherche le même nom plus loin pour trancher.
      const loinRI = ri.length ? chercherLoin(r, ri) : null;
      const loinOSM = osm.length ? chercherLoin(r, osm) : null;
      const loin = [loinRI, loinOSM].filter(Boolean).sort((a, b) => a.d - b.d)[0];
      if (loin) {
        malPlaces.push({
          ...ligne,
          dist_m: Math.round(loin.d),
          ailleurs: { nom: loin.p.nom, alt: loin.p.alt, lien: loin.p.lien, source: loin.p.source },
        });
      } else {
        inconnus.push(ligne);
      }
      continue;
    }
    confirmes.push(ligne);

    // Écart d'altitude : seules les sources qui ont une altitude comptent.
    if (r.altitude != null) {
      const alts = sources.map(s => s.p.alt).filter(a => a != null);
      const pires = alts.map(a => Math.abs(a - r.altitude));
      if (pires.length && Math.max(...pires) >= ECART_ALT) {
        ecartsAlt.push({ ...ligne, ecart_max_m: Math.round(Math.max(...pires)) });
      }
    }

    // Position : si toutes les sources s'accordent loin de nous, c'est nous
    // qui sommes probablement mal placés.
    const dmin = Math.min(...sources.map(s => s.d));
    if (dmin > RAYON * 0.6) deplaces.push({ ...ligne, dist_min_m: Math.round(dmin) });
  }

  // Lieux présents chez les autres mais absents chez nous — uniquement ceux
  // qui ont un nom (un point OSM anonyme n'est pas exploitable).
  const manquants = [];
  for (const p of [...ri, ...osm]) {
    if (!p.nom) continue;
    const proche = base.some(r => r.lat != null && distM(r.lat, r.lon, p.lat, p.lon) <= RAYON);
    if (!proche) manquants.push(p);
  }
  // Dédoublonne : le même lieu peut exister dans les deux sources.
  const manquantsUniq = [];
  for (const m of manquants) {
    if (!manquantsUniq.some(x => distM(x.lat, x.lon, m.lat, m.lon) <= RAYON)) manquantsUniq.push(m);
  }

  // ── Rapport ────────────────────────────────────────────────────────────────
  const pc = n => base.length ? Math.round(n / base.length * 100) : 0;

  console.log('\n' + '═'.repeat(70));
  console.log('  RÉSUMÉ');
  console.log('═'.repeat(70));
  console.log(`  Lieux dans la base                : ${base.length}`);
  console.log(`  Retrouvés sur ≥1 source externe   : ${confirmes.length} (${pc(confirmes.length)} %)`);
  console.log(`  Retrouvés sur les 2 sources       : ${confirmes.filter(l => l.trouve_sur === 2).length}`);
  console.log(`  Même nom mais LOIN (coords ?)     : ${malPlaces.length}`);
  console.log(`  Introuvables ailleurs             : ${inconnus.length} (${pc(inconnus.length)} %)`);
  console.log(`  Écarts d'altitude ≥ ${ECART_ALT} m         : ${ecartsAlt.length}`);
  console.log(`  Position à affiner (> ${Math.round(RAYON * 0.6)} m)     : ${deplaces.length}`);
  console.log(`  Lieux connus ailleurs, absents    : ${manquantsUniq.length}`);

  const top = (titre, arr, fmt, n = 15) => {
    if (!arr.length) return;
    console.log('\n' + '─'.repeat(70));
    console.log(`  ${titre}${arr.length > n ? `  (${n} premiers sur ${arr.length})` : ''}`);
    console.log('─'.repeat(70));
    arr.slice(0, n).forEach(x => console.log('  ' + fmt(x)));
  };

  top('COORDONNÉES SUSPECTES — même nom trouvé bien plus loin',
    [...malPlaces].sort((a, b) => b.dist_m - a.dist_m),
    x => `${(x.nom || '?').slice(0, 32).padEnd(32)} à ${String(Math.round(x.dist_m / 100) / 10).padStart(4)} km  (${x.ailleurs.source})  ${x.ailleurs.lien || ''}`);

  top("ÉCARTS D'ALTITUDE — à vérifier en priorité",
    [...ecartsAlt].sort((a, b) => b.ecart_max_m - a.ecart_max_m),
    x => {
      const s = [];
      if (x.refuges_info?.alt != null) s.push(`ri:${x.refuges_info.alt}`);
      if (x.osm?.alt != null) s.push(`osm:${x.osm.alt}`);
      return `${(x.nom || '?').slice(0, 34).padEnd(34)} nous:${String(x.alt_base ?? '?').padStart(5)} m  |  ${s.join('  ')}  (écart ${x.ecart_max_m} m)`;
    });

  top('POSITION À AFFINER — écart modéré, souvent juste du bruit GPS',
    [...deplaces].sort((a, b) => b.dist_min_m - a.dist_min_m),
    x => `${(x.nom || '?').slice(0, 40).padEnd(40)} à ${x.dist_min_m} m de la position des autres`, 10);

  top('CONNUS AILLEURS, ABSENTS CHEZ NOUS — candidats à l\'ajout',
    manquantsUniq,
    x => `${(x.nom || '?').slice(0, 40).padEnd(40)} ${String(x.alt ?? '?').padStart(5)} m  ${x.lien || ''}`, 25);

  if (inconnus.length) {
    console.log('\n' + '─'.repeat(70));
    console.log(`  INTROUVABLES AILLEURS : ${inconnus.length} lieux`);
    console.log('─'.repeat(70));
    console.log('  Ce n\'est pas forcément une erreur : notre base est plus dense que');
    console.log('  les autres sur les cabanes pastorales. Mais un lieu introuvable');
    console.log('  ailleurs ET jamais visité mérite un œil.');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  Ce rapport ne prouve pas qu\'une donnée est juste : les sources');
  console.log('  peuvent se tromper ensemble. Il montre où creuser, rien de plus.');
  console.log('═'.repeat(70) + '\n');

  if (EN_JSON) {
    const dest = path.join(RACINE, 'outils', 'audit-sources.json');
    await writeFile(dest, JSON.stringify({
      genere_le: new Date().toISOString(),
      seuils: { ecart_altitude_m: ECART_ALT, rayon_appariement_m: RAYON },
      sources: { refuges_info: ri.length, openstreetmap: osm.length },
      resume: {
        base: base.length, confirmes: confirmes.length, inconnus: inconnus.length,
        coords_suspectes: malPlaces.length,
        ecarts_altitude: ecartsAlt.length, positions_douteuses: deplaces.length,
        manquants: manquantsUniq.length,
      },
      coords_suspectes: malPlaces,
      ecarts_altitude: ecartsAlt,
      positions_douteuses: deplaces,
      manquants: manquantsUniq,
      introuvables_ailleurs: inconnus,
      detail: rapport,
    }, null, 2));
    console.log(`  Rapport détaillé : ${path.relative(RACINE, dest)}\n`);
  }
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
