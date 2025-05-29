document.addEventListener("DOMContentLoaded", function () {
  const map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 6,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Restrict map panning to world bounds
  const southWest = L.latLng(-60, -180);
  const northEast = L.latLng(85, 180);
  const bounds = L.latLngBounds(southWest, northEast);
  map.setMaxBounds(bounds);
  map.on('drag', function() {
    map.panInsideBounds(bounds, { animate: false });
  });

  // Smoother, slower scroll zoom
  map.scrollWheelZoom.disable();
  map.on('focus', function() { map.scrollWheelZoom.enable(); });
  map.on('blur', function() { map.scrollWheelZoom.disable(); });
  map.options.zoomAnimation = true;
  map.options.zoomAnimationThreshold = 8;
  map.options.wheelPxPerZoomLevel = 120;

  let markers = [], currentCountry = '';

  function timeAgo(iso) {
    let diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return Math.floor(diff) + 's ago';
    diff /= 60;
    if (diff < 60) return Math.floor(diff) + 'm ago';
    diff /= 60;
    return Math.floor(diff) + 'h ago';
  }

  function loadEvents(cc = '') {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const list = document.getElementById('events');
    list.innerHTML = '';
    let url = window.eventsApiUrl;
    if (cc) {
      url += '?country_code=' + encodeURIComponent(cc);
    }
    fetch(url)
      .then(r => r.json())
      .then(data => {
        data.events.filter(e => !cc || e.country_code === cc)
          .forEach(e => {
            const m = L.circleMarker([e.lat, e.lng], { radius: 8 })
              .addTo(map)
              .bindPopup(`<strong>${e.title}</strong><br>${e.description}`)
              .setStyle({ color: '#1abc9c', weight: 2, fillOpacity: 0.8 });
            m.category = e.category;
            m.country = e.country_code;
            m.created_at = e.created_at;
            markers.push(m);

            const li = document.createElement('li');
            const titleSpan = document.createElement('span');
            titleSpan.textContent = e.title;
            const timeSpan = document.createElement('span');
            timeSpan.className = 'time-ago';
            timeSpan.textContent = timeAgo(e.created_at);
            li.appendChild(titleSpan);
            li.appendChild(timeSpan);
            li.addEventListener('click', () => {
              map.setView([e.lat, e.lng], 5);
              m.openPopup();
            });
            list.appendChild(li);
          });
        filterByCategory();
      });
  }

  function filterByCategory() {
    const checked = Array.from(document.querySelectorAll('input[name="cat"]:checked'))
      .map(cb => cb.value);
    markers.forEach(m => {
      const okCat = checked.includes(m.category);
      const okCountry = !currentCountry || m.country === currentCountry;
      if (okCat && okCountry) m.addTo(map);
      else if (map.hasLayer(m)) map.removeLayer(m);
    });
  }

  document.getElementById('catForm').addEventListener('change', filterByCategory);
  document.getElementById('countrySelect').addEventListener('change', e => {
    currentCountry = e.target.value;
    const centers = { US: [38, -97], GB: [54, -2], DE: [51, 10], IN: [20, 77] };
    if (currentCountry && centers[currentCountry]) map.setView(centers[currentCountry], 5);
    else map.setView([20, 0], 2);
    loadEvents(currentCountry);
  });

  loadEvents();
});