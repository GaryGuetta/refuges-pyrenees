// =============================================================================
// detail.js — Panneau détail
// =============================================================================

function friseEau(r){
  // r.eauMois = tableau d'indices de mois (0-11) où l'eau est disponible
  const mois=r.eauMois;
  if(!mois || !Array.isArray(mois) || mois.length===0) return '';
  const cells=MOIS_COURT.map((lettre,i)=>
    `<div class="em-cell ${mois.includes(i)?'on':''}" title="${MOIS_LONG[i]}">${lettre}</div>`
  ).join('');
  let note='';
  if(mois.length===12) note='Eau disponible toute l\'année';
  else { const noms=mois.sort((a,b)=>a-b).map(i=>MOIS_LONG[i]); note='Eau : '+noms.join(', '); }
  return `<div class="eau-bloc">
    <div class="eau-bloc-lbl">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5S5 10 5 14a7 7 0 0 0 14 0c0-4-7-11.5-7-11.5Z"/></svg>
      Disponibilité de l'eau
    </div>
    <div class="eau-mois">${cells}</div>
    <div class="eau-note">${note}</div>
  </div>`;
}

function afficherDetail(r){
  const typeLbl=r.typeNum?TYPE_LABEL[r.typeNum]:tagTxt(r.cat);
  const eau=fmtBool(r.eau), bois=fmtBool(r.bois), cheminee=fmtBool(r.cheminee);
  const badge=r.modifie?'<span class="modifie-badge">modifié</span>':'';
  const desc=r.desc?`<div class="d-desc">${r.desc}</div>`:'<div class="d-desc" style="color:var(--texte-3);font-style:italic">Aucune description disponible.</div>';
  const sousTitre=[r.ville, r.region, typeLbl].filter(Boolean).join(' · ');

  // Grille d'infos : les cases toujours présentes + les nouvelles, seulement si on a la donnée
  const cellules=[
    {l:'Altitude', v:r.alt?r.alt+' m':'—'},
    {l:'Places', v:r.places||'—'},
    {l:'Eau à proximité', v:eau||'—', couleur:eau==='Oui'?'var(--cyan)':eau==='Non'?'var(--texte-3)':'var(--texte)'},
    {l:'Bois', v:bois||'—', couleur:bois==='Oui'?'var(--ambre)':bois==='Non'?'var(--texte-3)':'var(--texte)'},
  ];
  if(r.capEte!=null) cellules.push({l:'Capacité été', v:r.capEte+' pl.'});
  if(r.capHiver!=null) cellules.push({l:'Capacité hiver', v:r.capHiver+' pl.'});
  if(cheminee) cellules.push({l:'Cheminée', v:cheminee, couleur:cheminee==='Oui'?'var(--ambre)':'var(--texte-3)'});
  const grilleHTML=cellules.map(c=>`<div class="d-cell"><div class="l">${c.l}</div><div class="v"${c.couleur?` style="color:${c.couleur}"`:''}>${c.v}</div></div>`).join('');

  document.getElementById('detail-vide').style.display='none';
  const box=document.getElementById('detail-contenu');
  box.style.display='block';
  box.innerHTML=`
    <div class="d-tete">
      <button class="d-fermer" onclick="fermerDetail()">&times;</button>
      <span class="d-tag ${r.cat}">${tagTxt(r.cat)}</span>
      <div class="d-nom">${r.nom}${badge}</div>
      <div class="d-region">${sousTitre}</div>
      <div class="d-source">Source : ${r.source||'pyrenees-refuges.com'}</div>
      <button class="d-voir-grand" onclick="ouvrirFiche(${r._i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        Voir en grand
      </button>
    </div>

    <div class="d-section">
      <h3>Photos</h3>
      <div class="photos-galerie" id="photos-galerie"></div>
    </div>

    <div class="d-section">
      <h3>Informations</h3>
      <div class="d-grille">${grilleHTML}</div>
      ${r.couchage?`<div class="d-info-ligne"><span class="d-info-ico">🛏️</span> ${r.couchage}</div>`:''}
      ${friseEau(r)}
      <div class="eau-osm" id="eau-osm">
        <div class="eau-osm-lbl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5S5 10 5 14a7 7 0 0 0 14 0c0-4-7-11.5-7-11.5Z"/></svg>
          Point d'eau le plus proche
        </div>
        <div class="eau-osm-val" id="eau-osm-val"><span class="eau-osm-spin"></span> <span style="color:var(--texte-3);font-weight:500;font-size:13px">recherche sur OpenStreetMap…</span></div>
      </div>
      <div class="d-coord"><span>Lat ${r.lat.toFixed(5)}</span><span>Lon ${r.lon.toFixed(5)}</span></div>
      <a class="d-gmaps" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        Ouvrir dans Google Maps
      </a>
    </div>

    <div class="d-section">
      <h3>Description</h3>
      ${desc}
    </div>

    ${r.rando?`
    <div class="d-section">
      <h3>Randonnées à proximité</h3>
      <div class="d-desc">${r.rando}</div>
    </div>`:''}

    <div class="d-section">
      <button class="d-modifier" onclick="ouvrirEdition(${r._i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Modifier les informations
      </button>
    </div>

    <div class="d-section">
      <h3>Historique des passages</h3>
      ${estConnecte() ? `
      <div class="hist-form">
        <input type="date" id="hist-date" value="${new Date().toISOString().slice(0,10)}">
        <div id="hist-balises">${balisesFormHTML()}</div>
        <textarea id="hist-com" placeholder="Commentaire libre (optionnel) : météo, détails, précisions…"></textarea>
        <button class="hist-ajouter" onclick="ajouterPassage(${r._i})">+ Ajouter ce passage</button>
      </div>` : `
      <div class="hist-connexion">
        <p>Connecte-toi pour ajouter un passage et suivre les refuges que t'as visités.</p>
        <button class="hist-ajouter" onclick="ouvrirProfil()">Se connecter</button>
      </div>`}
      <div class="hist-liste" id="hist-liste"></div>
    </div>
  `;
  rendrePassages(r._i);
  majEauOSM(r);
  rendreGaleriePhotos(r._i);
}

