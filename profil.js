// =============================================================================
// profil.js — Profil utilisateur : statistiques des passages
// =============================================================================

function ouvrirProfil() {
  document.getElementById('liste').style.display        = 'none';
  document.getElementById('filtres-bloc').style.display  = 'none';
  document.querySelector('.stats').style.display          = 'none';
  const avis=document.getElementById('avis-construction'); if(avis) avis.style.display='none';
  document.getElementById('profil-panneau').classList.add('ouvert');
  rendreProfilComplet();
}

function fermerProfil() {
  document.getElementById('profil-panneau').classList.remove('ouvert');
  document.getElementById('filtres-bloc').style.display = '';
  document.querySelector('.stats').style.display          = '';
  const avis=document.getElementById('avis-construction'); if(avis) avis.style.display='';
  document.getElementById('liste').style.display        = '';
}

function rendreProfilComplet() {
  const box = document.getElementById('profil-panneau');

  const tousPassages = chargerPassages();   // {_cle: [{date,com,balises,id},...]}
  const clesVisitees = Object.keys(tousPassages).filter(k => tousPassages[k].length > 0);

  // Refuges visités (croisement avec REFUGES)
  const refugesVisites = REFUGES.filter(r => clesVisitees.includes(r._cle));
  const nbVisites      = refugesVisites.length;
  const nbTotal        = REFUGES.length;

  // Tous les passages à plat
  const tousLesPassages = clesVisitees.flatMap(k =>
    tousPassages[k].map(p => ({...p, _cle: k}))
  ).sort((a, b) => b.date.localeCompare(a.date));

  const nbPassages = tousLesPassages.length;

  // Altitude max visitée
  const altMax = refugesVisites.reduce((max, r) => r.alt && r.alt > max ? r.alt : max, 0);

  // Comptage des balises
  const comptBalises = {};
  tousLesPassages.forEach(p => (p.balises || []).forEach(b => {
    comptBalises[b] = (comptBalises[b] || 0) + 1;
  }));
  const balisesSorted = Object.entries(comptBalises).sort((a, b) => b[1] - a[1]);

  // Refuge le plus haut visité
  const plusHaut = refugesVisites.reduce((h, r) => r.alt && (!h || r.alt > h.alt) ? r : h, null);

  // Derniers passages (10 max)
  const derniersPassages = tousLesPassages.slice(0, 10);

  // ---- HTML ----
  let html = `
  <div class="profil-entete">
    <div class="profil-entete-titre">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      <h2>Mon profil</h2>
    </div>
    <button class="profil-fermer" onclick="fermerProfil()" aria-label="Fermer">&times;</button>
  </div>
  <div class="profil-corps">
  <div class="profil-stats">
    <div class="profil-stat">
      <div class="profil-stat-num cyan">${nbVisites}</div>
      <div class="profil-stat-lbl">Lieux<br>visités</div>
    </div>
    <div class="profil-stat">
      <div class="profil-stat-num corail">${nbPassages}</div>
      <div class="profil-stat-lbl">Passages<br>enregistrés</div>
    </div>
    <div class="profil-stat">
      <div class="profil-stat-num ambre">${altMax ? altMax + ' m' : '—'}</div>
      <div class="profil-stat-lbl">Altitude<br>max visitée</div>
    </div>
    <div class="profil-stat">
      <div class="profil-stat-num vert">${nbTotal > 0 ? Math.round(nbVisites / nbTotal * 100) : 0}%</div>
      <div class="profil-stat-lbl">De la base<br>explorée</div>
    </div>
  </div>

  <!-- Progression globale -->
  <div class="profil-section">
    <h3>Progression</h3>
    <div class="profil-barre-wrap">
      <div class="profil-barre-lbl"><span>Lieux visités</span><span>${nbVisites} / ${nbTotal}</span></div>
      <div class="profil-barre"><div class="profil-barre-fill" style="width:${nbTotal>0?Math.round(nbVisites/nbTotal*100):0}%"></div></div>
    </div>
  </div>`;

  // Refuge le plus haut
  if (plusHaut) {
    html += `
  <div class="profil-section">
    <h3>Record d'altitude</h3>
    <div class="profil-passage" onclick="selectionner(${plusHaut._i}, true); fermerProfil()">
      <div class="profil-passage-haut">
        <div class="profil-passage-nom">🏔️ ${plusHaut.nom}</div>
        <div class="profil-passage-date">${plusHaut.alt} m</div>
      </div>
      <div class="profil-passage-balises"><span class="tag ${plusHaut.cat}">${tagTxt(plusHaut.cat)}</span></div>
    </div>
  </div>`;
  }

  // Balises les plus utilisées
  if (balisesSorted.length) {
    const maxN = balisesSorted[0][1];
    html += `<div class="profil-section"><h3>Tes observations terrain</h3>`;
    balisesSorted.slice(0, 8).forEach(([id, n]) => {
      const info = BALISE_INFO[id];
      if (!info) return;
      html += `
      <div class="profil-balise-row">
        <div class="profil-balise-nom">${info.txt}</div>
        <div class="profil-balise-barre"><div class="profil-balise-fill${info.alerte?' alerte':''}" style="width:${Math.round(n/maxN*100)}%"></div></div>
        <div class="profil-balise-n">${n}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // Derniers passages
  if (derniersPassages.length) {
    html += `<div class="profil-section"><h3>Derniers passages</h3>`;
    derniersPassages.forEach(p => {
      const r = REFUGES.find(r => r._cle === p._cle);
      if (!r) return;
      const bals = (p.balises || []).map(id => {
        const info = BALISE_INFO[id];
        return info ? `<span class="hist-balise${info.alerte?' alerte':''}">${info.txt}</span>` : '';
      }).join('');
      html += `
      <div class="profil-passage" onclick="selectionner(${r._i}, true); fermerProfil()">
        <div class="profil-passage-haut">
          <div class="profil-passage-nom">${r.nom}</div>
          <div class="profil-passage-date">${fmtDate(p.date)}</div>
        </div>
        ${bals ? `<div class="profil-passage-balises">${bals}</div>` : ''}
        ${p.com ? `<div style="font-size:11px;color:var(--texte-3);margin-top:5px;line-height:1.5">${p.com.slice(0,80)}${p.com.length>80?'…':''}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="profil-vide">Aucun passage enregistré pour l'instant.<br>Clique sur un refuge pour commencer.</div>`;
  }
  html += `</div>`; // fin .profil-corps

  box.innerHTML = html;
}
