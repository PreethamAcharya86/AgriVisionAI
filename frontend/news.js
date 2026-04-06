// ─── CONFIG ─────────────────────────────────────────────────────
const BACKEND_URL = "https://agrivision-backend-s050.onrender.com";

// ─── State ──────────────────────────────────────────────────────
let selectedCrop = 'All';

// ─── Chip Selection ─────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedCrop = chip.dataset.crop;
  });
});

// ─── Helpers ────────────────────────────────────────────────────
function showLoader(on) {
  document.getElementById('loader').style.display = on ? 'flex' : 'none';
}

function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.style.display = msg ? 'block' : 'none';
}

function showEmpty(on) {
  document.getElementById('emptyState').style.display = on ? 'block' : 'none';
}

// ─── Fetch Trends ───────────────────────────────────────────────
async function fetchTrends() {
  const region = document.getElementById('regionInput').value.trim() || 'India';
  const crop = selectedCrop;
  const btn = document.getElementById('fetchBtn');

  showError('');
  showEmpty(false);
  document.getElementById('newsGrid').innerHTML = '';
  showLoader(true);
  btn.disabled = true;

  try {
    const res = await fetch(`${BACKEND_URL}/trends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop, region })
    });

    const data = await res.json();

    if (data.error) {
      showError('⚠ ' + data.error);
    } else if (!data.trends || data.trends.length === 0) {
      showEmpty(true);
    } else {
      renderCards(data.trends);
    }
  } catch (err) {
    showError('⚠ Cannot reach server. Backend may be down.');
  }

  showLoader(false);
  btn.disabled = false;
}

// ─── Render Cards ───────────────────────────────────────────────
function renderCards(trends) {
  const grid = document.getElementById('newsGrid');
  grid.innerHTML = '';

  trends.forEach((t, i) => {
    const threatClass = {
      High: 'threat-high',
      Moderate: 'threat-moderate',
      Low: 'threat-low'
    }[t.threat_level] || 'threat-low';

    const spreadLevel = { Low: 1, Moderate: 2, High: 3 }[t.threat_level] || 1;
    const dotClass = { 1: '', 2: 'warn', 3: 'danger' }[spreadLevel];

    const dots = Array.from({ length: 3 }, (_, d) =>
      `<div class="spread-dot ${d < spreadLevel ? `active ${dotClass}` : ''}"></div>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'news-card';
    card.style.animationDelay = `${i * 0.07}s`;

    card.innerHTML = `
      <div class="card-header">
        <span class="card-crop-badge">${cropEmoji(t.crop)} ${t.crop}</span>
        <span class="threat-level ${threatClass}">⚠ ${t.threat_level} Threat</span>
      </div>

      <div class="card-body">
        <div class="card-disease">${t.disease}</div>
        <div class="card-region">📍 ${t.affected_regions}</div>

        <div class="spread-row">
          <span>Spread risk</span>
          <div class="spread-dots">${dots}</div>
        </div>
      </div>

      <div class="card-section" id="overview-${i}">
        <button class="card-section-toggle" onclick="toggleSection('overview-${i}')">
          🦠 Overview <span class="toggle-arrow">▼</span>
        </button>
        <div class="card-section-body"><p>${t.overview}</p></div>
      </div>

      <div class="card-section" id="symptoms-${i}">
        <button class="card-section-toggle" onclick="toggleSection('symptoms-${i}')">
          🔍 Symptoms <span class="toggle-arrow">▼</span>
        </button>
        <div class="card-section-body"><p>${t.symptoms}</p></div>
      </div>

      <div class="card-section" id="precaution-${i}">
        <button class="card-section-toggle" onclick="toggleSection('precaution-${i}')">
          🛡 Precautions <span class="toggle-arrow">▼</span>
        </button>
        <div class="card-section-body"><p>${t.precautions}</p></div>
      </div>

      <div class="card-section" id="spread-${i}">
        <button class="card-section-toggle" onclick="toggleSection('spread-${i}')">
          🌍 How It Spreads <span class="toggle-arrow">▼</span>
        </button>
        <div class="card-section-body"><p>${t.spread}</p></div>
      </div>
    `;

    grid.appendChild(card);

    if (i === 0) toggleSection(`overview-${i}`);
  });
}

// ─── Accordion Toggle ───────────────────────────────────────────
function toggleSection(id) {
  const section = document.getElementById(id);
  section.classList.toggle('open');
}

// ─── Crop Emoji ─────────────────────────────────────────────────
function cropEmoji(crop) {
  const map = {
    Tomato: '🍅',
    Apple: '🍎',
    Grape: '🍇'
  };
  return map[crop] || '🌱';
}