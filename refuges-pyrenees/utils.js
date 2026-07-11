// =============================================================================
// utils.js — Fonctions utilitaires
// =============================================================================

function distM(lat1,lon1,lat2,lon2){
  const R=6371000, toR=x=>x*Math.PI/180;
  const dLat=toR(lat2-lat1), dLon=toR(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function fmtDist(m){ return m<1000 ? Math.round(m/10)*10+' m' : (m/1000).toFixed(1)+' km'; }

function fmtBool(v){
  if(v===null||v===undefined||v==='') return null;
  const s=v.toString().toLowerCase();
  if(['oui','yes','1','true','vrai','o'].includes(s)) return 'Oui';
  if(['non','no','0','false','faux','n'].includes(s)) return 'Non';
  return v.toString();
}

function fmtDate(d){
  const [a,m,j]=d.split('-');
  const mois=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${parseInt(j)} ${mois[parseInt(m)-1]} ${a}`;
}

async function fetchTimeout(url, ms, opts={}){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, {...opts, signal: ctrl.signal}); }
  finally { clearTimeout(t); }
}

function categorie(t){
  t=+t;
  if(t===5||t===6) return 'refuge';
  if(t===2||t===3) return 'libre';
  if(t===1||t===4) return 'cabane';
  if(t===7) return 'ruine';
  return 'cabane';
}

function tagTxt(cat){return {refuge:'Refuge gardé',libre:'Cabane ouverte',cabane:'Cabane / abri',ruine:'Ruine'}[cat]}

function lireCoord(g){
  // GeoJSON Point => [lon,lat,(alt)]
  if(g?.type==='Point') return {lon:g.coordinates[0],lat:g.coordinates[1],alt:g.coordinates[2]};
  return null;
}

function typeEau(t){
  if(t.natural==='spring') return 'Source';
  if(t.amenity==='drinking_water') return 'Eau potable';
  if(t.man_made==='water_well') return 'Puits';
  if(t.man_made==='water_tap'||t.man_made==='water_point') return 'Robinet / captage';
  if(t.man_made==='reservoir_covered'||t.landuse==='reservoir'||t.water==='reservoir') return 'Réservoir';
  if(t.waterway==='waterfall') return 'Cascade';
  // Plans d'eau : distingue lac / étang selon le nom ou le tag
  if(t.natural==='water'||t.water){
    const nom=(t.name||'').toLowerCase();
    if(t.water==='lake'||nom.includes('lac')||nom.includes('estany')||nom.includes('ibon')) return 'Lac';
    if(t.water==='pond'||nom.includes('étang')||nom.includes('etang')||nom.includes('estany')) return 'Étang';
    return 'Plan d\'eau';
  }
  if(t.waterway==='river') return 'Rivière';
  if(t.waterway==='stream') return 'Ruisseau';
  if(t.waterway==='canal') return 'Canal';
  if(t.waterway==='drain'||t.waterway==='ditch') return 'Canal';
  if(t.waterway) return 'Cours d\'eau';
  return 'Point d\'eau';
}

function scoreEau(type){
  return {'Eau potable':0,'Source':1,'Robinet / captage':2,'Réservoir':3,'Puits':4,'Cascade':5,'Ruisseau':6,'Cours d\'eau':7,'Canal':8,'Lac':9,'Étang':10,'Plan d\'eau':11,'Rivière':12,'Point d\'eau':13}[type] ?? 14;
}

function familleEau(type){
  if(['Source','Eau potable','Fontaine','Robinet / captage','Puits'].includes(type)) return 'ponctuel';
  if(['Ruisseau','Rivière','Cours d\'eau'].includes(type)) return 'cours';
  return 'plan';
}

function balisesFormHTML(){
  return BALISES.map(g=>`
    <div class="balises-grp">
      <div class="balises-grp-lbl">${g.grp}</div>
      <div class="balises-choix">
        ${g.items.map(b=>`<button type="button" class="balise-btn${b.alerte?' alerte':''}" data-bal="${b.id}" onclick="this.classList.toggle('actif')">${b.txt}</button>`).join('')}
      </div>
    </div>`).join('');
}

