function initMap() {
    // Dark blue ocean + land with white external borders
    const mapStyles = [
        { elementType: 'geometry', stylers: [{ color: '#0a1b35' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1b35' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
        // Hide most country/island labels to reduce distraction
        {
          featureType: 'administrative.country',
          elementType: 'labels.text',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'administrative.locality',
          elementType: 'labels.text',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'administrative.province',
          elementType: 'labels.text',
          stylers: [{ visibility: 'off' }]
        },
        // Hide all administrative strokes first, then explicitly enable country borders only
        {
          featureType: 'administrative',
          elementType: 'geometry.stroke',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'administrative.country',
          elementType: 'geometry.stroke',
          stylers: [{ visibility: 'on' }, { color: '#ffffff' }]
        },
        {
          featureType: 'administrative.land_parcel',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'administrative.neighborhood',
          stylers: [{ visibility: 'off' }]
        },
        {
            featureType: 'road',
            stylers: [{ "visibility": "off"}]
        },
        {
            featureType: 'transit',
            stylers: [{ "visibility": "off"}]
        },
        {
          featureType: 'poi',
          elementType: 'labels.text',
          stylers: [{ visibility: 'off' }]
        },
        {
          featureType: 'poi',
          elementType: 'geometry',
          stylers: [{ color: '#153056' }]
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#0a1b35' }]
        },
        {
          featureType: 'water',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#4e6d70' }]
        }
    ];

    // Australia's geographic boundaries
    const AUSTRALIA_BOUNDS = {
        north: -10.0,
        south: -44.0,
        west: 112.0,
        east: 154.0,
    };
      
    const mapEl = document.getElementById('map');
    const map = new google.maps.Map(mapEl, {
        center: { lat: -25.2744, lng: 133.7751 },
        zoom: 4,
        styles: mapStyles,
        restriction: {
            latLngBounds: AUSTRALIA_BOUNDS,
            strictBounds: false,
        },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy', // allows scroll/trackpad zoom without modifier keys
        keyboardShortcuts: true,
    });

    // Make sure Australia is fully visible on load
    const bounds = new google.maps.LatLngBounds(
        { lat: AUSTRALIA_BOUNDS.south, lng: AUSTRALIA_BOUNDS.west },
        { lat: AUSTRALIA_BOUNDS.north, lng: AUSTRALIA_BOUNDS.east }
    );
    map.fitBounds(bounds);

    // Focus map so arrow keys work immediately
    setTimeout(() => mapEl.focus(), 0);

    // Draw Australia's coastline outline as a white stroked polygon for visibility
    const AUS_GEOJSON = 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries/AUS.geo.json';
    map.data.setStyle({
        strokeColor: '#ffffff',
        strokeWeight: 4,
        strokeOpacity: 1,
        fillColor: '#0a1b35',
        fillOpacity: 1
    });
    map.data.loadGeoJson(AUS_GEOJSON);
    // expose for state highlight helpers
    window.griddyMap = map;

    // Animated grid overlay
    const canvas = document.getElementById('grid-overlay');
    const ctx = canvas.getContext('2d');
    const resize = () => {
        const rect = mapEl.getBoundingClientRect();
        canvas.width = Math.floor(rect.width * devicePixelRatio);
        canvas.height = Math.floor(rect.height * devicePixelRatio);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const dotSpacing = 36; // px between dots
    const baseRadius = 1.6; // minimum radius
    const radiusAmp = 2.2;  // how much radius grows at peak
    let t = 0;
    let animating = true;
    function draw() {
        if (!animating) {
            requestAnimationFrame(draw);
            return;
        }
        const w = canvas.width / devicePixelRatio;
        const h = canvas.height / devicePixelRatio;
        ctx.clearRect(0, 0, w, h);

        // phase determines brightness wave moving right->left
        const speed = 60; // pixels per second
        const now = performance.now();
        t = (now / 1000) * speed;

        for (let y = dotSpacing / 2; y < h; y += dotSpacing) {
            for (let x = dotSpacing / 2; x < w; x += dotSpacing) {
                const phase = ((w - x) + y * 0.35 + t) / 32; // angled, tighter waves
                // Stronger contrast using combined harmonics
                const wave = 0.5 + 0.5 * Math.sin(phase) * 0.9 + 0.1 * Math.sin(phase * 2.0);
                const intensity = 0.15 + 0.85 * wave; // higher highs, lower lows
                const r = baseRadius + radiusAmp * wave;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${intensity})`;
                ctx.fill();
            }
        }
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    // Pause canvas during map interactions for smoother feel
    map.addListener('dragstart', () => { animating = false; });
    map.addListener('zoom_changed', () => { animating = false; });
    map.addListener('idle', () => { animating = true; });

    // Smooth keyboard pan/zoom via panBy and small zoom steps
    const PAN_STEP = 80; // pixels
    function onKey(e) {
        const key = e.key.toLowerCase();
        let handled = true;
        if (key === 'arrowleft') map.panBy(-PAN_STEP, 0);
        else if (key === 'arrowright') map.panBy(PAN_STEP, 0);
        else if (key === 'arrowup') map.panBy(0, -PAN_STEP);
        else if (key === 'arrowdown') map.panBy(0, PAN_STEP);
        else if (key === '+' || key === '=') map.setZoom(map.getZoom() + 0.5);
        else if (key === '-' || key === '_') map.setZoom(map.getZoom() - 0.5);
        else handled = false;
        if (handled) e.preventDefault();
    }
    mapEl.addEventListener('keydown', onKey);

    // Example markers from screenshot (approximate)
    const pins = [
        { position: { lat: -32.2569, lng: 148.6010 }, title: 'Dubbo, NSW' },
        { position: { lat: -34.9285, lng: 138.6007 }, title: 'Adelaide, SA' },
        { position: { lat: -35.2809, lng: 149.1300 }, title: 'Canberra, ACT' },
    ];
    const whiteDot = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 5,
        fillColor: '#ffffff',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 1
    };
    pins.forEach((p) => new google.maps.Marker({ ...p, map, icon: whiteDot, optimized: true }));
}

// Basic UI interactions for the right panel
document.addEventListener('DOMContentLoaded', () => {
    // Toggle chip active state + ripple + icon glow
    document.querySelectorAll('.filters button').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            btn.classList.toggle('active');
            const rect = btn.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'chip-ripple';
            ripple.style.left = (e.clientX - rect.left) + 'px';
            ripple.style.top = (e.clientY - rect.top) + 'px';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Fake chat send to append a message
    const input = document.querySelector('.chat-input input');
    const sendBtn = document.querySelector('.chat-input button');
    const log = document.querySelector('.chat-log');
    const send = () => {
        const text = input.value.trim();
        if (!text) return;
        const wrap = document.createElement('div');
        wrap.className = 'message user-message';
        wrap.innerHTML = `<p class="sender">ME</p><p>${text}</p>`;
        log.appendChild(wrap);
        input.value = '';
        log.scrollTop = log.scrollHeight;
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') send();
    });

    // Build animated state dropdown (use abbreviations in UI)
    const states = [
        { abbr: 'NSW', name: 'New South Wales' },
        { abbr: 'VIC', name: 'Victoria' },
        { abbr: 'QLD', name: 'Queensland' },
        { abbr: 'SA', name: 'South Australia' },
        { abbr: 'WA', name: 'Western Australia' },
        { abbr: 'TAS', name: 'Tasmania' },
        { abbr: 'NT', name: 'Northern Territory' },
        { abbr: 'ACT', name: 'Australian Capital Territory' },
    ];
    const select = document.getElementById('state-select');
    if (select) {
        const trigger = select.querySelector('.select-trigger');
        const menu = select.querySelector('.select-menu');
        const value = trigger.querySelector('.value');
        states.forEach((s) => {
            const li = document.createElement('li');
            li.role = 'option';
            li.textContent = s.abbr;
            li.title = s.name;
            li.dataset.state = s.abbr;
            li.addEventListener('mouseenter', () => previewState(s.abbr));
            li.addEventListener('mouseleave', () => previewState(null));
            li.addEventListener('click', () => {
                value.textContent = s.abbr;
                menu.querySelectorAll('li').forEach(el => el.removeAttribute('aria-selected'));
                li.setAttribute('aria-selected', 'true');
                select.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
                highlightState(s.abbr);
            });
            menu.appendChild(li);
        });
        const toggle = () => {
            const isOpen = select.classList.toggle('open');
            trigger.setAttribute('aria-expanded', String(isOpen));
            if (isOpen) menu.focus();
        };
        trigger.addEventListener('click', toggle);
        // Open on hover to feel more alive (no auto-close on mouseleave to avoid fighty UX)
        trigger.addEventListener('mouseenter', () => {
            select.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        });
        document.addEventListener('click', (e) => {
            if (!select.contains(e.target)) {
                select.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
                previewState(null);
            }
        });
    }
});

// --- State highlighting using GeoJSON per-state shapes ---
let stateLayer; // custom Data layer for states
let stateLayerLoaded = false;
let selectedStateId = null;
let previewStateId = null;
// Reliable static CDN for Australian states
const STATE_GEOJSON = 'https://raw.githubusercontent.com/tonywr71/GeoJson-Data/master/australian-states.json';
// Indexes for fast lookup and bounds per state
const stateFeatureByAbbr = new Map();
const stateBoundsByAbbr = new Map();

function loadStatesLayer(map) {
    if (stateLayer && stateLayerLoaded) return Promise.resolve();
    if (!stateLayer) {
        stateLayer = new google.maps.Data({ map });
        stateLayer.setStyle({ visible: false });
    }
    return new Promise((resolve) => {
        // loadGeoJson supports a callback once all features are added
        stateLayer.loadGeoJson(STATE_GEOJSON, null, () => {
            stateLayerLoaded = true;
            buildStateIndexes();
            resolve();
        });
    });
}

function codeOrNameMatches(feature, targetAbbr, targetName) {
    const candidates = [
        feature.getProperty('STATE_ABBR'),
        feature.getProperty('STATE_CODE'),
        feature.getProperty('STATE_NAME'),
        feature.getProperty('name'),
    ].filter(Boolean);
    const tn = targetName.toUpperCase();
    return candidates.some((c) => {
        const v = String(c).toUpperCase();
        return (
            v === targetAbbr ||
            v === tn ||
            v.startsWith(tn) ||
            v.includes(targetAbbr)
        );
    });
}

function abbrToName(abbr) {
    switch (abbr) {
        case 'NSW': return 'New South Wales';
        case 'VIC': return 'Victoria';
        case 'QLD': return 'Queensland';
        case 'SA': return 'South Australia';
        case 'WA': return 'Western Australia';
        case 'TAS': return 'Tasmania';
        case 'NT': return 'Northern Territory';
        case 'ACT': return 'Australian Capital Territory';
        default: return abbr;
    }
}

function nameToAbbr(nameUpper) {
    const n = nameUpper.trim();
    if (n.includes('NEW SOUTH WALES')) return 'NSW';
    if (n.includes('VICTORIA')) return 'VIC';
    if (n.includes('QUEENSLAND')) return 'QLD';
    if (n.includes('SOUTH AUSTRALIA')) return 'SA';
    if (n.includes('WESTERN AUSTRALIA')) return 'WA';
    if (n.includes('TASMANIA')) return 'TAS';
    if (n.includes('NORTHERN TERRITORY')) return 'NT';
    if (n.includes('AUSTRALIAN CAPITAL TERRITORY')) return 'ACT';
    return null;
}

function buildStateIndexes() {
    stateFeatureByAbbr.clear();
    stateBoundsByAbbr.clear();
    stateLayer.forEach((feature) => {
        const props = ['STATE_ABBR','STATE_CODE','STATE_NAME','name'];
        let abbr = null;
        for (const k of props) {
            const val = feature.getProperty(k);
            if (!val) continue;
            const v = String(val).toUpperCase();
            if (['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'].includes(v)) { abbr = v; break; }
            const derived = nameToAbbr(v);
            if (derived) { abbr = derived; break; }
        }
        if (!abbr) return;
        // compute bounds
        const bounds = new google.maps.LatLngBounds();
        feature.getGeometry().forEachLatLng((latLng) => bounds.extend(latLng));
        stateFeatureByAbbr.set(abbr, feature);
        stateBoundsByAbbr.set(abbr, bounds);
    });
}

// --- Helpers to compute a zoom that fits bounds in current viewport ---
function latRad(lat) {
    const sin = Math.sin(lat * Math.PI / 180);
    const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
    return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
}

function getFitZoom(bounds, mapSizePx, paddingPx) {
    const WORLD_DIM = { width: 256, height: 256 };
    const ZOOM_MAX = 21;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const latFraction = (latRad(ne.lat()) - latRad(sw.lat())) / Math.PI;
    const lngDiff = ne.lng() - sw.lng();
    const lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;

    const mapW = Math.max(mapSizePx.width - paddingPx * 2, 1);
    const mapH = Math.max(mapSizePx.height - paddingPx * 2, 1);

    const latZoom = Math.log2(mapH / WORLD_DIM.height / latFraction);
    const lngZoom = Math.log2(mapW / WORLD_DIM.width / lngFraction);

    return Math.min(latZoom, lngZoom, ZOOM_MAX);
}

function smoothZoomTo(map, targetZoom, stepMs = 100) {
    const start = map.getZoom() ?? targetZoom;
    let current = start;
    const step = () => {
        if (current === targetZoom) return;
        current += (targetZoom > current) ? 1 : -1;
        map.setZoom(current);
        if (current !== targetZoom) setTimeout(step, stepMs);
    };
    step();
}

function mapContainsBounds(mapBounds, targetBounds) {
    // Ensure both corners are inside current viewport
    return mapBounds && mapBounds.contains(targetBounds.getNorthEast()) && mapBounds.contains(targetBounds.getSouthWest());
}

function animatePanAndZoom(map, center, targetZoom) {
    return new Promise((resolve) => {
        map.panTo(center);
        google.maps.event.addListenerOnce(map, 'idle', () => {
            const start = map.getZoom() ?? targetZoom;
            if (start === targetZoom) {
                map.setCenter(center);
                return resolve();
            }
            const direction = targetZoom > start ? 1 : -1;
            let z = start;
            const tick = () => {
                if (z === targetZoom) {
                    map.setCenter(center);
                    return resolve();
                }
                z += direction;
                map.setCenter(center);
                map.setZoom(z);
                setTimeout(tick, 90);
            };
            tick();
        });
    });
}

function updateStateStyles() {
    if (!stateLayer) return;
    const targetAbbr = (selectedStateId || previewStateId || '').toUpperCase();
    stateLayer.setStyle((feature) => {
        // use computed abbr index for reliable match
        let abbr = null;
        const props = ['STATE_ABBR','STATE_CODE','STATE_NAME','name'];
        for (const k of props) {
            const v = feature.getProperty(k);
            if (!v) continue;
            const s = String(v).toUpperCase();
            if (['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'].includes(s)) { abbr = s; break; }
            const d = nameToAbbr(s);
            if (d) { abbr = d; break; }
        }
        const isMatch = targetAbbr && abbr === targetAbbr;
        return {
            strokeColor: isMatch ? '#ffffff' : '#ffffff00',
            strokeWeight: isMatch ? 4 : 0,
            fillOpacity: 0,
            visible: true,
        };
    });
}

async function highlightState(stateId) {
    if (!window.griddyMap) return;
    selectedStateId = stateId;
    await loadStatesLayer(window.griddyMap);
    updateStateStyles();
    previewStateId = null;
    // Zoom
    const abbr = stateId.toUpperCase();
    const b = stateBoundsByAbbr.get(abbr);
    if (b) {
        const mapEl = document.getElementById('map');
        const pad = Math.max(40, Math.floor(Math.min(mapEl.clientWidth, mapEl.clientHeight) * 0.08));
        const targetCenter = b.getCenter();
        // small margin so geometry never touches edges
        const targetZoom = Math.max(3, Math.floor(getFitZoom(b, { width: mapEl.clientWidth, height: mapEl.clientHeight }, pad) - 0.3));
        animatePanAndZoom(window.griddyMap, targetCenter, targetZoom).then(() => {
            // Final correction: fit once with tight padding and lock center to ensure perfect containment
            const finalPad = Math.max(32, Math.floor(Math.min(mapEl.clientWidth, mapEl.clientHeight) * 0.06));
            window.griddyMap.fitBounds(b, finalPad);
            google.maps.event.addListenerOnce(window.griddyMap, 'idle', () => {
                window.griddyMap.setCenter(targetCenter);
            });
        });
    }
}

// Reset button -> zoom back to Australia and clear highlight
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.clear-state');
    if (btn) {
        btn.addEventListener('click', () => {
            selectedStateId = null;
            previewStateId = null;
            updateStateStyles();
            if (window.griddyMap) {
                const AUSTRALIA_BOUNDS = { north: -10.0, south: -44.0, west: 112.0, east: 154.0 };
                const b = new google.maps.LatLngBounds(
                    { lat: AUSTRALIA_BOUNDS.south, lng: AUSTRALIA_BOUNDS.west },
                    { lat: AUSTRALIA_BOUNDS.north, lng: AUSTRALIA_BOUNDS.east }
                );
                const mapEl = document.getElementById('map');
                const pad = Math.max(40, Math.floor(Math.min(mapEl.clientWidth, mapEl.clientHeight) * 0.06));
                window.griddyMap.fitBounds(b, pad);
                // Reset dropdown label
                const select = document.getElementById('state-select');
                if (select) {
                    const trigger = select.querySelector('.select-trigger');
                    const valueEl = trigger && trigger.querySelector('.value');
                    if (valueEl) valueEl.textContent = 'Choose state';
                }
            }
        });
    }
});

async function previewState(stateIdOrNull) {
    previewStateId = stateIdOrNull;
    if (!window.griddyMap) return;
    await loadStatesLayer(window.griddyMap);
    updateStateStyles();
}
