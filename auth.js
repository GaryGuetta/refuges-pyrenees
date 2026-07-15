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
    if(document.getElementById('profil-contenu') && typeof rendreProfilComplet==='function') rendreProfilComplet();
    if(typeof rafraichirTousLesMarqueurs==='function') rafraichirTousLesMarqueurs();
    if(typeof appliquer==='function') appliquer();
    // si un détail de refuge est ouvert, on le redessine pour afficher/masquer le formulaire d'ajout
    if(typeof actif!=='undefined' && actif!==null && typeof afficherDetail==='function' && typeof REFUGES!=='undefined' && REFUGES[actif]) afficherDetail(REFUGES[actif]);
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
  currentUser = null;
}

// Envoie un lien de réinitialisation par email. Le lien renvoie vers
// nouveau-mot-de-passe.html, où l'utilisateur choisit son nouveau mot de passe.
async function demanderReinitMdp(email){
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}/nouveau-mot-de-passe.html`,
  });
  return error ? { erreur: error.message } : { ok: true };
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
  if(typeof rendreProfilComplet==='function') rendreProfilComplet();
}

async function handleInscription(){
  const email=document.getElementById('auth-email').value.trim();
  const mdp=document.getElementById('auth-password').value;
  const zoneErr=document.getElementById('auth-erreur');
  const consent=document.getElementById('auth-consent');
  if(!email || !mdp){ zoneErr.textContent="Renseigne un email et un mot de passe."; zoneErr.style.display='block'; return; }
  if(mdp.length<6){ zoneErr.textContent="Le mot de passe doit faire au moins 6 caractères."; zoneErr.style.display='block'; return; }
  // Le RGPD exige un consentement libre et explicite : une case pré-cochée ou
  // un simple "en continuant vous acceptez" ne vaut pas consentement.
  if(consent && !consent.checked){
    zoneErr.textContent="Pour créer un compte, il faut accepter la politique de confidentialité.";
    zoneErr.style.display='block'; return;
  }
  const res=await inscription(email,mdp);
  if(res.erreur){ zoneErr.textContent=res.erreur; zoneErr.style.display='block'; return; }
  zoneErr.style.display='none';
  if(res.attenteConfirmation){
    const zone=document.getElementById('profil-contenu');
    if(zone) zone.innerHTML=`<div class="profil-carte profil-vide">Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis reviens te connecter ici.</div>`;
    return;
  }
  if(typeof rendreProfilComplet==='function') rendreProfilComplet();
}

function handleDeconnexion(){
  deconnexion().then(()=>{ if(typeof rendreProfilComplet==='function') rendreProfilComplet(); });
}

async function handleMdpOublie(){
  const email=document.getElementById('auth-email').value.trim();
  const zoneErr=document.getElementById('auth-erreur');
  const zoneOk=document.getElementById('auth-info');
  if(!email){
    zoneErr.textContent="Renseigne d'abord ton email ci-dessus, on t'y enverra le lien.";
    zoneErr.style.display='block'; if(zoneOk) zoneOk.style.display='none';
    return;
  }
  const res=await demanderReinitMdp(email);
  zoneErr.style.display='none';
  if(zoneOk){
    // Message volontairement identique que le compte existe ou non : dire
    // "cet email est inconnu" permettrait de découvrir qui a un compte ici.
    zoneOk.textContent="Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé. Pense à vérifier les spams.";
    zoneOk.style.display='block';
  }
}
