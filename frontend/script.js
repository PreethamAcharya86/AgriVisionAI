// ─── Format Disease Name ────────────────────────────────────────
function formatDisease(name) {
  return (name || '').replace(/_/g, ' ');
}

// ─── Crop Card Selection ────────────────────────────────────────
function selectCrop(el) {
  document.querySelectorAll('.crop-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('crop').value = el.dataset.crop;
}

// ─── Image Preview ──────────────────────────────────────────────
function previewImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img     = document.getElementById('preview');
    const idle    = document.getElementById('uploadIdle');
    img.src       = e.target.result;
    img.style.display  = 'block';
    idle.style.display = 'none';
    document.getElementById('analyzeBtn').disabled = false;
  };
  reader.readAsDataURL(file);
}

// ─── Error Display ──────────────────────────────────────────────
function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent  = msg;
  box.style.display = 'block';
}

// ─── Analyze ────────────────────────────────────────────────────
async function analyze() {
  const file     = document.getElementById('fileInput').files[0];
  const crop     = document.getElementById('crop').value;
  const location = document.getElementById('location').value || 'India';

  const loader     = document.getElementById('loader');
  const resultCard = document.getElementById('resultCard');
  const errorBox   = document.getElementById('errorBox');
  const btn        = document.getElementById('analyzeBtn');

  loader.style.display     = 'flex';
  resultCard.style.display = 'none';
  errorBox.style.display   = 'none';
  btn.disabled             = true;

  const formData = new FormData();
  formData.append('image',    file);
  formData.append('crop',     crop);
  formData.append('location', location);

  try {
    const res  = await fetch('http://localhost:5000/predict', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) {
      showError('⚠ ' + data.error);
      if (data.top3) renderTop3(data.top3);
    } else {
      renderResult(data);
    }
  } catch (err) {
    showError('⚠ Cannot reach server. Make sure Flask is running: python app.py');
  }

  loader.style.display = 'none';
  btn.disabled         = false;
}

// ─── Render Result ──────────────────────────────────────────────
function renderResult(data) {
  const sev = (data.severity || 'low').toLowerCase();

  // Badges
  document.getElementById('badges').innerHTML = `
    <span class="badge">🌱 ${data.crop}</span>
    <span class="badge">🦠 ${formatDisease(data.disease)}</span>
    <span class="badge">📊 ${data.confidence} confidence</span>
    <span class="badge severity-${sev}">⚡ Severity: ${data.severity}</span>
    <span class="badge">📍 ${data.location}</span>`;

  renderTop3(data.top3 || []);
  renderChart(data.top3 || [], sev);
  renderSeverity(data.severity);
  renderRecommendation(data.recommendation);

  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Top 3 ──────────────────────────────────────────────────────
function renderTop3(top3) {
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById('top3').innerHTML = top3
    .map((t, i) => `
      <div class="top3-item">
        <span>${medals[i] || ''} ${formatDisease(t.disease)}</span>
        <span>${t.confidence}%</span>
      </div>`)
    .join('');
}

// ─── Chart ──────────────────────────────────────────────────────
let chartInstance = null;

function renderChart(top3, severity) {
  const labels = top3.map(t => formatDisease(t.disease));
  const values = top3.map(t => parseFloat(t.confidence));

  const ctx = document.getElementById('barChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  // Color by severity
  const colorMap = {
    low:      ['rgba(38,166,91,.85)',  'rgba(38,166,91,1)'],
    moderate: ['rgba(245,158,11,.85)', 'rgba(245,158,11,1)'],
    high:     ['rgba(220,38,38,.85)',  'rgba(220,38,38,1)'],
  };
  const [bgColor, borderColor] = colorMap[severity] || colorMap.low;

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Confidence (%)',
        data: values,
        backgroundColor: bgColor,
        borderColor,
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f5c2e',
          titleColor: '#fff',
          bodyColor: '#d4f0de',
          cornerRadius: 8,
          callbacks: { label: ctx => ` ${ctx.raw}% confidence` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: "'DM Sans', sans-serif", size: 11 }, color: '#6b8c79' }
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: {
            font: { family: "'DM Sans', sans-serif", size: 11 },
            color: '#6b8c79',
            callback: v => v + '%'
          }
        }
      },
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      }
    }
  });
}

// ─── Severity ───────────────────────────────────────────────────
function renderSeverity(severity) {
  const fill = document.getElementById('severityFill');
  const s = (severity || '').toLowerCase();

  const map = {
    low:      { width: '25%',  bg: '#22c55e', color: '#22c55e' },
    moderate: { width: '60%',  bg: '#f59e0b', color: '#f59e0b' },
    high:     { width: '95%',  bg: '#ef4444', color: '#ef4444' },
  };
  const cfg = map[s] || map.low;

  fill.style.width      = cfg.width;
  fill.style.background = cfg.bg;
  fill.style.color      = cfg.color; // for ::after border color
}

// ─── Recommendation Formatting ───────────────────────────────────
function renderRecommendation(rec) {
  const box = document.getElementById('recommendation');
  if (!rec) { box.textContent = ''; return; }

  // Bold **headings** → styled span
  const sections = rec.split(/\n\n+/);
  box.innerHTML = sections.map(section => {
    return section
      .replace(/\*\*(.+?)\*\*/g, '<span class="rec-heading">$1</span>')
      .replace(/\n/g, '<br>');
  }).join('<br><br>');
}

// ─── Download PDF Report ─────────────────────────────────────────
async function downloadPDF() {
  const btn = document.getElementById('downloadBtn');
  btn.classList.add('loading');
  btn.innerHTML = '<span class="spin">&#8635;</span> Generating...';

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W       = 210;
    const margin  = 16;
    const cW      = W - margin * 2; // content width
    let   y       = 0;

    // ── Utility: strip ALL emoji / non-latin chars ───────────────
    const clean = (str) => (str || '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')   // emoji blocks
      .replace(/[^\x00-\x7F]/g, '')              // any remaining non-ASCII
      .replace(/\s{2,}/g, ' ')
      .trim();

    // ── Utility: hex color to RGB array ─────────────────────────
    const rgb = (h) => [
      parseInt(h.slice(1,3), 16),
      parseInt(h.slice(3,5), 16),
      parseInt(h.slice(5,7), 16)
    ];

    // ── Utility: set font ────────────────────────────────────────
    const font = (style, size, color = '#111f17') => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...rgb(color));
    };

    // ── Utility: new page guard ──────────────────────────────────
    const guard = (need = 10) => {
      if (y + need > 282) { doc.addPage(); y = 18; }
    };

    // ── Utility: draw section header bar ────────────────────────
    const sectionBar = (label) => {
      guard(14);
      doc.setFillColor(15, 92, 46);
      doc.rect(margin, y, cW, 8, 'F');
      doc.setFillColor(38, 166, 91);
      doc.rect(margin, y, 3, 8, 'F');
      font('bold', 10, '#ffffff');
      doc.text(label, margin + 7, y + 5.5);
      y += 12;
    };

    // ── Utility: labeled info row ────────────────────────────────
    const infoRow = (label, value, valColor = '#1a1a1a') => {
      guard(8);
      // alternating row bg
      doc.setFillColor(248, 252, 249);
      doc.rect(margin, y - 4, cW, 7, 'F');
      font('bold', 9, '#3a5244');
      doc.text(label, margin + 2, y);
      font('normal', 9, valColor);
      doc.text(String(value), margin + 45, y);
      y += 7;
    };

    // ════════════════════════════════════════════════════════════
    // HEADER BAND
    // ════════════════════════════════════════════════════════════
    doc.setFillColor(15, 92, 46);
    doc.rect(0, 0, W, 38, 'F');

    // accent stripe
    doc.setFillColor(38, 166, 91);
    doc.rect(0, 35, W, 3, 'F');

    // logo circle
    doc.setFillColor(38, 166, 91);
    doc.circle(margin + 7, 19, 7, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(margin + 7, 19, 4, 'F');
    doc.setFillColor(15, 92, 46);
    doc.circle(margin + 7, 19, 2, 'F');

    font('bold', 20, '#ffffff');
    doc.text('AgriVision AI', margin + 18, 16);

    font('normal', 9, '#a7f3c2');
    doc.text('Crop Disease Intelligence Report', margin + 18, 23);

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    font('normal', 8, '#a7f3c2');
    doc.text('Generated: ' + dateStr + ' at ' + timeStr, W - margin, 32, { align: 'right' });

    y = 48;

    // ════════════════════════════════════════════════════════════
    // COLLECT DATA — strip emojis from badge text
    // ════════════════════════════════════════════════════════════
    const badgeEls   = [...(document.getElementById('badges')?.querySelectorAll('.badge') || [])];
    const rawBadges  = badgeEls.map(b => clean(b.innerText));

    // badges order: crop | disease | confidence | severity | location
    const cropVal    = rawBadges[0] || '';
    const diseaseVal = rawBadges[1] || '';
    const confVal    = rawBadges[2] || '';
    const sevRaw     = rawBadges[3] || '';   // e.g. "Severity: High"
    const sevVal     = sevRaw.replace(/severity:\s*/i, '').trim();
    const locVal     = rawBadges[4] || '';

    const sevColors  = { high: '#dc2626', moderate: '#d97706', low: '#16a34a' };
    const sevColor   = sevColors[sevVal.toLowerCase()] || '#16a34a';
    const isHealthy  = diseaseVal.toLowerCase() === 'healthy';

    // ════════════════════════════════════════════════════════════
    // SECTION 1 — DIAGNOSIS SUMMARY
    // ════════════════════════════════════════════════════════════
    sectionBar('DIAGNOSIS SUMMARY');
    infoRow('Crop',               cropVal);
    infoRow('Disease Detected',   diseaseVal, isHealthy ? '#16a34a' : '#b91c1c');
    infoRow('Confidence',         confVal);
    infoRow('Severity',           sevVal, sevColor);
    infoRow('Location',           locVal);
    y += 5;

    // ════════════════════════════════════════════════════════════
    // SECTION 2 — TOP 3 PREDICTIONS
    // ════════════════════════════════════════════════════════════
    sectionBar('TOP 3 PREDICTIONS');

    const top3Els = [...(document.getElementById('top3')?.querySelectorAll('.top3-item') || [])];
    const rankLabels = ['#1', '#2', '#3'];

    top3Els.forEach((el, i) => {
      guard(11);
      // Get the two child spans: name and confidence%
      const spans = el.querySelectorAll('span');
      const rawName = clean(spans[0]?.innerText || el.innerText);
      const rawConf = clean(spans[1]?.innerText || '0%');
      const confNum = parseFloat(rawConf) || 0;
      const barFill = Math.max(0, Math.min(cW - 30, (confNum / 100) * (cW - 30)));

      // Row background
      doc.setFillColor(i === 0 ? 212 : 237, i === 0 ? 240 : 248, i === 0 ? 222 : 241);
      doc.roundedRect(margin, y, cW, 9, 1.5, 1.5, 'F');

      // Confidence fill bar (inside row)
      if (confNum > 0) {
        doc.setFillColor(...rgb(i === 0 ? '#26a65b' : '#cde8d8'));
        doc.roundedRect(margin + 28, y + 2, barFill, 5, 1, 1, 'F');
      }

      // Rank label
      font('bold', 8, '#0f5c2e');
      doc.text(rankLabels[i], margin + 3, y + 6);

      // Disease name
      font(i === 0 ? 'bold' : 'normal', 8, '#111f17');
      doc.text(rawName, margin + 12, y + 6);

      // Confidence %
      font('bold', 8, '#0f5c2e');
      doc.text(rawConf, W - margin - 2, y + 6, { align: 'right' });

      y += 11;
    });
    y += 4;

    // ════════════════════════════════════════════════════════════
    // SECTION 3 — SEVERITY METER
    // ════════════════════════════════════════════════════════════
    sectionBar('SEVERITY LEVEL');

    const sevPct  = { low: 0.25, moderate: 0.60, high: 0.95 }[sevVal.toLowerCase()] || 0.25;
    const sevFill = Math.round(sevPct * cW);

    // Track
    doc.setFillColor(220, 220, 220);
    doc.roundedRect(margin, y, cW, 7, 3.5, 3.5, 'F');

    // Fill
    doc.setFillColor(...rgb(sevColor));
    if (sevFill > 0) doc.roundedRect(margin, y, sevFill, 7, 3.5, 3.5, 'F');

    // Indicator dot
    doc.setFillColor(255, 255, 255);
    doc.circle(margin + sevFill, y + 3.5, 3.5, 'F');
    doc.setDrawColor(...rgb(sevColor));
    doc.setLineWidth(1);
    doc.circle(margin + sevFill, y + 3.5, 3.5, 'S');

    y += 11;
    font('normal', 8, '#3a5244');
    doc.text('Low', margin, y);
    doc.text('Moderate', margin + cW / 2, y, { align: 'center' });
    doc.text('High', W - margin, y, { align: 'right' });
    y += 8;

    // ════════════════════════════════════════════════════════════
    // SECTION 4 — LEAF IMAGE
    // ════════════════════════════════════════════════════════════
    const previewEl = document.getElementById('preview');
    if (previewEl && previewEl.src && previewEl.style.display !== 'none') {
      guard(75);
      sectionBar('UPLOADED LEAF IMAGE');
      try {
        // Load image directly from src into a fresh canvas — avoids CSS/style bleed
        const imgData = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas  = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          };
          img.onerror = reject;
          img.src = previewEl.src;  // src is already a base64 data URL from FileReader
        });

        const tmpImg = new Image();
        await new Promise(r => { tmpImg.onload = r; tmpImg.src = imgData; });
        const aspect = tmpImg.naturalHeight / tmpImg.naturalWidth;
        const imgW   = Math.min(cW, 110);
        const imgH   = imgW * aspect;

        // Draw a white background rect first, then image
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin + (cW - imgW) / 2 - 2, y - 2, imgW + 4, imgH + 4, 2, 2, 'F');
        doc.addImage(imgData, 'JPEG', margin + (cW - imgW) / 2, y, imgW, imgH);
        y += imgH + 8;
      } catch (e) {
        font('normal', 9, '#888888');
        doc.text('(Image could not be embedded: ' + e.message + ')', margin + 2, y);
        y += 8;
      }
    }

    // ════════════════════════════════════════════════════════════
    // SECTION 5 — AI RECOMMENDATION
    // ════════════════════════════════════════════════════════════
    guard(20);
    sectionBar('AI RECOMMENDATION');

    // Extract structured content from DOM
    // Each .rec-heading is a section title; following text nodes are body
    const recContainer = document.getElementById('recommendation');
    const recSections  = [];

    if (recContainer) {
      // Clone and walk nodes to extract heading + body pairs
      const clone = recContainer.cloneNode(true);
      let currentHeading = null;
      let currentBody    = [];

      const flush = () => {
        if (currentHeading !== null) {
          recSections.push({ heading: currentHeading, body: currentBody.join(' ').trim() });
        }
        currentBody = [];
      };

      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent.replace(/\s+/g, ' ').trim();
          if (t) currentBody.push(t);
        } else if (node.classList?.contains('rec-heading')) {
          flush();
          currentHeading = clean(node.textContent);
        } else {
          node.childNodes.forEach(walk);
        }
      };
      clone.childNodes.forEach(walk);
      flush();
    }

    if (recSections.length === 0) {
      // Fallback: plain text, no headings detected
      const plainText = clean(recContainer?.innerText || '');
      const lines = doc.splitTextToSize(plainText, cW - 4);
      for (const line of lines) {
        guard(7);
        font('normal', 9, '#3a5244');
        doc.text(line, margin + 2, y);
        y += 5.5;
      }
    } else {
      for (const { heading, body } of recSections) {
        // Heading pill
        guard(14);
        doc.setFillColor(212, 240, 222);
        doc.roundedRect(margin, y, cW, 7.5, 2, 2, 'F');
        doc.setFillColor(15, 92, 46);
        doc.rect(margin, y, 3, 7.5, 'F');
        font('bold', 9.5, '#0f5c2e');
        doc.text(heading, margin + 7, y + 5.2);
        y += 10;

        // Body text
        const bodyLines = doc.splitTextToSize(body, cW - 6);
        for (const line of bodyLines) {
          guard(7);
          font('normal', 9, '#3a5244');
          doc.text(line, margin + 4, y);
          y += 5.5;
        }
        y += 3;
      }
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFillColor(237, 248, 241);
      doc.rect(0, 285, W, 12, 'F');
      doc.setDrawColor(205, 232, 216);
      doc.setLineWidth(0.4);
      doc.line(0, 285, W, 285);
      font('normal', 7.5, '#6b8c79');
      doc.text('AgriVision AI  |  Crop Disease Intelligence  |  For awareness only - consult a local agronomist', margin, 291);
      font('bold', 7.5, '#0f5c2e');
      doc.text('Page ' + p + ' of ' + totalPages, W - margin, 291, { align: 'right' });
    }

    // ── Save ─────────────────────────────────────────────────────
    const safeCrop = cropVal.replace(/\s+/g, '_') || 'Report';
    const safeDate = dateStr.replace(/\s+/g, '_');
    doc.save('AgriVision_' + safeCrop + '_' + safeDate + '.pdf');

  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Could not generate PDF: ' + err.message);
  }

  btn.classList.remove('loading');
  btn.innerHTML = '&#11015; Download Report';
}