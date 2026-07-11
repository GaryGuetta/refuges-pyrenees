// =============================================================================
// fiche.js — Page grand format d'un refuge (photos, eau, météo, toutes les infos)
// =============================================================================

function ouvrirFiche(i){
  const r = REFUGES[i];
  const typeLbl = r.typeNum ? TYPE_LABEL[r.typeNum] : tagTxt(r.cat);
  const eau = fmtBool(r.eau), bois = fmtBool(r.bois), cheminee = fmtBool(r.cheminee);
  const desc = r.desc || 'Aucune description disponible pour ce lieu.';
  const photos = photosDe(r._cle);
  const sousTitre=[r.ville, r.departement || r.region, typeLbl].filter(Boolean).join(' · ');

  const statsSupp=[];
  if(r.capEte!=null) statsSupp.push({v:r.capEte, l:'Cap. été'});
  if(r.capHiver!=null) statsSupp.push({v:r.capHiver, l:'Cap. hiver'});
  if(cheminee) statsSupp.push({v:cheminee, l:'Cheminée', couleur:cheminee==='Oui'?'var(--accent)':'var(--txt)'});

  const hero = photos.length
    ? `<div class="fiche-hero" style="background-image:url('${photos[0].data}')" onclick="ouvrirPhotoPlein(${i},0)"></div>`
    : `<div class="fiche-hero fiche-hero-vide" onclick="document.getElementById('fiche-ajout-photo').click()">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
         <span>Aucune photo — clique pour en ajouter</span>
         <input type="file" id="fiche-ajout-photo" accept="image/*" multiple style="display:none" onchange="ajouterPhotos(${i}, this.files); fermerFiche(); setTimeout(()=>ouvrirFiche(${i}),50)">
       </div>`;

  const galerie = photos.length > 1 ? `
    <div class="fiche-galerie">
      ${photos.slice(1).map((p,idx)=>`<div class="fiche-vignette" onclick="ouvrirPhotoPlein(${i},${idx+1})"><img src="${p.data}" loading="lazy"></div>`).join('')}
    </div>` : '';

  const eauMoisHTML = friseEau(r);

  document.getElementById('fiche-overlay').innerHTML = `
    <div class="fiche-page">
      <button class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Retour
      </button>
      ${hero}
      <div class="fiche-corps">
        <div class="fiche-entete">
          <span class="d-tag ${r.cat}">${tagTxt(r.cat)}</span>
          <h1>${r.nom}</h1>
          <p class="fiche-sous">${sousTitre}</p>
        </div>

        ${galerie}

        <div class="fiche-grille">
          <div class="fiche-stat"><div class="fiche-stat-num">${r.alt ? r.alt+' m' : '—'}</div><div class="fiche-stat-lbl">Altitude</div></div>
          <div class="fiche-stat"><div class="fiche-stat-num">${r.places || '—'}</div><div class="fiche-stat-lbl">Places</div></div>
          <div class="fiche-stat"><div class="fiche-stat-num" id="fiche-cell-eau-proximite" style="color:${eau==='Oui'?'var(--eau)':'var(--txt)'}">${eau || '—'}</div><div class="fiche-stat-lbl">Eau à proximité</div></div>
          <div class="fiche-stat"><div class="fiche-stat-num" style="color:${bois==='Oui'?'var(--accent)':'var(--txt)'}">${bois || '—'}</div><div class="fiche-stat-lbl">Bois</div></div>
          ${statsSupp.map(s=>`<div class="fiche-stat"><div class="fiche-stat-num"${s.couleur?` style="color:${s.couleur}"`:''}>${s.v}</div><div class="fiche-stat-lbl">${s.l}</div></div>`).join('')}
        </div>
        ${r.couchage?`<div class="d-info-ligne">🛏️ ${r.couchage}</div>`:''}

        ${eauMoisHTML}

        <div class="fiche-section">
          <h2>Point d'eau le plus proche</h2>
          <div class="eau-osm" id="fiche-eau-osm">
            <div class="eau-osm-val" id="fiche-eau-osm-val"><span class="eau-osm-spin"></span> <span style="color:var(--txt3);font-weight:500;font-size:13px">recherche sur OpenStreetMap…</span></div>
          </div>
        </div>

        <div class="fiche-section">
          <h2>Météo</h2>
          <div id="fiche-meteo-contenu" class="meteo-contenu"><span class="eau-osm-spin"></span> <span style="color:var(--txt3);font-size:13px">chargement…</span></div>
        </div>

        <div class="fiche-section">
          <h2>Description</h2>
          <p class="fiche-desc">${desc}</p>
        </div>

        ${r.rando?`
        <div class="fiche-section">
          <h2>Randonnées à proximité</h2>
          <p class="fiche-desc">${r.rando}</p>
        </div>`:''}

        <div class="fiche-section">
          <h2>Localisation</h2>
          <div class="d-coord"><span>Lat ${r.lat.toFixed(5)}</span><span>Lon ${r.lon.toFixed(5)}</span></div>
          <a class="d-gmaps" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            Ouvrir dans Google Maps
          </a>
        </div>

        <div class="fiche-section" style="border-top:none;padding-top:0">
          <button class="fiche-btn-carte" onclick="fermerFiche(); selectionner(${i}, true);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Voir sur la carte
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('fiche-overlay').classList.add('ouvert');
  document.body.style.overflow = 'hidden';

  majEauOSM(r, 'fiche-');
  majMeteo(r, 'fiche-');
}

function fermerFiche(){
  document.getElementById('fiche-overlay').classList.remove('ouvert');
  document.body.style.overflow = '';
}
