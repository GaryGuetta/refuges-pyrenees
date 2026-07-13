// =============================================================================
// profil.js — Contenu de la page profil.html (statistiques des passages)
// =============================================================================

function rendreProfilComplet() {
  const box = document.getElementById('profil-contenu');
  if(!box) return;

  if(!estConnecte()){
    box.innerHTML = `
    <div class="profil-carte profil-carte-auth">
      <p style="color:var(--txt2);font-size:13.5px;line-height:1.6;margin-bottom:20px">
        Connecte-toi pour suivre les refuges que t'as visités, avec tes statistiques personnelles.
      </p>
      <div class="champ"><label>Email</label><input type="email" id="auth-email" autocomplete="email"></div>
      <div class="champ" style="margin-top:12px"><label>Mot de passe</label><input type="password" id="auth-password" autocomplete="current-password"></div>
      <div id="auth-erreur" style="color:var(--corail);font-size:12px;margin-top:8px;display:none"></div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-save" style="flex:1" onclick="handleConnexion()">Se connecter</button>
        <button class="btn btn-annuler" style="flex:1" onclick="handleInscription()">Créer un compte</button>
      </div>
    </div>`;
    return;
  }

  const clesVisitees = Object.keys(PASSAGES).filter(k => mesPassagesDe(k).length > 0);
  const refugesVisites = REFUGES.filter(r => clesVisitees.includes(r.id));
  const nbVisites      = refugesVisites.length;
  const nbTotal        = REFUGES.length;

  const tousLesPassages = clesVisitees.flatMap(k =>
    mesPassagesDe(k).map(p => ({...p, refuge_id: k}))
  ).sort((a, b) => b.date.localeCompare(a.date));

  const nbPassages = tousLesPassages.length;
  const altMax = refugesVisites.reduce((max, r) => r.alt && r.alt > max ? r.alt : max, 0);

  const comptBalises = {};
  tousLesPassages.forEach(p => (p.balises || []).forEach(b => {
    comptBalises[b] = (comptBalises[b] || 0) + 1;
  }));
  const balisesSorted = Object.entries(comptBalises).sort((a, b) => b[1] - a[1]);

  const plusHaut = refugesVisites.reduce((h, r) => r.alt && (!h || r.alt > h.alt) ? r : h, null);
  const derniersPassages = tousLesPassages.slice(0, 10);

  let html = `
  <div class="profil-carte profil-carte-compte">
    <div class="profil-compte">
      <span class="profil-compte-email">${currentUser.email}</span>
      <button class="profil-compte-deco" onclick="handleDeconnexion()">Se déconnecter</button>
    </div>
  </div>

  <div class="profil-grille">
    <div class="profil-col">
      <div class="profil-carte">
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
        <div class="profil-barre-wrap">
          <div class="profil-barre-lbl"><span>Lieux visités</span><span>${nbVisites} / ${nbTotal}</span></div>
          <div class="profil-barre"><div class="profil-barre-fill" style="width:${nbTotal>0?Math.round(nbVisites/nbTotal*100):0}%"></div></div>
        </div>
      </div>
      ${plusHaut ? `
      <div class="profil-carte">
        <h3>Record d'altitude</h3>
        <a class="profil-passage" href="carte.html#refuge=${plusHaut.id}">
          <div class="profil-passage-haut">
            <div class="profil-passage-nom">🏔️ ${plusHaut.nom}</div>
            <div class="profil-passage-date">${plusHaut.alt} m</div>
          </div>
          <div class="profil-passage-balises"><span class="tag ${plusHaut.cat}">${tagTxt(plusHaut.cat)}</span></div>
        </a>
      </div>` : ''}
    </div>

    <div class="profil-col">
      ${balisesSorted.length ? `
      <div class="profil-carte">
        <h3>Tes observations terrain</h3>
        ${balisesSorted.slice(0, 8).map(([id, n]) => {
          const info = BALISE_INFO[id];
          if (!info) return '';
          const maxN = balisesSorted[0][1];
          return `
          <div class="profil-balise-row">
            <div class="profil-balise-nom">${info.txt}</div>
            <div class="profil-balise-barre"><div class="profil-balise-fill${info.alerte?' alerte':''}" style="width:${Math.round(n/maxN*100)}%"></div></div>
            <div class="profil-balise-n">${n}</div>
          </div>`;
        }).join('')}
      </div>` : `<div class="profil-carte profil-vide">Pas encore d'observation terrain enregistrée.</div>`}
    </div>
  </div>

  <div class="profil-carte profil-carte-large">
    <h3>Derniers passages</h3>
    ${derniersPassages.length ? `<div class="profil-passages-grille">
      ${derniersPassages.map(p => {
        const r = REFUGES.find(r => r.id === p.refuge_id);
        if (!r) return '';
        const bals = (p.balises || []).map(id => {
          const info = BALISE_INFO[id];
          return info ? `<span class="hist-balise${info.alerte?' alerte':''}">${info.txt}</span>` : '';
        }).join('');
        return `
        <a class="profil-passage" href="carte.html#refuge=${r.id}">
          <div class="profil-passage-haut">
            <div class="profil-passage-nom">${r.nom}</div>
            <div class="profil-passage-date">${fmtDate(p.date)}</div>
          </div>
          ${bals ? `<div class="profil-passage-balises">${bals}</div>` : ''}
          ${p.com ? `<div style="font-size:11px;color:var(--txt3);margin-top:5px;line-height:1.5">${p.com.slice(0,80)}${p.com.length>80?'…':''}</div>` : ''}
        </a>`;
      }).join('')}
    </div>` : `<div class="profil-vide">Aucun passage enregistré pour l'instant.<br>Va sur la carte pour ajouter ton premier passage.</div>`}
  </div>`;

  box.innerHTML = html;
}
