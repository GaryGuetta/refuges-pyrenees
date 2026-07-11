// =============================================================================
// geoloc.js — Autour de moi
// =============================================================================

let marqueurMoi = null, maPosition = null;

function autourDeMoi(){
  if(!navigator.geolocation){ alert("La géolocalisation n'est pas disponible sur ce navigateur."); return; }
  const btn=document.querySelector('.autour-moi');
  btn.classList.add('charge');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      btn.classList.remove('charge');
      const lat=pos.coords.latitude, lon=pos.coords.longitude;
      maPosition={lat,lon};
      if(marqueurMoi) map.removeLayer(marqueurMoi);
      const el=document.createElement('div'); el.className='marqueur-moi';
      marqueurMoi=L.marker([lat,lon],{icon:L.divIcon({html:el.outerHTML,className:'',iconSize:[18,18],iconAnchor:[9,9]}),zIndexOffset:1000}).addTo(map);
      // refuges proches
      const proches=REFUGES.map(r=>({r,d:distM(lat,lon,r.lat,r.lon)})).sort((a,b)=>a.d-b.d);
      const plusProche=proches[0];
      map.flyTo([lat,lon],12,{duration:.9});
      // trie la liste par distance et l'affiche
      triParDistance=true;
      appliquer();
      if(plusProche) {
        const km=plusProche.d<1000?Math.round(plusProche.d)+' m':(plusProche.d/1000).toFixed(1)+' km';
        marqueurMoi.bindTooltip(`Vous êtes ici · refuge le plus proche à ${km}`,{direction:'top',offset:[0,-10]}).openTooltip();
      }
    },
    err=>{
      btn.classList.remove('charge');
      alert("Impossible de récupérer ta position : "+err.message);
    },
    {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
  );
}

