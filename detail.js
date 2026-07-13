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
  const eau=fmtBool(r.eau), bois=fmtBool(r.bois);
  const badge=r.modifie?'<span class="modifie-badge">modifié</span>':'';
  const sousTitre=[r.ville, r.region, typeLbl].filter(Boolean).join(' · ');

  // Panneau volontairement compact : juste de quoi se faire une idée
  // rapide. Le détail complet (photos, description, météo, point d'eau…)
  // est sur la fiche plein écran, via "Voir en grand".
  const cellules=[
    {l:'Altitude', v:r.alt?r.alt+' m':'—'},
    {l:'Eau à proximité', v:eau||'—', couleur:eau==='Oui'?'var(--cyan)':eau==='Non'?'var(--texte-3)':'var(--texte)'},
    {l:'Bois', v:bois||'—', couleur:bois==='Oui'?'var(--ambre)':bois==='Non'?'var(--texte-3)':'var(--texte)'},
  ];
  if(r.capEte!=null || r.capHiver!=null){
    const parts=[];
    if(r.capEte!=null) parts.push(r.capEte+' été');
    if(r.capHiver!=null) parts.push(r.capHiver+' hiver');
    cellules.push({l:'Capacité', v:parts.join(' / ')});
  }
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
    </div>

    <div class="d-section">
      <div class="d-grille">${grilleHTML}</div>
    </div>

    <div class="d-section">
      <h3>Météo</h3>
      <div id="meteo-contenu" class="meteo-contenu"><span class="eau-osm-spin"></span> <span style="color:var(--txt3);font-size:13px">chargement…</span></div>
    </div>

    <div class="d-section">
      <button class="d-voir-grand" onclick="ouvrirFiche(${r._i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        Voir tous les détails
      </button>
    </div>
  `;
  majMeteo(r);
}

