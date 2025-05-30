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

  let markers = [], currentCountry = '', allEvents = [];

  function timeAgo(iso) {
    let diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return Math.floor(diff) + 's ago';
    diff /= 60;
    if (diff < 60) return Math.floor(diff) + 'm ago';
    diff /= 60;
    return Math.floor(diff) + 'h ago';
  }

  const catButtons = document.getElementById('catButtons');
  let selectedCategories = [];

  // Fetch categories from the backend and create the legend
  fetch('/get_categories')
    .then(r => r.json())
    .then(data => {
      // Build a categoryColors map for use elsewhere if needed
      window.categoryColors = {};
      data.categories.forEach(cat => {
        window.categoryColors[cat.name] = cat.color;
      });
      createLegend(data.categories);

      // Initialize selectedCategories to all categories after colors are loaded
      selectedCategories = data.categories.map(cat => cat.name);

      // Make sure all buttons are selected visually
      if (catButtons) {
        catButtons.querySelectorAll('.cat-btn').forEach(btn => btn.classList.add('selected'));
      }

      // Now load events (after categories/colors are ready)
      loadEvents();
    });

  // Category button filter logic
  if (catButtons) {
    catButtons.addEventListener('click', function(e) {
      if (e.target.classList.contains('cat-btn')) {
        e.target.classList.toggle('selected');
        // Update selectedCategories
        selectedCategories = Array.from(catButtons.querySelectorAll('.cat-btn.selected')).map(btn => btn.dataset.cat);
        filterByCategory();
      }
    });
  }

  function loadEvents(cc = '') {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    let url = window.eventsApiUrl;
    if (cc) {
      url += '?country_code=' + encodeURIComponent(cc);
    }
    fetch(url)
      .then(r => r.json())
      .then(data => {
        allEvents = data.events; // Save all events for filtering
        filterByCategory();      // Filter and render based on selected categories
      });
  }

  function filterByCategory() {
    // If selectedCategories is empty, show nothing
    if (!selectedCategories.length) {
      markers.forEach(m => map.removeLayer(m));
      markers = [];
      renderSidebar([]);
      return;
    }

    // Filter events by selected categories
    const filteredEvents = allEvents.filter(e => selectedCategories.includes(e.category));

    // Remove all markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Add only filtered markers
    filteredEvents.forEach(e => {
      const color = window.categoryColors[e.category] || "#7f8c8d";
      const m = L.circleMarker([e.lat, e.lng], { 
        radius: 10, 
        color: color, 
        weight: 3, 
        fillColor: color, 
        fillOpacity: 0.85 
      })
        .addTo(map)
        .bindPopup(
          `<strong>${e.title}</strong><br>${e.description}<br><em>${e.category}</em>`
        );
      m.category = e.category;
      m.country = e.country_code;
      m.created_at = e.created_at;
      markers.push(m);

      m.on('mouseover', function() {
        this.setStyle({ radius: 14, weight: 5 });
        this.openPopup();
      });
      m.on('mouseout', function() {
        this.setStyle({ radius: 10, weight: 3 });
        this.closePopup();
      });
    });

    renderSidebar(filteredEvents);
  }

  function renderSidebar(events) {
    const sidebar = document.getElementById('events');
    sidebar.innerHTML = '';
    events.slice(0, 10).forEach((e, idx) => {
      let desc = e.description || '';
      let shortDesc = desc.length > 120
        ? desc.slice(0, 80) + '<br>' + desc.slice(80, 120) + '<br><em>Read more...</em>'
        : desc.replace(/\n/g, '<br>');
      const li = document.createElement('li');
      li.setAttribute('data-category', e.category);
      li.setAttribute('data-idx', idx);
      li.innerHTML = `<strong>${e.title}</strong><br><span>${shortDesc}</span>`;
      li.addEventListener('click', function() {
        // Find the marker for this event and jump to it
        const marker = markers.find(m =>
          m.category === e.category &&
          Math.abs(m.getLatLng().lat - e.lat) < 1e-6 &&
          Math.abs(m.getLatLng().lng - e.lng) < 1e-6
        );
        if (marker) {
          map.setView(marker.getLatLng(), 6, { animate: true });
          marker.openPopup();
          // Highlight the clicked event
          sidebar.querySelectorAll('li').forEach(li => li.classList.remove('active'));
          li.classList.add('active');
        }
      });
      sidebar.appendChild(li);
    });
  }

  document.getElementById('countrySelect').addEventListener('change', e => {
    currentCountry = e.target.value;
    const centers = { US: [38, -97], GB: [54, -2], DE: [51, 10], IN: [20, 77] };
    if (currentCountry && centers[currentCountry]) map.setView(centers[currentCountry], 5);
    else map.setView([20, 0], 2);
    loadEvents(currentCountry);
  });

  function createLegend(categories) {
    if (window.legendControl) {
      map.removeControl(window.legendControl);
    }
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'info legend');
      div.style.background = "#fff";
      div.style.padding = "10px";
      div.style.borderRadius = "8px";
      div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      let html = "<strong>Categories</strong><br>";
      categories.forEach(cat => {
        html += `<span style="display:inline-block;width:16px;height:16px;background:${cat.color};margin-right:6px;border-radius:50%;"></span>${cat.name}<br>`;
      });
      div.innerHTML = html;
      return div;
    };
    legend.addTo(map);
    window.legendControl = legend;
  }
});