/* Nissab du Jour — logique du frontend */

const ISLAMIC_CAL = 'islamic-umalqura';
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

let NISAB_DATA = null; // cours du jour, une fois chargés

// ============================================================ Dates / Hawl
function dayAnchor(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}
function todayAnchor() {
  const n = new Date();
  return dayAnchor(n.getFullYear(), n.getMonth(), n.getDate());
}
function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}
function hijriParts(date) {
  const fmt = new Intl.DateTimeFormat('en-u-ca-' + ISLAMIC_CAL, {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  return { y: p.year, m: p.month, d: p.day };
}
function hawlAnchor(today) {
  const h = hijriParts(today);
  const target = { y: h.y + 1, m: h.m, d: h.d };
  const approx = addDays(today, 354);
  for (let off = -8; off <= 8; off++) {
    const cand = addDays(approx, off);
    const hc = hijriParts(cand);
    if (hc.y === target.y && hc.m === target.m && hc.d === target.d) return cand;
  }
  const sameMonth = [];
  for (let off = -10; off <= 10; off++) {
    const cand = addDays(approx, off);
    const hc = hijriParts(cand);
    if (hc.y === target.y && hc.m === target.m) sameMonth.push({ cand, d: hc.d });
  }
  if (sameMonth.length) {
    sameMonth.sort((a, b) => a.d - b.d);
    const below = sameMonth.filter((c) => c.d <= target.d);
    return (below.length ? below[below.length - 1] : sameMonth[sameMonth.length - 1]).cand;
  }
  return approx;
}

const gregFull = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const hijriDayMonth = new Intl.DateTimeFormat('fr-u-ca-' + ISLAMIC_CAL, {
  day: 'numeric', month: 'long', timeZone: 'UTC',
});
const formatGreg = (d) => gregFull.format(d);
const formatHijri = (d) => `${hijriDayMonth.format(d)} ${hijriParts(d).y} H`;

// ============================================================ Agenda (.ics / Google)
function ymdBasic(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
const EVENT_TITLE = 'Échéance du hawl : vérifier la Zakât';
function eventDetails(hawl, data) {
  const today = todayAnchor();
  let s =
    'Une année lunaire complète s\'est écoulée. ' +
    'Vérifiez si vous atteignez toujours le nisâb et calculez votre Zakât.\n\n';
  if (data) {
    s +=
      `Nisâb de référence (relevé le ${formatGreg(today)} / ${formatHijri(today)}) :\n` +
      `• Or (85 g) : ${eur.format(data.gold.nisab)}\n` +
      `• Argent (595 g) : ${eur.format(data.silver.nisab)}\n\n`;
  }
  s += `Hawl : ${formatGreg(hawl)} (${formatHijri(hawl)}).\n`;
  s += 'Rappel généré par Nissab du Jour.';
  return s;
}
function googleUrl(hawl, data) {
  const start = ymdBasic(hawl);
  const end = ymdBasic(addDays(hawl, 1));
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: EVENT_TITLE, dates: `${start}/${end}`, details: eventDetails(hawl, data),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
function icsContent(hawl, data) {
  const start = ymdBasic(hawl);
  const end = ymdBasic(addDays(hawl, 1));
  const stamp = ymdBasic(todayAnchor()) + 'T000000Z';
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nissab du Jour//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:hawl-${start}@nissab-du-jour`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(EVENT_TITLE)}`, `DESCRIPTION:${esc(eventDetails(hawl, data))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hawl dans 3 jours — préparez votre Zakât', 'TRIGGER:-P3D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

let HAWL = null;
let icsObjectUrl = null;
function buildCalendar(hawl, data) {
  document.getElementById('btnGoogle').href = googleUrl(hawl, data);
  if (icsObjectUrl) URL.revokeObjectURL(icsObjectUrl);
  const blob = new Blob([icsContent(hawl, data)], { type: 'text/calendar;charset=utf-8' });
  icsObjectUrl = URL.createObjectURL(blob);
  const btnIcs = document.getElementById('btnIcs');
  btnIcs.href = icsObjectUrl;
  btnIcs.setAttribute('download', `hawl-${ymdBasic(hawl)}.ics`);
}
function renderDates() {
  const today = todayAnchor();
  HAWL = hawlAnchor(today);
  document.getElementById('todayGreg').textContent = formatGreg(today);
  document.getElementById('todayHijri').textContent = formatHijri(today);
  document.getElementById('hawlGreg').textContent = formatGreg(HAWL);
  document.getElementById('hawlHijri').textContent = formatHijri(HAWL);
  buildCalendar(HAWL, null);
}

// ============================================================ Nisâb du jour
function renderNisab(data) {
  NISAB_DATA = data;
  document.getElementById('goldNisab').textContent = eur.format(data.gold.nisab);
  document.getElementById('silverNisab').textContent = eur.format(data.silver.nisab);
  document.getElementById('goldDetail').textContent =
    `${eur.format(data.gold.perGram)} / g · once ${eur.format(data.gold.perOunce)}`;
  document.getElementById('silverDetail').textContent =
    `${eur.format(data.silver.perGram)} / g · once ${eur.format(data.silver.perOunce)}`;
  document.getElementById('card-gold').classList.remove('is-loading');
  document.getElementById('card-silver').classList.remove('is-loading');

  const base = data.priceField === 'price' ? 'cours spot' : 'dernière clôture';
  const when = data.fetchedAt
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data.fetchedAt))
    : '—';
  document.getElementById('updated').textContent = `Base : ${base} · mise à jour le ${when}`;

  buildCalendar(HAWL, data);
  computeZakat(); // revalorise les grammes d'or/argent du calculateur
}
function showNisabError() {
  ['card-gold', 'card-silver'].forEach((id) => document.getElementById(id).classList.remove('is-loading'));
  document.getElementById('goldNisab').textContent = '—';
  document.getElementById('silverNisab').textContent = '—';
  const a = document.getElementById('alert');
  a.hidden = false;
  a.textContent = 'Les cours sont momentanément indisponibles. Réessayez dans quelques instants.';
}

// ============================================================ Calculateur (mālikī)
function num(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isFinite(v) && v > 0 ? v : 0;
}
function computeZakat() {
  const result = document.getElementById('calcResult');
  const especes = num('cEspeces');
  const orG = num('cOrG');
  const argentG = num('cArgentG');
  const commerce = num('cCommerce');
  const dettes = num('cDettes');

  const goldPerGram = NISAB_DATA ? NISAB_DATA.gold.perGram : 0;
  const silverPerGram = NISAB_DATA ? NISAB_DATA.silver.perGram : 0;
  const valeurOr = orG * goldPerGram;
  const valeurArgent = argentG * silverPerGram;

  const brut = especes + valeurOr + valeurArgent + commerce;
  const base = brut - dettes;

  const totalSaisi = especes + orG + argentG + commerce + dettes;
  if (totalSaisi <= 0) {
    result.className = 'calc__result';
    result.innerHTML = '<p class="calc__hint">Renseignez vos montants pour voir l\'estimation.</p>';
    return;
  }

  const seuil = NISAB_DATA ? NISAB_DATA.silver.nisab : null;
  const seuilOr = NISAB_DATA ? NISAB_DATA.gold.nisab : null;
  const atteint = seuil != null && base >= seuil;

  let html = '';
  html += `<div class="calc__line"><span>Base imposable</span><strong>${eur.format(Math.max(0, base))}</strong></div>`;
  if (seuil != null) {
    html += `<div class="calc__line"><span>Seuil retenu (argent, 595 g)</span><strong>${eur.format(seuil)}</strong></div>`;
    html += `<div class="calc__line"><span>Pour mémoire, seuil de l'or (85 g)</span><span>${eur.format(seuilOr)}</span></div>`;
  } else {
    html += '<div class="calc__line"><span>Seuil (nisâb)</span><span>en attente des cours…</span></div>';
  }

  if (seuil == null) {
    result.className = 'calc__result';
    result.innerHTML = html + '<p class="calc__verdict">Le seuil s\'affichera dès que les cours du jour seront chargés.</p>';
    return;
  }

  if (atteint) {
    const zakat = base * 0.025;
    html += '<p class="calc__verdict">Vous atteignez le nisâb. Zakât due, soit 2,5 % :</p>';
    html += `<p class="calc__zakat">${eur.format(zakat)}</p>`;
    result.className = 'calc__result is-above';
  } else {
    html += '<p class="calc__verdict">En dessous du nisâb : pas de Zakât due aujourd\'hui, sous réserve des conditions du hawl.</p>';
    result.className = 'calc__result is-below';
  }
  result.innerHTML = html;
}

// ============================================================ Historique (graphique SVG)
const shortDate = (iso) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(iso + 'T12:00:00Z'));

// Un panneau par métal, chacun avec sa propre échelle (l'or et l'argent
// diffèrent d'un facteur dix : une échelle commune écraserait l'argent).
function metalPanel(title, values, points, lineClass, dotClass, showDates) {
  const W = 700, H = showDates ? 172 : 150;
  const padL = 66, padR = 14, padT = 26, padB = showDates ? 32 : 12;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || max || 1;
  min -= span * 0.18; max += span * 0.18;
  if (min < 0) min = 0;

  const x = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / (max - min)) * innerH;

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du nisâb ${title}">`;
  s += `<text class="chart-title" x="0" y="15">${title}</text>`;

  for (let t = 0; t <= 3; t++) {
    const val = min + ((max - min) * t) / 3;
    const yy = y(val);
    s += `<line class="chart-grid" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" />`;
    s += `<text class="chart-label" x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${eur0.format(val)}</text>`;
  }

  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  s += `<path class="${lineClass}" d="${path}" />`;
  values.forEach((v, i) => { s += `<circle class="${dotClass}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" />`; });

  if (showDates) {
    const idxs = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0, points.length - 1];
    idxs.forEach((i) => {
      const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      s += `<text class="chart-label" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${shortDate(points[i].date)}</text>`;
    });
  }
  return s + '</svg>';
}

function buildChart(points) {
  const host = document.getElementById('chart');
  const lede = document.getElementById('histLede');

  if (!points || points.length < 2) {
    const n = points ? points.length : 0;
    host.innerHTML = '<p class="chart__empty">L\'historique se constituera au fil des jours' +
      (n ? ` (${n} relevé pour l'instant).` : '.') + '</p>';
    lede.textContent = 'À partir d\'aujourd\'hui.';
    return;
  }

  const gold = points.map((p) => p.goldNisab);
  const silver = points.map((p) => p.silverNisab);
  host.innerHTML =
    metalPanel('Or · 85 g', gold, points, 'chart-line-gold', 'chart-dot-gold', false) +
    metalPanel('Argent · 595 g', silver, points, 'chart-line-silver', 'chart-dot-silver', true);
  lede.textContent = `Du ${shortDate(points[0].date)} au ${shortDate(points[points.length - 1].date)}.`;
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history?days=30', { cache: 'no-store' });
    const data = await res.json();
    buildChart(data.ok ? data.points : []);
  } catch (e) {
    console.error(e);
    buildChart([]);
  }
}

// ============================================================ Démarrage
async function init() {
  renderDates();

  // calculateur en direct
  ['cEspeces', 'cOrG', 'cArgentG', 'cCommerce', 'cDettes'].forEach((id) => {
    document.getElementById(id).addEventListener('input', computeZakat);
  });

  loadHistory();

  try {
    const res = await fetch('/api/nissab', { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'indisponible');
    renderNisab(data);

    if (data.stale) {
      const a = document.getElementById('alert');
      a.hidden = false;
      a.textContent = 'Les cours affichés datent d\'un jour précédent ; la mise à jour reprendra dès que la source sera de nouveau disponible.';
    }
  } catch (e) {
    console.error(e);
    showNisabError();
  }
}

init();

// Mode application (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW non enregistré :', e.message));
  });
}
