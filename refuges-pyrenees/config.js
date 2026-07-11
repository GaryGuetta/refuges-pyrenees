// =============================================================================
// config.js — Constantes globales
// =============================================================================

// Connexion Supabase — la clé "anon" est publique par design, protégée par les
// règles RLS définies dans outils/schema-supabase.sql (lecture libre, édition
// libre, pas de suppression). Ne jamais mettre la clé service_role ici.
const SUPABASE_URL = 'https://xwkbfbgrpafzhijpzsxn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yWDKzMRRZVjyI_cajyutbw_BK5tTH2z';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const REGIONS = ['Andorre', 'Occitanie', 'Nouvelle-Aquitaine', 'Aragon', 'Catalonia', 'Navarre'];
const TYPE_LABEL = {
  1:'Cabane fermée', 2:'Cabane ouverte',
  3:"Cabane ouverte, occupée par le berger l'été",
  4:'Orri, toue, abri en pierre',
  5:"Refuge gardé l'été, partie hivernale",
  6:"Refuge gardé toute l'année", 7:'Ruine'
};
let MARGE_GPX = 500;
const MARGE_REFUGE = 500;
const RAYON_EAU = 1000;
const CLE_STOCKAGE = 'refuges_modifications_v1';
const CLE_PASSAGES  = 'refuges_passages_v1';
const MOIS_COURT = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const MOIS_LONG  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const BALISES = [
  { grp:'État du refuge', items:[
    {id:'bon',txt:'Bon état'},
    {id:'degrade',txt:'Dégradé',alerte:true},
    {id:'sale',txt:'Très sale',alerte:true},
    {id:'ferme',txt:'Fermé / inaccessible',alerte:true},
    {id:'ruine',txt:'En ruine',alerte:true},
  ]},
  { grp:'Équipement & ressources', items:[
    {id:'poele',txt:'Poêle / cheminée'},
    {id:'bois',txt:'Bois sur place'},
    {id:'couvertures',txt:'Couvertures'},
    {id:'matelas',txt:'Matelas'},
    {id:'eau',txt:'Eau'},
    {id:'nourriture',txt:'Nourriture'},
  ]},
  { grp:'Présence', items:[{id:'berger',txt:'Berger sur place'}]},
];
const BALISE_INFO = {};
BALISES.forEach(g => g.items.forEach(b => { BALISE_INFO[b.id] = {txt:b.txt, alerte:!!b.alerte}; }));

