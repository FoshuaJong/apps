    (function(){var g=document.getElementById('grid-spotlight');document.addEventListener('mousemove',function(e){g.style.setProperty('--mx',e.clientX+'px');g.style.setProperty('--my',e.clientY+'px');});document.addEventListener('mouseleave',function(){g.style.setProperty('--mx','-999px');g.style.setProperty('--my','-999px');});})();
  

    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  

    const PRESETS = [
      '#FFFFFF', // Pure White (Active/Primary)
      '#9B9A97', // Muted Gray (Secondary/Inactive)
      '#2DD4BF', // The Sharp Accent (Functional Signal)
      '#4B5563', // Deep Slate (Subtle Borders/Guides)
    ];

    // --- STATE ---
    let connections = [];
    let cities = [];        // mutable sorted array (built-ins + customs)
    let baseCities = [];    // immutable reference to built-in cities from cities.json
    let errorTimer = null;
    let activeColorPicker = null;     // arc connection index with picker open, or null
    let activeCityColorPicker = null; // city name with label picker open, or null
    const cityColors = new Map();     // city name → hex color
    const pulsingCitiesOut = new Set();  // cities currently showing a pulse ring outwards
    const pulsingCitiesIn = new Set();  // cities that currently showing a pulse ring inwards
    let swapped = false;              // swap origin/destination direction

    // New state for the "Add Connection" pickers

    // --- GLOBE ---
    const globeViz = document.getElementById('globeViz');

    function getPoints() {
      const seen = new Set();
      const points = [];
      for (const { cityA, cityB } of connections) {
        if (!seen.has(cityA.name)) { seen.add(cityA.name); points.push(cityA); }
        if (!seen.has(cityB.name)) { seen.add(cityB.name); points.push(cityB); }
      }
      return points;
    }

    let globe = null;
    let pendingPov = null;
    let pendingAutoRotate = null;
    let pendingLoadMsg = false;

    function updateGlobe() {
      if (!globe) return;
      const pts = getPoints();
      // Sync cityColors: seed new cities, prune removed ones
      const activeNames = new Set(pts.map(p => p.name));
      for (const name of cityColors.keys()) {
        if (!activeNames.has(name)) cityColors.delete(name);
      }
      for (const p of pts) {
        if (!cityColors.has(p.name)) cityColors.set(p.name, PRESETS[0]);
      }

      const labelPts = pts.map(p => ({ ...p, labelColor: cityColors.get(p.name) || PRESETS[0] }));
      globe
        .arcsData([...connections])
        .pointsData(pts)
        .htmlElementsData(labelPts);
      renderCityLabels();
      saveState();
    }


    async function buildDotTexture() {
      const W = 2048*3, H = 1024*3;

      const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then(r => r.json());
      const landFeature = topojson.feature(topo, topo.objects.land);
      const features = landFeature.type === 'FeatureCollection' ? landFeature.features : [landFeature];

      // Rasterize land polygons onto a mask canvas (equirectangular projection)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = W; maskCanvas.height = H;
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.fillStyle = 'white';
      maskCtx.beginPath();
      for (const feature of features) {
        const geom = feature.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        for (const poly of polys) {
          for (const ring of poly) {
            let prevLng = null;
            for (let i = 0; i < ring.length; i++) {
              const [lng, lat] = ring[i];
              const x = (lng + 180) / 360 * W;
              const y = (90 - lat) / 180 * H;
              if (i === 0) {
                maskCtx.moveTo(x, y);
              } else if (Math.abs(lng - prevLng) > 180) {
                // Antimeridian crossing — close current segment, start new one
                maskCtx.closePath();
                maskCtx.moveTo(x, y);
              } else {
                maskCtx.lineTo(x, y);
              }
              prevLng = lng;
            }
            maskCtx.closePath();
          }
        }
      }
      maskCtx.fill();
      // Antarctica encircles the south pole — antimeridian splitting leaves a gap there.
      // Everything south of lat −84.5° is Antarctic ice at 110m resolution, so fill it solid.
      maskCtx.fillStyle = 'white';
      maskCtx.fillRect(0, Math.round((90 + 84.5) / 180 * H), W, H);
      const maskData = maskCtx.getImageData(0, 0, W, H).data;

      // Draw dot grid where land pixels are filled
      const dotCanvas = document.createElement('canvas');
      dotCanvas.width = W; dotCanvas.height = H;
      const dotCtx = dotCanvas.getContext('2d');
      dotCtx.fillStyle = '#151517'; // --bg
      dotCtx.fillRect(0, 0, W, H);
      dotCtx.fillStyle = '#9B9A97'; // --text-secondary
      const spacing = 6, radius = 1.5;
      for (let y = spacing / 2; y < H; y += spacing) {
        for (let x = spacing / 2; x < W; x += spacing) {
          const idx = (Math.round(y) * W + Math.round(x)) * 4;
          if (maskData[idx] > 128) {
            dotCtx.beginPath();
            dotCtx.arc(x, y, radius, 0, Math.PI * 2);
            dotCtx.fill();
          }
        }
      }

      return new Promise(resolve => dotCanvas.toBlob(blob => resolve(URL.createObjectURL(blob))));
    }

    function getGlobeSize() {
      const wrapper = document.querySelector('.globe-wrapper');
      const w = wrapper.offsetWidth;
      const h = wrapper.offsetHeight || w; // on mobile the wrapper is auto-height; fall back to square
      return { w, h };
    }

    // --- RESIZE ---
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!globe) return;
        const { w, h } = getGlobeSize();
        globe.width(w).height(h);
      }, 200);
    });

    buildDotTexture().then(textureUrl => {
      const { w, h } = getGlobeSize();
      globe = Globe()
        .width(w)
        .height(h)
        .backgroundColor('rgba(0,0,0,0)')
        .atmosphereColor('#1F2937')
        .showAtmosphere(0)
        .globeImageUrl(textureUrl)
        .arcsData([])
        .arcStartLat(d => d.cityA.lat)
        .arcStartLng(d => d.cityA.lng)
        .arcEndLat(d => d.cityB.lat)
        .arcEndLng(d => d.cityB.lng)
        .arcColor(d => d.color)
        .arcAltitudeAutoScale(0.4)
        .arcStroke(0.5)
        .arcDashLength(0.6)
        .arcDashGap(0.4)
        .arcDashAnimateTime(2000)
        .pointsData([])
        .pointLat(d => d.lat)
        .pointLng(d => d.lng)
        .pointColor(d => cityColors.get(d.name) || PRESETS[0])
        .pointAltitude(0.005)
        .pointRadius(0.6)
        .htmlElementsData([])
        .htmlLat(d => d.lat)
        .htmlLng(d => d.lng)
        .htmlAltitude(0.01)
        .htmlElement(d => {
          const wrapper = document.createElement('div');
          // Cleaned up the duplicate CSS properties from the original
          wrapper.style.cssText = 'position:relative;pointer-events:none;transform: translate(-50%, -50%);';
          
          const color = d.labelColor || PRESETS[0];

          if (pulsingCitiesOut.has(d.name)) {
            const ring = document.createElement('div');
            ring.classList.add('city-pulse-ring', 'ring-send');
            ring.style.borderColor = color;
            wrapper.appendChild(ring);
          }
          if (pulsingCitiesIn.has(d.name)) {
            const ring = document.createElement('div');
            ring.classList.add('city-pulse-ring', 'ring-receive');
            ring.style.borderColor = color;
            wrapper.appendChild(ring);
          }
          
          const label = document.createElement('div');
          label.className = 'city-label-container';
          
          // Apply the dynamic color to the text, text-shadow (60% opacity), and border (30% opacity)
          label.style.borderColor = color; // Solid border (no transparency)
          
          label.textContent = d.name;
          wrapper.appendChild(label);
          return wrapper;
        })
        (globeViz);

      const initAutoRotate = pendingAutoRotate !== null ? pendingAutoRotate : true;
      globe.controls().autoRotate = initAutoRotate;
      pendingAutoRotate = null;
      globe.controls().autoRotateSpeed = 1.5;
      globe.controls().enableZoom = true;
      globe.controls().addEventListener('end', saveState);

      // Click-to-pause: distinguish click vs drag by tracking pointer travel distance
      const hint = document.getElementById('rotateHint');
      let rotateHintTimer;
      function showRotateHint(text, persist = false) {
        clearTimeout(rotateHintTimer);
        hint.textContent = text;
        hint.classList.add('visible');
        if (!persist) {
          rotateHintTimer = setTimeout(() => hint.classList.remove('visible'), 1800);
        }
      }
      let pointerDownPos = null;
      globeViz.addEventListener('pointerdown', e => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
      });
      globeViz.addEventListener('pointerup', e => {
        if (!pointerDownPos) return;
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        pointerDownPos = null;
        if (dist > 4) return; // it was a drag, not a click
        const rotating = globe.controls().autoRotate;
        globe.controls().autoRotate = !rotating;
        saveState();
        if (rotating) {
          showRotateHint('Paused', true);
        } else {
          showRotateHint('Playing ▶︎');
        }
      });

      globe.pointOfView(pendingPov || { altitude: 2 });
      pendingPov = null;
      updateGlobe();
      if (pendingLoadMsg) {
        pendingLoadMsg = false;
        showShareStatus('Setting up the view…', false, true);
        setTimeout(() => showShareStatus('Globe loaded from shared link'), 800);
      }
      showRotateHint(initAutoRotate ? 'Playing ▶︎' : 'Paused', !initAutoRotate);
    });

    // --- UI ---
    const cityASelect = document.getElementById('cityA');
    const cityBSelect = document.getElementById('cityB');
    const addBtn = document.getElementById('addBtn');
    const addError = document.getElementById('addError');
    const connectionList = document.getElementById('connectionList');
    const customCityToggle = document.getElementById('customCityToggle');
    const customCityForm = document.getElementById('customCityForm');
    const customCityInput = document.getElementById('customCityInput');
    const customCityLookupBtn = document.getElementById('customCityLookupBtn');
    const lookupResults = document.getElementById('lookupResults');
    const labelCityA = document.getElementById('labelCityA');
    const labelCityB = document.getElementById('labelCityB');
    const swapBtn = document.getElementById('swapBtn');

    function updateSwapState() {
      labelCityA.textContent = swapped ? 'Destination' : 'Origin';
      labelCityB.textContent = swapped ? 'Origin' : 'Destination';
      
      swapBtn.setAttribute('aria-pressed', String(swapped));
    }

    swapBtn.addEventListener('click', () => {
      swapped = !swapped;
      swapBtn.classList.toggle('active', swapped);
      updateSwapState();
    });

    // --- TABS ---
    const tabConnections = document.getElementById('tabConnections');
    const tabCityLabels = document.getElementById('tabCityLabels');
    const panelConnections = document.getElementById('panelConnections');
    const panelCityLabels = document.getElementById('panelCityLabels');

    function switchTab(tab) {
      const isConnections = tab === 'connections';
      tabConnections.classList.toggle('active', isConnections);
      tabCityLabels.classList.toggle('active', !isConnections);
      panelConnections.classList.toggle('active', isConnections);
      panelCityLabels.classList.toggle('active', !isConnections);
    }

    tabConnections.addEventListener('click', () => switchTab('connections'));
    tabCityLabels.addEventListener('click', () => { if (!tabCityLabels.disabled) switchTab('cityLabels'); });

    connectionList.addEventListener('click', (e) => {
      // Remove connection
      const removeBtn = e.target.closest('.connection-remove');
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index, 10);
        connections.splice(idx, 1);
        if (activeColorPicker === idx) activeColorPicker = null;
        else if (activeColorPicker > idx) activeColorPicker--;
        renderConnections();
        updateGlobe();
        populateSelect(cityASelect, cityBSelect.value);
        populateSelect(cityBSelect, cityASelect.value);
        return;
      }

      // Toggle colour picker
      const dotBtn = e.target.closest('.connection-dot-btn');
      if (dotBtn) {
        const idx = parseInt(dotBtn.dataset.index, 10);
        activeColorPicker = activeColorPicker === idx ? null : idx;
        renderConnections();
        return;
      }

      // Apply colour swatch
      const swatch = e.target.closest('.color-swatch');
      if (swatch) {
        const idx = parseInt(swatch.dataset.index, 10);
        connections[idx].color = swatch.dataset.color;
        activeColorPicker = null;
        renderConnections();
        updateGlobe();
        return;
      }
    });

    document.getElementById('tabClear').addEventListener('click', () => {
      connections.length = 0;
      renderConnections();
      updateGlobe();
      populateSelect(cityASelect, cityBSelect.value);
      populateSelect(cityBSelect, cityASelect.value);
    });

    // For a given origin, return its already-used destinations (blocks re-using same route)
    // For a given destination, return its already-used origins (same logic, other direction)
    function getUsedPairs(cityIdx, asOrigin) {
      if (cityIdx === '' || cityIdx == null) return new Set();
      const city = cities[parseInt(cityIdx, 10)];
      if (!city) return new Set();
      return new Set(
        connections
          .filter(c => asOrigin ? c.cityA.name === city.name : c.cityB.name === city.name)
          .map(c => asOrigin ? c.cityB.name : c.cityA.name)
      );
    }

    function populateSelect(sel, excludeIdx) {
      const current = sel.value;
      const isDestination = sel === cityBSelect;
      const alreadyConnected = getUsedPairs(excludeIdx, isDestination);
      sel.innerHTML = '<option value="">Select a city…</option>';
      cities.forEach((city, i) => {
        if (String(i) === String(excludeIdx)) return;
        if (alreadyConnected.has(city.name)) return;
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = city.country ? `${city.name}, ${city.country}` : city.name;
        sel.appendChild(opt);
      });
      sel.value = current;
    }

    function populateSelects() {
      populateSelect(cityASelect, cityBSelect.value);
      populateSelect(cityBSelect, cityASelect.value);
      addBtn.disabled = false;
      addBtn.textContent = 'Connect';
    }

    cityASelect.addEventListener('change', () => populateSelect(cityBSelect, cityASelect.value));
    cityBSelect.addEventListener('change', () => populateSelect(cityASelect, cityBSelect.value));

    function showError(msg) {
      clearTimeout(errorTimer);
      addError.textContent = msg;
      addError.classList.remove('success');
      addError.classList.add('visible');
      errorTimer = setTimeout(() => addError.classList.remove('visible'), 2500);
    }

    function showSuccess(msg) {
      clearTimeout(errorTimer);
      addError.textContent = msg;
      addError.classList.add('visible', 'success');
      errorTimer = setTimeout(() => addError.classList.remove('visible', 'success'), 2500);
    }

    // --- CUSTOM CITIES ---
    let customCities = [];

    function saveCustomCities() {
      localStorage.setItem('globe-custom-cities', JSON.stringify(
        customCities.map(c => [c.name, Math.round(c.lat * 1e4) / 1e4, Math.round(c.lng * 1e4) / 1e4, c.country])
      ));
    }

    function loadCustomCities() {
      try {
        const saved = JSON.parse(localStorage.getItem('globe-custom-cities') || '[]');
        if (Array.isArray(saved)) {
          customCities = saved.map(entry => {
            // Support both new array format [name,lat,lng,country] and old object format
            if (Array.isArray(entry)) {
              const [name, lat, lng, country] = entry;
              return { name, lat, lng, country, custom: true };
            }
            return { ...entry, custom: true };
          });
          cities.push(...customCities);
          cities.sort((a, b) => a.name.localeCompare(b.name));
        }
      } catch (e) { /* corrupt storage — ignore */ }
    }

    // Encode globe state to compact portable format.
    // Connections: [nameA, nameB] or [nameA, nameB, "#color"] (color omitted if default).
    // Custom cities: only those used in at least one connection, as [name, lat, lng, country].
    // Globe.gl attaches __threeObj* to city objects at render time — this function
    // only reads primitive name/coord fields, so render state never leaks into output.
    function encodeGlobeState() {
      const c = connections.map(({ cityA, cityB, color }) =>
          [cityA.name, cityB.name, color]
      );
      const state = { c };
      const usedNames = new Set(connections.flatMap(({ cityA, cityB }) => [cityA.name, cityB.name]));
      // Store label colors for every connected city — always explicit so shared links
      // are immune to future changes to the default color.
      if (usedNames.size > 0) {
        state.l = [...usedNames].map(name => [name, cityColors.get(name) || PRESETS[0]]);
      }
      const usedCustom = customCities.filter(city => usedNames.has(city.name));
      if (usedCustom.length) {
        state.x = usedCustom.map(city => [
          city.name,
          Math.round(city.lat * 1e4) / 1e4,
          Math.round(city.lng * 1e4) / 1e4,
          city.country,
        ]);
      }
      return state;
    }

    // Apply a decoded state object to the globe, replacing current connections and custom cities.
    function applyGlobeState(state) {
      cities = baseCities.slice();
      customCities = (state.x || []).map(([name, lat, lng, country]) =>
        ({ name, lat, lng, country, custom: true })
      );
      cities.push(...customCities);
      cities.sort((a, b) => a.name.localeCompare(b.name));
      saveCustomCities();
      connections = (state.c || []).map(([a, b, color]) => {
        const cityA = cities.find(c => c.name === a);
        const cityB = cities.find(c => c.name === b);
        if (!cityA || !cityB) return null;
        return { cityA, cityB, color: color || PRESETS[2] };
      }).filter(Boolean);
      cityColors.clear();
      // Restore label colors before updateGlobe() runs — updateGlobe only seeds
      // cities missing from the map, so these explicit values are preserved.
      if (Array.isArray(state.l)) {
        for (const [name, color] of state.l) cityColors.set(name, color);
      }
      // Restore view state — apply immediately if globe is ready, else defer to onGlobeReady
      const pov = Array.isArray(state.pov)
        ? { lat: state.pov[0], lng: state.pov[1], altitude: state.pov[2] }
        : null;
      const autoRotate = state.r !== undefined ? state.r === 1 : null;
      if (globe) {
        if (pov) globe.pointOfView(pov, 0);
        if (autoRotate !== null) globe.controls().autoRotate = autoRotate;
      } else {
        pendingPov = pov;
        pendingAutoRotate = autoRotate;
      }
      saveState();
    }

    function saveState() {
      try {
        localStorage.setItem('globe-state', JSON.stringify(encodeViewState(encodeGlobeState())));
      } catch (e) { /* storage full or unavailable — ignore */ }
    }

    function loadState() {
      try {
        const saved = JSON.parse(localStorage.getItem('globe-state') || 'null');
        if (!saved) return;
        // Support new compact format { c, x } and old verbose format { connections, cityColors }
        if (Array.isArray(saved.c)) {
          applyGlobeState(saved);
        } else if (Array.isArray(saved.connections)) {
          // Legacy: connections is array of { cityA: name|obj, cityB: name|obj, color }
          connections = saved.connections.map(conn => {
            const nameA = typeof conn.cityA === 'string' ? conn.cityA : conn.cityA?.name;
            const nameB = typeof conn.cityB === 'string' ? conn.cityB : conn.cityB?.name;
            const cityA = cities.find(c => c.name === nameA);
            const cityB = cities.find(c => c.name === nameB);
            if (!cityA || !cityB) return null;
            return { cityA, cityB, color: conn.color || PRESETS[2] };
          }).filter(Boolean);
          if (saved.cityColors && typeof saved.cityColors === 'object') {
            for (const [k, v] of Object.entries(saved.cityColors)) cityColors.set(k, v);
          }
        }
      } catch (e) { /* corrupt storage — ignore */ }
    }

    // --- SHARE / EXPORT / IMPORT ---
    let shareStatusTimer;
    let shareBtnTimer;

    function showShareStatus(msg, isError = false, persist = false) {
      const el = document.getElementById('shareStatus');
      el.textContent = msg;
      el.style.color = isError ? 'var(--text-muted)' : 'var(--accent)';
      clearTimeout(shareStatusTimer);
      if (!persist) {
        shareStatusTimer = setTimeout(() => { el.textContent = ''; }, 500);
      }
    }

    function setShareBtnState(s, url = '') {
      const btn = document.getElementById('shareBtn');
      const ghost = document.getElementById('shareUrlGhost');
      clearTimeout(shareBtnTimer);
      btn.dataset.state = s;
      if (s === 'saving') {
        btn.textContent = 'Saving…';
        btn.disabled = true;
      } else if (s === 'success') {
        btn.textContent = 'Copied';
        btn.disabled = false;
        ghost.textContent = url;
        ghost.classList.add('visible');
        shareBtnTimer = setTimeout(() => {
          ghost.classList.remove('visible');
          btn.dataset.state = 'idle';
          btn.textContent = 'Copy link';
        }, 2500);
      }
    }

    // Compress state to deflate-raw, encode as base64url (URL-safe, no padding).
    async function compressState(obj) {
      const json = JSON.stringify(obj);
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      writer.write(new TextEncoder().encode(json));
      writer.close();
      const buf = await new Response(stream.readable).arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function decompressState(b64url) {
      const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
      const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
      const stream = new DecompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const buf = await new Response(stream.readable).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(buf));
    }

    function encodeViewState(state) {
      if (globe) {
        const pov = globe.pointOfView();
        state.pov = [
          Math.round(pov.lat * 1e4) / 1e4,
          Math.round(pov.lng * 1e4) / 1e4,
          Math.round(pov.altitude * 1e4) / 1e4,
        ];
        state.r = globe.controls().autoRotate ? 1 : 0;
      }
      return state;
    }

    async function shareGlobe() {
      if (connections.length === 0) {
        showShareStatus('Add connections first', true);
        return;
      }
      setShareBtnState('saving');
      const state = encodeViewState(encodeGlobeState());
      try {
        const res = await fetch('/globe/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
        if (!res.ok) throw new Error('API error');
        const { id } = await res.json();
        const url = `${location.origin}/globe/#${id}`;
        history.replaceState(null, '', `#${id}`);
        await navigator.clipboard.writeText(url).catch(() => {});
        setShareBtnState('success', url);
      } catch {
        // Fallback: compressed direct URL (no KV dependency)
        const encoded = await compressState(state);
        const url = `${location.origin}/globe/#v2=${encoded}`;
        history.replaceState(null, '', `#v2=${encoded}`);
        await navigator.clipboard.writeText(url).catch(() => {});
        setShareBtnState('success', url);
      }
    }

    let exportBtnTimer;
    function exportGlobe() {
      const data = JSON.stringify(encodeViewState(encodeGlobeState()), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `globe-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const btn = document.getElementById('exportBtn');
      btn.textContent = 'Exported';
      clearTimeout(exportBtnTimer);
      exportBtnTimer = setTimeout(() => { btn.textContent = 'Export'; }, 2000);
    }

    function importGlobe() {
      document.getElementById('importFile').click();
    }

    function showConfirm(message) {
      return new Promise(resolve => {
        const backdrop = document.getElementById('confirmBackdrop');
        document.getElementById('confirmMessage').textContent = message;
        backdrop.classList.add('visible');
        const ok = document.getElementById('confirmOk');
        const cancel = document.getElementById('confirmCancel');
        function close(result) {
          backdrop.classList.remove('visible');
          ok.removeEventListener('click', onOk);
          cancel.removeEventListener('click', onCancel);
          document.removeEventListener('keydown', onKey);
          resolve(result);
        }
        const onOk = () => close(true);
        const onCancel = () => close(false);
        const onKey = e => { if (e.key === 'Escape') close(false); };
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
      });
    }

    let importBtnTimer;
    document.getElementById('importFile').addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const confirmed = connections.length === 0 ||
        await showConfirm('This will replace your current globe. Continue?');
      if (!confirmed) { e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = function(ev) {
        const btn = document.getElementById('importBtn');
        try {
          const state = JSON.parse(ev.target.result);
          applyGlobeState(state);
          history.replaceState(null, '', location.pathname);
          populateSelects();
          renderConnections();
          updateGlobe();
          btn.textContent = 'Imported';
          clearTimeout(importBtnTimer);
          importBtnTimer = setTimeout(() => { btn.textContent = 'Import'; }, 2000);
        } catch {
          showShareStatus('Invalid file', true);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    async function geocodeCity(query) {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '3');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'en');
      const res = await fetch(url, { headers: { 'User-Agent': 'apps.fong.nz/globe' } });
      if (!res.ok) throw new Error('Network error');
      return res.json();
    }

    function parseNominatimResult(result) {
      const addr = result.address || {};
      const name = addr.city || addr.town || addr.village || addr.municipality || result.display_name.split(',')[0].trim();
      const region = addr.state || addr.region || '';
      const country = addr.country || '';
      const _label = [name, region, country].filter(Boolean).join(', ');
      return { name, country, lat: parseFloat(result.lat), lng: parseFloat(result.lon), custom: true, _label };
    }

    function addCustomCity(city) {
      if (cities.some(c => c.name.toLowerCase() === city.name.toLowerCase())) {
        lookupResults.innerHTML = `<p class="connection-empty" style="padding-top:0.4rem;color:var(--color-error)">"${city.name}" is already in the list.</p>`;
        return;
      }
      const { _label, ...stored } = city;
      customCities.push(stored);
      cities.push(stored);
      cities.sort((a, b) => a.name.localeCompare(b.name));
      saveCustomCities();
      populateSelects();
      const newIdx = cities.findIndex(c => c.name === stored.name);
      if (newIdx !== -1) {
        cityASelect.value = String(newIdx);
        populateSelect(cityBSelect, cityASelect.value);
      }
      customCityForm.classList.remove('open');
      customCityToggle.textContent = '+ custom';
      customCityInput.value = '';
      lookupResults.innerHTML = '';
      showSuccess(`✓ ${city.name} added`);
    }

    // --- CUSTOM CITY EVENTS ---
    customCityToggle.addEventListener('click', () => {
      const isOpen = customCityForm.classList.toggle('open');
      customCityToggle.textContent = isOpen ? '− custom' : '+ custom';
      if (isOpen) {
        customCityInput.focus();
      } else {
        customCityInput.value = '';
        lookupResults.innerHTML = '';
      }
    });

    customCityInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') customCityLookupBtn.click();
    });

    customCityLookupBtn.addEventListener('click', async () => {
      const query = customCityInput.value.trim();
      if (!query) return;
      customCityLookupBtn.textContent = 'Searching…';
      customCityLookupBtn.disabled = true;
      lookupResults.innerHTML = '';
      try {
        const results = await geocodeCity(query);
        if (results.length === 0) {
          lookupResults.innerHTML = '<p class="connection-empty" style="padding-top:0.4rem">No places found.</p>';
        } else {
          results.forEach(result => {
            const city = parseNominatimResult(result);
            const btn = document.createElement('button');
            btn.className = 'lookup-result-btn';
            btn.type = 'button';
            btn.textContent = city._label;
            btn.addEventListener('click', () => addCustomCity(city));
            lookupResults.appendChild(btn);
          });
        }
      } catch (e) {
        lookupResults.innerHTML = '<p class="connection-empty" style="padding-top:0.4rem;color:var(--color-error)">Lookup failed — check your connection.</p>';
      } finally {
        customCityLookupBtn.textContent = 'Look up';
        customCityLookupBtn.disabled = false;
      }
    });

    function renderConnections() {
      tabConnections.textContent = connections.length > 0
        ? `Connections (${connections.length})`
        : 'Connections';
      document.getElementById('tabClear').classList.toggle('visible', connections.length >= 2);
      if (connections.length === 0) {
        connectionList.innerHTML = '<p class="connection-empty">No connections yet.</p>';
        return;
      }
      connectionList.innerHTML = '';
      connections.forEach(({ cityA, cityB, color }, i) => {
        const pickerOpen = activeColorPicker === i;
        const item = document.createElement('div');
        item.className = 'connection-item';
        item.innerHTML = `
          <div class="connection-row">
            <button class="connection-dot-btn${pickerOpen ? ' picker-open' : ''}" data-index="${i}" style="background:${color}" aria-label="Change arc colour"></button>
            <span class="connection-label">${cityA.name} → ${cityB.name}</span>
            <button class="connection-remove" data-index="${i}" aria-label="Remove connection">×</button>
          </div>
          ${pickerOpen ? `<div class="color-picker-row">${PRESETS.map(p => `<button class="color-swatch${p === color ? ' active' : ''}" data-index="${i}" data-color="${p}" style="background:${p}" aria-label="Set colour ${p}"></button>`).join('')}</div>` : ''}
        `;
        connectionList.appendChild(item);
      });
    }

    function renderCityLabels() {
      const list = document.getElementById('cityLabelsList');
      const pts = getPoints();
      tabCityLabels.textContent = pts.length > 0
        ? `Cities (${pts.length})`
        : 'Cities';
      if (pts.length === 0) {
        tabCityLabels.disabled = true;
        if (!tabConnections.classList.contains('active')) switchTab('connections');
        list.innerHTML = '';
        return;
      }
      tabCityLabels.disabled = false;
      list.innerHTML = '';
      pts.forEach(city => {
        const color = cityColors.get(city.name) || PRESETS[0];
        const pickerOpen = activeCityColorPicker === city.name;
        const item = document.createElement('div');
        item.className = 'connection-item';
        item.innerHTML = `
          <div class="connection-row">
            <button class="connection-dot-btn${pickerOpen ? ' picker-open' : ''}" data-city="${city.name}" style="background:${color}" aria-label="Change label colour"></button>
            <span class="connection-label">${city.name}</span>
            <button class="connection-remove" data-remove-city="${city.name}" aria-label="Remove city">×</button>
          </div>
          ${pickerOpen ? `<div class="color-picker-row">${PRESETS.map(p => `<button class="color-swatch${p === color ? ' active' : ''}" data-city="${city.name}" data-color="${p}" style="background:${p}" aria-label="Set label colour"></button>`).join('')}</div>` : ''}
        `;
        list.appendChild(item);
      });
    }

    document.getElementById('cityLabelsList').addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-city]');
      if (removeBtn) {
        const name = removeBtn.dataset.removeCity;
        connections = connections.filter(c => c.cityA.name !== name && c.cityB.name !== name);
        if (activeCityColorPicker === name) activeCityColorPicker = null;
        cityColors.delete(name);
        renderConnections();
        updateGlobe();
        populateSelect(cityASelect, cityBSelect.value);
        populateSelect(cityBSelect, cityASelect.value);
        return;
      }
      const dotBtn = e.target.closest('.connection-dot-btn');
      if (dotBtn && dotBtn.dataset.city) {
        const name = dotBtn.dataset.city;
        activeCityColorPicker = activeCityColorPicker === name ? null : name;
        renderCityLabels();
        return;
      }
      const swatch = e.target.closest('.color-swatch');
      if (swatch && swatch.dataset.city) {
        cityColors.set(swatch.dataset.city, swatch.dataset.color);
        activeCityColorPicker = null;
        renderCityLabels();
        updateGlobe();
        return;
      }
    });

    addBtn.addEventListener('click', () => {
      const ai = cityASelect.value;
      const bi = cityBSelect.value;

      if (ai === '' || bi === '') {
        showError('Select both cities.');
        return;
      }
      if (ai === bi) {
        showError('Choose two different cities.');
        return;
      }

      const selA = cities[parseInt(ai, 10)];
      const selB = cities[parseInt(bi, 10)];
      const [cityA, cityB] = swapped ? [selB, selA] : [selA, selB];

      const isDuplicate = connections.some(c =>
        c.cityA.name === cityA.name && c.cityB.name === cityB.name
      );
      if (isDuplicate) {
        showError(`${cityA.name} → ${cityB.name} already exists.`);
        return;
      }

      connections.push({ cityA, cityB, color: PRESETS[2] });
      cityBSelect.value = '';
      populateSelect(cityASelect, cityBSelect.value);
      populateSelect(cityBSelect, cityASelect.value);
      renderConnections();
      updateGlobe();
      if (globe) {
        globe.pointOfView({ lat: cityA.lat, lng: cityA.lng, altitude: 2 }, 1200);

        // Pulse the origin city once the fly-to lands
        setTimeout(() => {
          pulsingCitiesOut.add(cityA.name);
          pulsingCitiesIn.add(cityB.name);
          updateGlobe();
          setTimeout(() => {
            pulsingCitiesOut.delete(cityA.name);
            pulsingCitiesIn.delete(cityB.name);
            updateGlobe();
          }, 2000);
        }, 1200);
      }
    });

    // --- BOOT ---
    fetch('cities.json')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load cities.json');
        return r.json();
      })
      .then(data => {
        baseCities = data; // immutable reference — used to reset cities on applyGlobeState
        cities = data.slice().sort((a, b) => a.name.localeCompare(b.name));
        loadCustomCities();
        loadState();

        const afterLoad = () => {
          populateSelects();
          renderConnections();
          updateGlobe();
        };

        // URL fragment routing:
        // #<id>     — 8-char KV ID (≤12 chars, no '=') → fetch from API
        // #v2=...   — deflate-compressed compact state (fallback)
        const hash = location.hash.slice(1); // strip leading #
        if (hash) {
          const isId = hash.length <= 12 && !hash.includes('=');
          if (isId) {
            showShareStatus('Loading globe…', false, true);
            fetch(`/globe/api/load?id=${encodeURIComponent(hash)}`)
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(state => {
                showShareStatus('Making connections…', false, true);
                applyGlobeState(state);
                history.replaceState(null, '', location.pathname);
                afterLoad();
                pendingLoadMsg = true;
              })
              .catch(() => afterLoad());
          } else if (hash.startsWith('v2=')) {
            showShareStatus('Loading globe…', false, true);
            decompressState(hash.slice(3))
              .then(state => {
                showShareStatus('Making connections…', false, true);
                applyGlobeState(state);
                history.replaceState(null, '', location.pathname);
                afterLoad();
                pendingLoadMsg = true;
              })
              .catch(() => afterLoad());
          } else {
            afterLoad();
          }
        } else {
          afterLoad();
        }
      })
      .catch(() => {
        cityASelect.innerHTML = '<option>Error loading cities</option>';
        cityBSelect.innerHTML = '<option>Error loading cities</option>';
        addBtn.textContent = 'Unavailable';
        addError.textContent = 'Could not load cities.json.';
        addError.classList.add('visible');
      });
  
