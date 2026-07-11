// =============================================================================
// meteo.js — Météo Open-Meteo (gratuit, sans clé, altitude exacte)
// =============================================================================

const meteoCache = {};  // lat,lon -> données

const WMO_CODES = {
  0:  ['☀️',  'Ciel dégagé'],
  1:  ['🌤️',  'Peu nuageux'],
  2:  ['⛅',  'Partiellement nuageux'],
  3:  ['☁️',  'Couvert'],
  45: ['🌫️',  'Brouillard'],
  48: ['🌫️',  'Brouillard givrant'],
  51: ['🌦️',  'Bruine légère'],
  53: ['🌦️',  'Bruine modérée'],
  55: ['🌦️',  'Bruine dense'],
  61: ['🌧️',  'Pluie légère'],
  63: ['🌧️',  'Pluie modérée'],
  65: ['🌧️',  'Pluie forte'],
  71: ['🌨️',  'Neige légère'],
  73: ['🌨️',  'Neige modérée'],
  75: ['❄️',  'Neige forte'],
  77: ['🌨️',  'Grains de neige'],
  80: ['🌦️',  'Averses légères'],
  81: ['🌧️',  'Averses modérées'],
  82: ['⛈️',  'Averses fortes'],
  85: ['🌨️',  'Averses de neige'],
  86: ['❄️',  'Averses de neige fortes'],
  95: ['⛈️',  'Orage'],
  96: ['⛈️',  'Orage avec grêle'],
  99: ['⛈️',  'Orage violent'],
};

function wmo(code) {
  return WMO_CODES[code] || ['🌡️', 'Inconnu'];
}

const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function directionVent(deg) {
  const dirs = ['N','NE','E','SE','S','SO','O','NO'];
  return dirs[Math.round(deg / 45) % 8];
}

async function chargerMeteo(r) {
  const cle = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
  if (meteoCache[cle]) return meteoCache[cle];

  const alt = r.alt ? `&elevation=${r.alt}` : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}${alt}`
    + `&current=temperature_2m,weathercode,windspeed_10m,winddirection_10m,precipitation,relative_humidity_2m`
    + `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max`
    + `&timezone=Europe%2FParis&forecast_days=7`;

  const rep = await fetchTimeout(url, 8000);
  if (!rep.ok) throw new Error('HTTP ' + rep.status);
  const data = await rep.json();
  meteoCache[cle] = data;
  return data;
}

async function majMeteo(r, prefixe='') {
  const box = document.getElementById(prefixe+'meteo-contenu');
  if (!box) return;

  let data;
  try { data = await chargerMeteo(r); }
  catch(e) {
    box.innerHTML = `<div class="meteo-err">Météo indisponible (${e.message})</div>`;
    return;
  }
  if (!prefixe && (actif === null || REFUGES[actif] !== r)) return;

  const c  = data.current;
  const d  = data.daily;
  const [icoNow, descNow] = wmo(c.weathercode);

  // Aujourd'hui
  let html = `
  <div class="meteo-now">
    <div class="meteo-now-ico">${icoNow}</div>
    <div class="meteo-now-info">
      <div class="meteo-now-temp">${Math.round(c.temperature_2m)}°C</div>
      <div class="meteo-now-desc">${descNow}</div>
      <div class="meteo-now-details">
        <span class="meteo-now-detail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>
          ${Math.round(c.windspeed_10m)} km/h ${directionVent(c.winddirection_10m)}
        </span>
        <span class="meteo-now-detail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5S5 10 5 14a7 7 0 0 0 14 0c0-4-7-11.5-7-11.5Z"/></svg>
          ${c.relative_humidity_2m}%
        </span>
        ${c.precipitation > 0 ? `<span class="meteo-now-detail">🌧️ ${c.precipitation} mm</span>` : ''}
      </div>
    </div>
  </div>`;

  // 6 prochains jours
  html += '<div class="meteo-jours">';
  for (let i = 1; i <= 6; i++) {
    const date  = new Date(d.time[i]);
    const nom   = JOURS[date.getDay()];
    const [ico] = wmo(d.weathercode[i]);
    const pluie = d.precipitation_sum[i] > 0 ? `${d.precipitation_sum[i]} mm` : '';
    html += `
    <div class="meteo-jour">
      <div class="meteo-jour-nom">${nom}</div>
      <div class="meteo-jour-ico">${ico}</div>
      <div class="meteo-jour-max">${Math.round(d.temperature_2m_max[i])}°</div>
      <div class="meteo-jour-min">${Math.round(d.temperature_2m_min[i])}°</div>
      ${pluie ? `<div class="meteo-jour-pluie">${pluie}</div>` : ''}
    </div>`;
  }
  html += '</div>';
  html += `<div class="meteo-src">Open-Meteo · ${r.alt ? 'altitude ' + r.alt + ' m' : 'données locales'} · mis à jour maintenant</div>`;

  box.innerHTML = html;
}
