// =============================================================================
// fiche.js — Page grand format d'un refuge (photos, eau, météo, toutes les infos)
// =============================================================================

function ouvrirFiche(i){
  const r = REFUGES[i];
  const eau = fmtBool(r.eau), bois = fmtBool(r.bois), cheminee = fmtBool(r.cheminee);
  const desc = r.desc || 'Aucune description disponible pour ce lieu.';
  const photos = photosDe(r._cle);
  const sousTitre=[r.ville, r.departement || r.region].filter(Boolean).join(' · ');

  // Capacité toujours affichée, même absente ("—") : sinon la case saute et
  // une autre stat prend sa place, ce qui donne une grille au contenu variable
  // d'une fiche à l'autre. Cohérent avec le panneau compact (voir detail.js).
  const capParts=[];
  if(r.capEte!=null) capParts.push(r.capEte+' été');
  if(r.capHiver!=null) capParts.push(r.capHiver+' hiver');

  const statsSupp=[
    {v:capParts.join(' / ')||'—', l:'Capacité'},
  ];
  // Le champ cheminée contient soit un oui/non, soit une description libre
  // ("Foyer ouvert", "Poêle à bois"…). Une case de stat n'accueille qu'une
  // valeur courte : le texte libre part en ligne d'info sous la grille.
  const chemineeTexte = (cheminee && cheminee!=='Oui' && cheminee!=='Non') ? cheminee : null;
  if(cheminee && !chemineeTexte) statsSupp.push({v:cheminee, l:'Cheminée', couleur:cheminee==='Oui'?'var(--accent)':'var(--txt)'});

  // Zone photo compacte, juste sous le titre — plus de grand bandeau vide.
  const zonePhoto = photos.length
    ? `<div class="fiche-photos-mini">
        ${photos.slice(0,5).map((p,idx)=>`<div class="fiche-mini-vignette" onclick="ouvrirPhotoPlein(${i},${idx})"><img src="${p.data}" loading="lazy"></div>`).join('')}
        <label class="fiche-mini-ajout" title="Ajouter une photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <input type="file" accept="image/*" multiple style="display:none" onchange="ajouterPhotos(${i}, this.files); fermerFiche(); setTimeout(()=>ouvrirFiche(${i}),50)">
        </label>
      </div>`
    : `<label class="fiche-photo-vide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
        <span>Ajouter une photo</span>
        <input type="file" accept="image/*" multiple style="display:none" onchange="ajouterPhotos(${i}, this.files); fermerFiche(); setTimeout(()=>ouvrirFiche(${i}),50)">
      </label>`;

  const eauMoisHTML = friseEau(r);

  document.getElementById('fiche-overlay').innerHTML = `
    <div class="fiche-page">
      <button class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Retour
      </button>
      <div class="fiche-corps">
        <div class="fiche-entete">
          <span class="d-tag ${r.cat}">${tagTxt(r.cat)}</span>
          <h1>${r.nom}</h1>
          <p class="fiche-sous">${sousTitre}</p>
        </div>

        ${zonePhoto}

        <div class="fiche-carte">
          <div class="fiche-grille">
            <div class="fiche-stat"><div class="fiche-stat-num">${r.alt ? r.alt+' m' : '—'}</div><div class="fiche-stat-lbl">Altitude</div></div>
            <div class="fiche-stat"><div class="fiche-stat-num" id="fiche-cell-eau-proximite" style="color:${eau==='Oui'?'var(--eau)':'var(--txt)'}">${eau || '—'}</div><div class="fiche-stat-lbl">Eau à proximité</div></div>
            <div class="fiche-stat"><div class="fiche-stat-num" style="color:${bois==='Oui'?'var(--accent)':'var(--txt)'}">${bois || '—'}</div><div class="fiche-stat-lbl">Bois</div></div>
            ${statsSupp.map(s=>`<div class="fiche-stat"><div class="fiche-stat-num"${s.couleur?` style="color:${s.couleur}"`:''}>${s.v}</div><div class="fiche-stat-lbl">${s.l}</div></div>`).join('')}
          </div>
          ${chemineeTexte?`<div class="d-info-ligne">🔥 ${chemineeTexte}</div>`:''}
          ${r.couchage?`<div class="d-info-ligne">🛏️ ${r.couchage}</div>`:''}
          ${estConnecte() ? `
          <button class="d-modifier" onclick="ouvrirEdition(${i})" style="margin-top:14px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Modifier les informations
          </button>` : `
          <a class="fiche-connexion-modif" href="profil.html" style="margin-top:14px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11v6M19 14h6"/></svg>
            Connecte-toi pour modifier ce lieu
          </a>`}
        </div>

        <div class="fiche-layout">
          <div class="fiche-col-principale">
            <div class="fiche-carte">
              <h2>Description</h2>
              <p class="fiche-desc">${desc}</p>
            </div>

            ${eauMoisHTML ? `<div class="fiche-carte">${eauMoisHTML}</div>` : ''}

            <div class="fiche-carte">
              <h2>Historique des passages</h2>
              ${estConnecte() ? `
              <div class="hist-form">
                <input type="date" id="hist-date" value="${new Date().toISOString().slice(0,10)}">
                <div id="hist-balises">${balisesFormHTML()}</div>
                <textarea id="hist-com" placeholder="Commentaire libre (optionnel) : météo, détails, précisions…"></textarea>
                <button class="hist-ajouter" onclick="ajouterPassage(${i})">+ Ajouter ce passage</button>
              </div>` : `
              <div class="hist-connexion">
                <p>Connecte-toi pour ajouter un passage et suivre les refuges que t'as visités.</p>
                <a class="hist-ajouter" href="profil.html">Se connecter</a>
              </div>`}
              <div class="hist-liste" id="hist-liste"></div>
            </div>
          </div>

          <div class="fiche-col-laterale">
            <div class="fiche-carte">
              <h2>Point d'eau le plus proche</h2>
              <div class="eau-osm" id="fiche-eau-osm">
                <div class="eau-osm-val" id="fiche-eau-osm-val"><span class="eau-osm-spin"></span> <span style="color:var(--txt3);font-weight:500;font-size:13px">recherche sur OpenStreetMap…</span></div>
              </div>
            </div>

            <div class="fiche-carte">
              <h2>Météo</h2>
              <div id="fiche-meteo-contenu" class="meteo-contenu"><span class="eau-osm-spin"></span> <span style="color:var(--txt3);font-size:13px">chargement…</span></div>
            </div>

            <div class="fiche-carte">
              <h2>Localisation</h2>
              <div class="d-coord"><span>Lat ${r.lat.toFixed(5)}</span><span>Lon ${r.lon.toFixed(5)}</span></div>
              <a class="d-gmaps" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                Ouvrir dans Google Maps
              </a>
              <button class="fiche-btn-carte" onclick="fermerFiche(); selectionner(${i}, true);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                Voir sur la carte
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('fiche-overlay').classList.add('ouvert');
  document.body.style.overflow = 'hidden';

  majEauOSM(r, 'fiche-');
  majMeteo(r, 'fiche-');
  rendrePassages(i);
}

function fermerFiche(){
  document.getElementById('fiche-overlay').classList.remove('ouvert');
  document.body.style.overflow = '';
}
