// =============================================================================
// auth.js — Comptes utilisateurs (email + mot de passe) via Supabase Auth.
// Permet de savoir "qui" ajoute un passage, pour afficher les refuges visités
// propres à chaque personne (au lieu d'un historique commun anonyme).
// =============================================================================

let currentUser = null;

async function initAuth(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;

  supabaseClient.auth.onAuthStateChange((_event, session)=>{
    currentUser = session?.user || null;
    const profil=document.getElementById('profil-panneau');
    if(profil && profil.classList.contains('ouvert') && typeof rendreProfilComplet==='function') rendreProfilComplet();
    if(typeof rafraichirTousLesMarqueurs==='function') rafraichirTousLesMarqueurs();
    if(typeof appliquer==='function') appliquer();
    // si un détail de refuge est ouvert, on le redessine pour afficher/masquer le formulaire d'ajout
    if(actif!==null && typeof afficherDetail==='function' && typeof REFUGES!=='undefined' && REFUGES[actif]) afficherDetail(REFUGES[actif]);
  });
}

function estConnecte(){ return !!currentUser; }

async function inscription(email, motDePasse){
  const { data, error } = await supabaseClient.auth.signUp({ email, password: motDePasse });
  if(error) return { erreur: error.message };
  if(!data.session) return { attenteConfirmation:true };
  return {};
}

async function connexion(email, motDePasse){
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: motDePasse });
  if(error) return { erreur: error.message };
  return {};
}

async function deconnexion(){
  await supabaseClient.auth.signOut();
}

// ── Actions appelées depuis les boutons du panneau profil ──
async function handleConnexion(){
  const email=document.getElementById('auth-email').value.trim();
  const mdp=document.getElementById('auth-password').value;
  const zoneErr=document.getElementById('auth-erreur');
  if(!email || !mdp){ zoneErr.textContent="Renseigne un email et un mot de passe."; zoneErr.style.display='block'; return; }
  const res=await connexion(email,mdp);
  if(res.erreur){ zoneErr.textContent=res.erreur; zoneErr.style.display='block'; return; }
  zoneErr.style.display='none';
  rendreProfilComplet();
}

async function handleInscription(){
  const email=document.getElementById('auth-email').value.trim();
  const mdp=document.getElementById('auth-password').value;
  const zoneErr=document.getElementById('auth-erreur');
  if(!email || !mdp){ zoneErr.textContent="Renseigne un email et un mot de passe."; zoneErr.style.display='block'; return; }
  if(mdp.length<6){ zoneErr.textContent="Le mot de passe doit faire au moins 6 caractères."; zoneErr.style.display='block'; return; }
  const res=await inscription(email,mdp);
  if(res.erreur){ zoneErr.textContent=res.erreur; zoneErr.style.display='block'; return; }
  zoneErr.style.display='none';
  if(res.attenteConfirmation){
    document.getElementById('profil-corps-auth').innerHTML=`<div class="hist-vide">Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis reviens te connecter ici.</div>`;
    return;
  }
  rendreProfilComplet();
}

function handleDeconnexion(){
  deconnexion().then(()=>rendreProfilComplet());
}
