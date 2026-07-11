// =============================================================================
// planificateur.js — Planificateur d'itinéraire (Naismith)
// =============================================================================

let marqueursPlan = [];
let planLignes    = [];

function initPlanificateur() {
  document.getElementById('plan-date').value = new Date().toISOString().slice(0, 10);
}

let modeNuit = 'refuge'; // 'refuge' = uniquement refuges/cabanes | 'tente' = bivouac autorisé

function setModeNuit(mode) {
  modeNuit = mode;
  document.getElementById('toggle-refuge').classList.toggle('actif', mode === 'refuge');
  document.getElementById('toggle-tente').classList.toggle('actif', mode === 'tente');
}

function ouvrirPlanificateur() {
  if (!traceCourante) { alert("Importe d'abord un fichier GPX."); return; }
  fermerDetail();
  document.querySelector('.app').classList.remove('detail-ouvert');
  document.querySelector('.app').classList.add('plan-ouvert');
  document.getElementById('plan-panneau').classList.add('ouvert');
  map.invalidateSize();
}

function fermerPlanificateur() {
  document.querySelector('.app').classList.remove('plan-ouvert');
  document.getElementById('plan-panneau').classList.remove('ouvert');
  effacerMarqueursPlan();
  map.invalidateSize();
}

function effacerMarqueursPlan() {
  marqueursPlan.forEach(m => map.removeLayer(m)); marqueursPlan = [];
  planLignes.forEach(l => map.removeLayer(l));    planLignes    = [];
}

function afficherBtnPlanifier() {
  document.getElementById('btn-planifier').style.display = 'flex';
}

// ---- Naismith : temps en heures ----
// vitesse base 4 km/h, +1h par 300 m D+, modulé par niveau (0.85 / 1.0 / 1.25)
function tempsNaismith(distM, denivPos, niveau) {
  const vKmH  = 4 * niveau;           // km/h effectif
  const tDist  = distM / (vKmH * 1000); // heures
  const tDeniv = denivPos / (300 * niveau); // heures
  return tDist + tDeniv;
}

function denivPos(alts, debut, fin) {
  let dp = 0;
  for (let i = debut + 1; i <= fin && i < alts.length; i++) {
    if (alts[i] != null && alts[i-1] != null) {
      const diff = alts[i] - alts[i-1];
      if (diff > 0) dp += diff;
    }
  }
  return dp;
}

// ---- Calcul principal ----
async function calculerItineraire() {
  if (!traceCourante) { alert("Aucun tracé GPX chargé."); return; }

  const heures    = parseFloat(document.getElementById('plan-heures').value) || 7;
  const niveau    = parseFloat(document.getElementById('plan-niveau').value) || 1;
  const dateStr   = document.getElementById('plan-date').value;
  const dateDebut = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();

  const trace  = traceCourante;
  const alts   = trace.map(p => p[2]);   // altitude de chaque point (peut être null)
  const hasAlt = alts.some(a => a != null);

  // Cumul des distances
  const cumul = [0];
  for (let k = 1; k < trace.length; k++)
    cumul[k] = cumul[k-1] + distM(trace[k-1][0], trace[k-1][1], trace[k][0], trace[k][1]);
  const totKm = cumul[cumul.length - 1] / 1000;

  const btn = document.querySelector('.plan-calculer');
  btn.textContent = 'Calcul en cours…'; btn.disabled = true;
  effacerMarqueursPlan();
  document.getElementById('plan-jours').innerHTML =
    '<div class="plan-vide"><span class="eau-osm-spin"></span> Calcul en cours…</div>';

  // ---- Pré-calcul : temps Naismith entre deux indices consécutifs ----
  const tSeg = new Array(trace.length - 1);
  for (let k = 0; k < trace.length - 1; k++) {
    const seg = distM(trace[k][0], trace[k][1], trace[k+1][0], trace[k+1][1]);
    const dp  = (alts[k] != null && alts[k+1] != null) ? Math.max(0, alts[k+1] - alts[k]) : 0;
    tSeg[k]   = tempsNaismith(seg, dp, niveau);
  }
  // cumul du temps depuis le début
  const tCumul = [0];
  for (let k = 0; k < tSeg.length; k++) tCumul[k+1] = tCumul[k] + tSeg[k];
  const tTotal = tCumul[tCumul.length - 1];

  // ---- Candidats naturels de fin de journée : refuges sur le tracé ----
  // On identifie les indices du tracé proches d'un refuge (< 600 m)
  const candidatsRefuge = []; // {idx, refuge, dist}
  REFUGES.forEach(r => {
    if (r.cat === 'ruine') return;
    let bestD = Infinity, bestK = -1;
    for (let k = 0; k < trace.length; k++) {
      const d = distM(r.lat, r.lon, trace[k][0], trace[k][1]);
      if (d < bestD) { bestD = d; bestK = k; }
    }
    if (bestD <= 600) candidatsRefuge.push({ idx: bestK, refuge: r, dist: Math.round(bestD) });
  });
  // Dédoublonne : si deux refuges sont au même idx, on garde le plus proche
  const candidatsMap = {};
  candidatsRefuge.forEach(c => {
    if (!candidatsMap[c.idx] || c.dist < candidatsMap[c.idx].dist) candidatsMap[c.idx] = c;
  });
  const refugesIdx = Object.keys(candidatsMap).map(Number).sort((a,b)=>a-b);

  // ---- Algorithme de partition équilibrée ----
  const nbJours = Math.max(1, Math.ceil(tTotal / heures));
  const tCible  = tTotal / nbJours;
  const coupes  = [];
  let idxCourant = 0;

  if (modeNuit === 'refuge') {
    // MODE REFUGE UNIQUEMENT : on ne s'arrête que sur un refuge/cabane
    const refugesCandidats = refugesIdx
      .filter(idx => idx > 0 && idx < trace.length - 1)
      .map(idx => ({ idx, t: tCumul[idx], ...candidatsMap[idx] }));
    refugesCandidats.push({ idx: trace.length - 1, t: tTotal, fin: true });

    if (refugesCandidats.filter(r => !r.fin).length === 0) {
      btn.textContent = 'Calculer le plan'; btn.disabled = false;
      document.getElementById('plan-jours').innerHTML =
        '<div class="plan-vide">⚠️ Aucun refuge ou cabane trouvé sur ce tracé.<br>Essaie le mode "Tente si besoin".</div>';
      return;
    }

    let tDepart = 0;
    for (let jour = 1; jour < nbJours; jour++) {
      const tVise = tDepart + tCible;
      const disponibles = refugesCandidats.filter(r =>
        !r.fin && r.t > tDepart &&
        r.t >= tDepart + tCible * 0.45 &&
        r.t <= tDepart + tCible * 1.55
      );
      let choix;
      if (disponibles.length > 0) {
        choix = disponibles.sort((a,b) => Math.abs(a.t-tVise) - Math.abs(b.t-tVise))[0];
      } else {
        // Pas de refuge dans la fenêtre → prendre le plus proche temporellement
        choix = refugesCandidats
          .filter(r => !r.fin && r.t > tDepart)
          .sort((a,b) => Math.abs(a.t-tVise) - Math.abs(b.t-tVise))[0];
        if (!choix) { coupes.push(trace.length - 1); break; }
      }
      coupes.push(choix.idx);
      tDepart = choix.t;
    }
    coupes.push(trace.length - 1);

  } else {
    // MODE TENTE : équilibrage libre, refuge préféré si disponible
    for (let jour = 1; jour < nbJours; jour++) {
      const tVise = tCumul[idxCourant] + tCible;
      const tMin  = tCumul[idxCourant] + tCible * 0.7;
      const tMax  = tCumul[idxCourant] + tCible * 1.3;

      const refugeDansZone = refugesIdx
        .filter(idx => idx > idxCourant && tCumul[idx] >= tMin && tCumul[idx] <= tMax)
        .sort((a,b) => Math.abs(tCumul[a]-tVise) - Math.abs(tCumul[b]-tVise));

      if (refugeDansZone.length > 0) {
        idxCourant = refugeDansZone[0];
      } else {
        let meilleurIdx = idxCourant + 1, meilleurEcart = Infinity;
        for (let k = idxCourant + 1; k < trace.length - 1; k++) {
          const ecart = Math.abs(tCumul[k] - tVise);
          if (tCumul[k] > tMax && meilleurEcart < Infinity) break;
          if (ecart < meilleurEcart) { meilleurEcart = ecart; meilleurIdx = k; }
        }
        idxCourant = meilleurIdx;
      }
      coupes.push(idxCourant);
    }
    coupes.push(trace.length - 1);
  }

  // ---- Construit les journées ----
  const journees = [];
  let idxDebut = 0, jourNum = 1;

  for (const idxFin of coupes) {
    const distJour = cumul[idxFin] - cumul[idxDebut];
    const dpJour   = denivPos(alts, idxDebut, idxFin);
    const tJour    = tCumul[idxFin] - tCumul[idxDebut];
    const ptFin    = trace[idxFin];
    const dateJour = new Date(dateDebut);
    dateJour.setDate(dateDebut.getDate() + jourNum - 1);

    // Gîte : uniquement si ce n'est pas le dernier jour
    const estArrivee = idxFin === trace.length - 1;
    const giteCandidat = !estArrivee && (candidatsMap[idxFin] || null);
    const gite = estArrivee ? null
      : giteCandidat
        ? { refuge: giteCandidat.refuge, dist: giteCandidat.dist }
        : trouverGite(ptFin[0], ptFin[1]);
    const bivouac = estArrivee ? null
      : gite ? null
      : await chercherZonePlate(ptFin[0], ptFin[1]);

    journees.push({ num: jourNum, date: dateJour,
      distKm: distJour / 1000, dpM: dpJour, tH: tJour,
      ptDebut: trace[idxDebut], ptFin, idxDebut, idxFin,
      estArrivee, gite, bivouac });

    idxDebut = idxFin;
    jourNum++;
  }

  btn.textContent = 'Calculer le plan'; btn.disabled = false;
  afficherJournees(journees, totKm, hasAlt);
}

function trouverGite(lat, lon) {
  let best = null, bestD = Infinity;
  REFUGES.forEach(r => {
    if (r.cat === 'ruine') return;
    const d = distM(lat, lon, r.lat, r.lon);
    if (d < 600 && d < bestD) { bestD = d; best = r; }
  });
  return best ? { refuge: best, dist: Math.round(bestD) } : null;
}

// Zone plate : retourne simplement le point d'arrivée avec un avertissement
// L'analyse IGN était trop lente et peu fiable, on indique à l'utilisateur de vérifier
function chercherZonePlate(lat, lon) {
  return Promise.resolve({ lat, lon, note: 'Vérifier le terrain sur la carte topo' });
}

// ---- Affichage ----
const JOURS_FR  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MOIS_FR   = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const COULEURS  = ['#5eba7d','#c9a15e','#7ba9c4','#c8977a','#9d8ec4','#6bab8f','#d0a05a','#8a9a6b'];

function fmtJourDate(d) {
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`;
}

function afficherJournees(journees, totKm, hasAlt) {
  // Résumé
  const totD  = journees.reduce((s, j) => s + j.dpM, 0);
  const resume = document.getElementById('plan-resume');
  resume.style.display = 'flex';
  resume.innerHTML = `
    <div class="plan-resume-stat">
      <div class="plan-resume-num">${journees.length}</div>
      <div class="plan-resume-lbl">Jours</div>
    </div>
    <div class="plan-resume-stat">
      <div class="plan-resume-num">${totKm.toFixed(0)} km</div>
      <div class="plan-resume-lbl">Distance</div>
    </div>
    <div class="plan-resume-stat">
      <div class="plan-resume-num">${hasAlt ? '+'+Math.round(totD)+' m' : '—'}</div>
      <div class="plan-resume-lbl">D+ total</div>
    </div>`;

  // Segments colorés sur la carte
  journees.forEach((j, idx) => {
    const couleur = COULEURS[idx % COULEURS.length];
    const pts = traceCourante.slice(j.idxDebut, j.idxFin + 1).map(p => [p[0], p[1]]);
    const l = L.polyline(pts, {color: couleur, weight: 5, opacity: .9}).addTo(map);
    planLignes.push(l);

    // Marqueur nuit (pas sur le dernier jour)
    const pt = j.ptFin;
    if (j.estArrivee) {
      // Pas de marqueur à l'arrivée
    } else if (j.gite) {
      const el = document.createElement('div');
      el.className = 'marqueur ' + j.gite.refuge.cat;
      el.style.cssText = `box-shadow:0 0 0 4px ${couleur},0 0 16px ${couleur}55;transform:scale(1.2)`;
      const m = L.marker([pt[0], pt[1]], {
        icon: L.divIcon({html: el.outerHTML, className: '', iconSize: [18, 18], iconAnchor: [9, 9]}),
        zIndexOffset: 1000
      }).addTo(map);
      m.bindTooltip(`Nuit ${j.num} · ${j.gite.refuge.nom}`, {direction: 'top'});
      m.on('click', () => selectionner(j.gite.refuge._i, true));
      marqueursPlan.push(m);
    } else {
      const bLat = j.bivouac.lat, bLon = j.bivouac.lon;
      const el = document.createElement('div'); el.className = 'marqueur-bivouac';
      const m = L.marker([bLat, bLon], {
        icon: L.divIcon({html: el.outerHTML, className: '', iconSize: [14, 14], iconAnchor: [7, 7]}),
        zIndexOffset: 1000
      }).addTo(map);
      const info = j.bivouac.pente != null ? `${j.bivouac.qualite} (~${j.bivouac.pente}%)` : 'Zone estimée';
      m.bindTooltip(`Nuit ${j.num} · Bivouac · ${info}`, {direction: 'top'});
      marqueursPlan.push(m);
    }
  });

  const box = document.getElementById('plan-jours');
  box.innerHTML = journees.map((j, idx) => {
    const couleur = COULEURS[idx % COULEURS.length];

    // Dernier jour = arrivée, pas de nuit
    if (j.estArrivee) {
      return `
      <div class="plan-jour" style="border-left-color:${couleur}" onclick="zoomJour(${j.idxDebut},${j.idxFin})">
        <div class="plan-jour-haut">
          <span class="plan-jour-label" style="color:${couleur}">Jour ${j.num} · Arrivée 🏁</span>
          <span class="plan-jour-date">${fmtJourDate(j.date)}</span>
        </div>
        <div class="plan-jour-stats">
          <span class="plan-jour-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            ${j.distKm.toFixed(1)} km
          </span>
          ${j.dpM > 0 ? `<span class="plan-jour-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 7 13 16 8 11 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            +${Math.round(j.dpM)} m
          </span>` : ''}
          <span class="plan-jour-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ~${j.tH.toFixed(1)}h
          </span>
        </div>
      </div>`;
    }

    const isGite  = !!j.gite;
    const nuitCls = isGite ? `nuit-${j.gite.refuge.cat}` : 'nuit-bivouac';
    const nuitIco = isGite
      ? (j.gite.refuge.cat === 'refuge' ? '🏠' : '🛖')
      : '⛺';
    const nuitNom  = isGite ? j.gite.refuge.nom : 'Bivouac';
    const nuitSous = isGite
      ? `${tagTxt(j.gite.refuge.cat)} · ${j.gite.dist} m du point d'arrivée`
      : (j.bivouac.note || 'Zone plate estimée');
    const nuitDist = isGite ? `${j.gite.dist} m` : '';

    return `
    <div class="plan-jour" style="border-left-color:${couleur}" onclick="zoomJour(${j.idxDebut},${j.idxFin})">
      <div class="plan-jour-haut">
        <span class="plan-jour-label" style="color:${couleur}">Jour ${j.num}</span>
        <span class="plan-jour-date">${fmtJourDate(j.date)}</span>
      </div>
      <div class="plan-jour-stats">
        <span class="plan-jour-stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          ${j.distKm.toFixed(1)} km
        </span>
        ${j.dpM > 0 ? `<span class="plan-jour-stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 7 13 16 8 11 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          +${Math.round(j.dpM)} m
        </span>` : ''}
        <span class="plan-jour-stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ~${j.tH.toFixed(1)}h
        </span>
      </div>
      <div class="plan-jour-nuit ${nuitCls}">
        <div class="plan-nuit-ico">${nuitIco}</div>
        <div class="plan-nuit-info">
          <div class="plan-nuit-nom">${nuitNom}</div>
          <div class="plan-nuit-sous">${nuitSous}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function zoomJour(idxDebut, idxFin) {
  const pts = traceCourante.slice(idxDebut, idxFin + 1).map(p => [p[0], p[1]]);
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), {padding: [60, 60]});
}
