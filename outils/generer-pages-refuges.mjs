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

// Libellés alignés sur ceux de l'appli (voir tagTxt dans utils.js) : la fiche
// statique et la fiche interactive doivent dire exactement la même chose.
const CAT_LABEL = {
  refuge:'Refuge gardé', libre:'Cabane / abri', cabane:'Cabane / abri',
  ruine:'Ruine', fermee:'Fermée',
};

function echapper(s){
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Transforme les URLs d'une description en liens cliquables.
// Certaines fiches contiennent une URL brute collée par un contributeur : elle
// s'affichait en texte coupé sur plusieurs lignes, illisible et non cliquable.
// On échappe TOUJOURS avant de créer le lien, jamais l'inverse : sinon on
// rouvrirait une faille d'injection HTML via le champ description.
function descriptionHTML(texte){
  const sur = echapper(texte);
  return sur.replace(/https?:\/\/[^\s<]+/g, url => {
    // Affiche un libellé court plutôt que l'URL entière, qui déborde.
    let libelle;
    try { libelle = new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
    return `<a class="lien-ext" href="${url}" target="_blank" rel="noopener nofollow">${libelle} ↗</a>`;
  });
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
  const typeLbl = CAT_LABEL[r.categorie] || 'Refuge';
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
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
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

  .lien-ext{color:var(--eau);text-decoration:none;border-bottom:1px solid rgba(90,169,220,.35)}
  .lien-ext:hover{border-bottom-color:var(--eau)}

  h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
    color:var(--txt3);margin:30px 0 12px}

  #carte-mini{height:230px;border-radius:14px;border:1px solid var(--ligne);
    background:var(--panneau);margin-bottom:8px}
  .leaflet-container{background:var(--panneau)}
  .pin{width:14px;height:14px;border-radius:50%;background:var(--accent);
    border:2.5px solid var(--fond);box-shadow:0 0 0 2px rgba(240,160,75,.35)}

  .bloc{background:var(--panneau);border:1px solid var(--ligne);border-radius:14px;padding:16px}
  .attente{color:var(--txt3);font-size:13px}

  .meteo-auj{display:flex;align-items:center;gap:14px;margin-bottom:14px}
  .meteo-temp{font-size:30px;font-weight:700;letter-spacing:-.02em}
  .meteo-desc{color:var(--txt2);font-size:13.5px}
  .meteo-jours{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
  .mj{background:var(--panneau-2);border-radius:9px;padding:8px 4px;text-align:center}
  .mj-nom{font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.04em}
  .mj-max{font-size:13px;font-weight:700;margin-top:3px}
  .mj-min{font-size:11px;color:var(--txt3)}
  .meteo-src{font-size:11px;color:var(--txt3);margin-top:10px}

  .eau-ligne{display:flex;justify-content:space-between;align-items:center;gap:10px;
    padding:7px 0;border-bottom:1px solid var(--ligne);font-size:13.5px}
  .eau-ligne:last-child{border-bottom:none}
  .eau-nom{color:var(--eau)}
  .eau-dist{color:var(--txt3);font-size:12.5px;white-space:nowrap}

  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
  .btn2{display:inline-flex;align-items:center;gap:8px;background:var(--panneau);
    border:1px solid var(--ligne);color:var(--txt);text-decoration:none;font-weight:600;
    font-size:14px;padding:13px 20px;border-radius:12px}
  .btn2:hover{border-color:rgba(240,160,75,.45);color:var(--accent)}
</style>
</head>
<body>
<div class="page">
  <a class="retour" href="${URL_SITE}/carte">← Retour à la carte</a>
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

  ${r.description ? `<p class="desc">${descriptionHTML(r.description)}</p>` : ''}

  <h2>Situation</h2>
  <div id="carte-mini"></div>
  <p class="coord">Coordonnées : ${r.lat?.toFixed(5)}, ${r.lon?.toFixed(5)}</p>

  <h2>Météo sur place</h2>
  <div class="bloc" id="meteo"><span class="attente">Chargement…</span></div>

  <h2>Point d'eau le plus proche</h2>
  <div class="bloc" id="eau"><span class="attente">Recherche…</span></div>

  <div class="actions">
    <a class="btn" href="${URL_SITE}/carte?refuge=${encodeURIComponent(r.id)}">Voir sur la carte interactive →</a>
    <a class="btn2" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}" target="_blank" rel="noopener">Itinéraire</a>
  </div>

  <p class="note">Informations collectées automatiquement et complétées par la communauté — vérifie
  toujours l'état réel du lieu avant de partir en randonnée.</p>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var LAT = ${r.lat}, LON = ${r.lon}, ALT = ${r.altitude ?? 'null'};

  // ── Carte de situation ───────────────────────────────────────────────────
  try {
    var carte = L.map('carte-mini', {
      scrollWheelZoom:false, attributionControl:true
    }).setView([LAT, LON], 13);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom:17, attribution:'© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)'
    }).addTo(carte);
    L.marker([LAT, LON], {
      icon: L.divIcon({ html:'<div class="pin"></div>', className:'', iconSize:[14,14], iconAnchor:[7,7] })
    }).addTo(carte);
  } catch(e){}

  // ── Météo (Open-Meteo, à l'altitude exacte du refuge) ────────────────────
  var CIEL = {0:'Ciel dégagé',1:'Peu nuageux',2:'Partiellement nuageux',3:'Couvert',
    45:'Brouillard',48:'Brouillard givrant',51:'Bruine légère',53:'Bruine',55:'Bruine forte',
    61:'Pluie faible',63:'Pluie',65:'Pluie forte',71:'Neige faible',73:'Neige',75:'Neige forte',
    77:'Grains de neige',80:'Averses',81:'Averses',82:'Averses fortes',85:'Averses de neige',
    86:'Averses de neige',95:'Orage',96:'Orage et grêle',99:'Orage et grêle'};
  var JOURS = ['dim','lun','mar','mer','jeu','ven','sam'];

  var urlM = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON
    + (ALT !== null ? '&elevation=' + ALT : '')
    + '&current=temperature_2m,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
    + '&timezone=auto&forecast_days=6';

  fetch(urlM).then(function(r){ return r.json(); }).then(function(d){
    var box = document.getElementById('meteo');
    if (!d || !d.current) { box.innerHTML = '<span class="attente">Météo indisponible.</span>'; return; }
    var jours = '';
    for (var i = 0; i < (d.daily.time || []).length; i++) {
      var dt = new Date(d.daily.time[i] + 'T12:00:00');
      jours += '<div class="mj"><div class="mj-nom">' + JOURS[dt.getDay()] + '</div>'
             + '<div class="mj-max">' + Math.round(d.daily.temperature_2m_max[i]) + '°</div>'
             + '<div class="mj-min">' + Math.round(d.daily.temperature_2m_min[i]) + '°</div></div>';
    }
    box.innerHTML =
      '<div class="meteo-auj"><div class="meteo-temp">' + Math.round(d.current.temperature_2m) + '°C</div>'
      + '<div class="meteo-desc">' + (CIEL[d.current.weather_code] || '—') + '</div></div>'
      + '<div class="meteo-jours">' + jours + '</div>'
      + '<div class="meteo-src">Open-Meteo' + (ALT !== null ? ' · altitude ' + ALT + ' m' : '') + '</div>';
  }).catch(function(){
    document.getElementById('meteo').innerHTML = '<span class="attente">Météo indisponible.</span>';
  });

  // ── Point d'eau le plus proche (OpenStreetMap via Overpass) ──────────────
  var req = '[out:json][timeout:20];('
    + 'node["natural"="spring"](around:1500,' + LAT + ',' + LON + ');'
    + 'node["amenity"="drinking_water"](around:1500,' + LAT + ',' + LON + ');'
    + 'node["man_made"="water_well"](around:1500,' + LAT + ',' + LON + ');'
    + 'node["amenity"="fountain"](around:1500,' + LAT + ',' + LON + ');'
    + ');out body;';

  function dist(la1, lo1, la2, lo2){
    var R = 6371000, rad = Math.PI/180;
    var dLa = (la2-la1)*rad, dLo = (lo2-lo1)*rad;
    var a = Math.sin(dLa/2)*Math.sin(dLa/2)
          + Math.cos(la1*rad)*Math.cos(la2*rad)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return 2*R*Math.asin(Math.sqrt(a));
  }

  fetch('https://overpass-api.de/api/interpreter', {
    method:'POST', body:'data=' + encodeURIComponent(req)
  }).then(function(r){ return r.json(); }).then(function(d){
    var box = document.getElementById('eau');
    var pts = (d.elements || []).map(function(e){
      return { nom: (e.tags && e.tags.name) || 'Source', d: dist(LAT, LON, e.lat, e.lon) };
    }).sort(function(a,b){ return a.d - b.d; }).slice(0, 3);

    if (!pts.length) { box.innerHTML = '<span class="attente">Aucun point d\\'eau connu à moins de 1,5 km.</span>'; return; }
    box.innerHTML = pts.map(function(p){
      var d = p.d < 1000 ? Math.round(p.d) + ' m' : (p.d/1000).toFixed(1) + ' km';
      return '<div class="eau-ligne"><span class="eau-nom">' + p.nom + '</span><span class="eau-dist">à ' + d + '</span></div>';
    }).join('');
  }).catch(function(){
    document.getElementById('eau').innerHTML = '<span class="attente">Recherche indisponible.</span>';
  });
})();
</script>
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
