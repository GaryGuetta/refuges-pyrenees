// =============================================================================
// generer-pages-refuges.mjs — Génère une page HTML statique par refuge dans
// refuge/{id}.html, avec balises meta / Open Graph / JSON-LD pour que Google
// indexe chaque lieu individuellement et que les liens partagés (WhatsApp,
// Facebook, etc.) affichent un bel aperçu. Génère aussi sitemap.xml.
//
// À lancer après chaque mise à jour de données, ou automatiquement à chaque
// déploiement Vercel (voir instructions).
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node outils/generer-pages-refuges.mjs
// =============================================================================

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

function echapper(s){
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

function pageHTML(r){
  const nom = echapper(r.nom);
  const typeLbl = TYPE_LABEL[r.type_num] || r.categorie || 'Refuge';
  const lieu = [r.ville, r.departement, r.region].filter(Boolean).join(', ');
  const titre = `${r.nom}${r.altitude ? ' — ' + r.altitude + ' m' : ''} | Refuges des Pyrénées`;
  const description = echapper(
    r.description?.slice(0,155) ||
    `${typeLbl}${r.altitude ? ', à ' + r.altitude + ' m d\u2019altitude' : ''}${lieu ? ' — ' + lieu : ''}. Infos à jour : eau, bois, capacité, accès.`
  );
  const url = `${URL_SITE}/refuge/${r.id}`;
  const capaciteHTML = (r.cap_ete!=null || r.cap_hiver!=null)
    ? `<div class="stat"><div class="v">${r.cap_ete ?? '—'} / ${r.cap_hiver ?? '—'}</div><div class="l">Places été / hiver</div></div>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${echapper(titre)}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="place">
<meta property="og:title" content="${echapper(r.nom)}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Refuges des Pyrénées">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${echapper(r.nom)}">
<meta name="twitter:description" content="${description}">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify({
  "@context":"https://schema.org",
  "@type":"TouristAttraction",
  "name": r.nom,
  "description": r.description || undefined,
  "geo": { "@type":"GeoCoordinates", "latitude": r.lat, "longitude": r.lon },
  "address": lieu || undefined
})}
</script>
<style>
  :root{--fond:#101114;--panneau:#17181c;--panneau-2:#1d1f24;--ligne:rgba(255,255,255,.09);
    --txt:#f3f1ea;--txt2:#a9a59b;--txt3:#6f6c64;--accent:#f0a04b;--eau:#5aa9dc}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Outfit',system-ui,sans-serif;background:var(--fond);color:var(--txt);line-height:1.6}
  .page{max-width:640px;margin:0 auto;padding:40px 22px 70px}
  .retour{color:var(--txt3);text-decoration:none;font-size:13px}
  .retour:hover{color:var(--accent)}
  .tag{display:inline-block;background:var(--panneau-2);border:1px solid var(--ligne);color:var(--txt2);
    font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:4px 10px;border-radius:999px;margin:16px 0 8px}
  h1{font-size:28px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px}
  .lieu{color:var(--txt2);font-size:14.5px;margin-bottom:24px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:24px}
  .stat{background:var(--panneau);border:1px solid var(--ligne);border-radius:12px;padding:12px;text-align:center}
  .stat .v{font-size:16px;font-weight:700}
  .stat .l{font-size:10.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.04em;margin-top:3px}
  .desc{color:var(--txt2);font-size:14.5px;margin-bottom:26px;white-space:pre-line}
  .coord{color:var(--txt3);font-size:13px;margin-bottom:20px}
  .btn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#201304;
    text-decoration:none;font-weight:700;font-size:14px;padding:13px 22px;border-radius:12px}
  .note{background:rgba(240,160,75,.07);border:1px solid rgba(240,160,75,.25);border-radius:12px;
    padding:12px 15px;font-size:12.5px;color:var(--txt2);margin-top:28px}
</style>
</head>
<body>
<div class="page">
  <a class="retour" href="../carte.html">← Retour à la carte</a>
  <div class="tag">${echapper(typeLbl)}</div>
  <h1>${nom}</h1>
  <p class="lieu">${echapper(lieu)}</p>

  <div class="stats">
    ${r.altitude ? `<div class="stat"><div class="v">${r.altitude} m</div><div class="l">Altitude</div></div>` : ''}
    ${r.eau ? `<div class="stat"><div class="v">${echapper(r.eau)}</div><div class="l">Eau à proximité</div></div>` : ''}
    ${r.bois ? `<div class="stat"><div class="v">${echapper(r.bois)}</div><div class="l">Bois</div></div>` : ''}
    ${r.cheminee ? `<div class="stat"><div class="v">${echapper(r.cheminee)}</div><div class="l">Cheminée</div></div>` : ''}
    ${capaciteHTML}
  </div>

  ${r.description ? `<p class="desc">${echapper(r.description)}</p>` : ''}

  <p class="coord">Coordonnées : ${r.lat?.toFixed(5)}, ${r.lon?.toFixed(5)}</p>

  <a class="btn" href="${URL_SITE}/carte.html?refuge=${encodeURIComponent(r.id)}">Voir sur la carte interactive →</a>

  <p class="note">Informations collectées automatiquement et complétées par la communauté — vérifie
  toujours l'état réel du lieu avant de partir en randonnée.</p>
</div>
</body>
</html>`;
}

async function main(){
  const refuges = await chargerTousLesRefuges();
  console.log(`Génération de ${refuges.length} pages…`);

  const dossier = path.join(RACINE, 'refuge');
  await rm(dossier, { recursive:true, force:true });
  await mkdir(dossier, { recursive:true });

  let ok = 0;
  for (const r of refuges){
    if(!r.id || r.lat==null || r.lon==null) continue;
    await writeFile(path.join(dossier, `${r.id}.html`), pageHTML(r));
    ok++;
    if(ok % 200 === 0) process.stdout.write(`\r  ${ok}/${refuges.length}…`);
  }
  console.log(`\n✓ ${ok} pages générées dans /refuge`);

  // sitemap.xml
  const urls = refuges.filter(r=>r.id).map(r =>
    `  <url><loc>${URL_SITE}/refuge/${r.id}</loc></url>`
  ).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${URL_SITE}/carte.html</loc></url>
${urls}
</urlset>`;
  await writeFile(path.join(RACINE, 'sitemap.xml'), sitemap);
  console.log('✓ sitemap.xml généré');
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
