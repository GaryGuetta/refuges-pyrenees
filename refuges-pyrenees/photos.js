// =============================================================================
// photos.js — Galerie photo par refuge (stockage local, images compressées)
// =============================================================================

const CLE_PHOTOS = 'refuges_photos_v1';
const PHOTO_MAX_W = 1280;      // largeur max avant compression
const PHOTO_QUALITE = 0.72;    // qualité JPEG
const PHOTO_MAX_PAR_LIEU = 8;

function chargerPhotos(){
  try{ return JSON.parse(localStorage.getItem(CLE_PHOTOS)) || {}; }
  catch(e){ return {}; }
}
function sauverPhotos(obj){
  try{ localStorage.setItem(CLE_PHOTOS, JSON.stringify(obj)); return true; }
  catch(e){
    alert("Stockage plein : le navigateur ne peut plus enregistrer de nouvelles photos localement. Essaie d'en supprimer quelques-unes.");
    return false;
  }
}
function photosDe(cle){
  const tout = chargerPhotos();
  return tout[cle] || [];
}

// Compresse une image (fichier) en JPEG base64, redimensionnée
function compresserImage(file){
  return new Promise((resolve, reject)=>{
    const lecteur = new FileReader();
    lecteur.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        let {width:w, height:h} = img;
        if(w > PHOTO_MAX_W){ h = Math.round(h * PHOTO_MAX_W / w); w = PHOTO_MAX_W; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITE));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    lecteur.onerror = reject;
    lecteur.readAsDataURL(file);
  });
}

async function ajouterPhotos(i, fileList){
  const r = REFUGES[i];
  const tout = chargerPhotos();
  const liste = tout[r._cle] || [];

  const fichiers = Array.from(fileList).filter(f=>f.type.startsWith('image/'));
  if(!fichiers.length) return;

  const place = PHOTO_MAX_PAR_LIEU - liste.length;
  if(place <= 0){ alert(`Maximum ${PHOTO_MAX_PAR_LIEU} photos par lieu.`); return; }

  const box = document.getElementById('photos-galerie');
  if(box) box.insertAdjacentHTML('beforeend', `<div class="photo-chargement" id="photo-chargement"><span class="eau-osm-spin"></span></div>`);

  for(const f of fichiers.slice(0, place)){
    try{
      const dataUrl = await compresserImage(f);
      liste.push({ data:dataUrl, date:new Date().toISOString() });
    }catch(e){ console.warn('Photo ignorée (format non lisible) :', f.name); }
  }

  tout[r._cle] = liste;
  if(sauverPhotos(tout)) rendreGaleriePhotos(i);
}

function supprimerPhoto(i, idx){
  const r = REFUGES[i];
  const tout = chargerPhotos();
  const liste = tout[r._cle] || [];
  liste.splice(idx, 1);
  tout[r._cle] = liste;
  sauverPhotos(tout);
  rendreGaleriePhotos(i);
}

function rendreGaleriePhotos(i){
  const r = REFUGES[i];
  const liste = photosDe(r._cle);
  const box = document.getElementById('photos-galerie');
  if(!box) return;

  box.innerHTML = liste.map((p, idx)=>`
    <div class="photo-vignette" onclick="ouvrirPhotoPlein(${i},${idx})">
      <img src="${p.data}" loading="lazy" alt="Photo du lieu">
      <button class="photo-suppr" onclick="event.stopPropagation();supprimerPhoto(${i},${idx})" title="Supprimer">&times;</button>
    </div>
  `).join('') + (liste.length < PHOTO_MAX_PAR_LIEU ? `
    <label class="photo-ajouter" title="Ajouter des photos">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <input type="file" accept="image/*" multiple style="display:none" onchange="ajouterPhotos(${i}, this.files)">
    </label>` : '');
}

// Visionneuse plein écran d'une photo
let photoActuelle = null;
function ouvrirPhotoPlein(i, idx){
  const liste = photosDe(REFUGES[i]._cle);
  if(!liste.length) return;
  photoActuelle = { i, idx };
  const overlay = document.getElementById('photo-overlay');
  document.getElementById('photo-overlay-img').src = liste[idx].data;
  overlay.classList.add('ouvert');
}
function fermerPhotoPlein(){
  document.getElementById('photo-overlay').classList.remove('ouvert');
}
function photoSuivante(sens){
  if(!photoActuelle) return;
  const liste = photosDe(REFUGES[photoActuelle.i]._cle);
  photoActuelle.idx = (photoActuelle.idx + sens + liste.length) % liste.length;
  document.getElementById('photo-overlay-img').src = liste[photoActuelle.idx].data;
}
