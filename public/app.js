/* Nissab du Jour — logique du frontend */

// Calendrier islamique utilisé pour l'affichage et le calcul du hawl.
// Variantes possibles : 'islamic-umalqura' (Umm al-Qurâ, par défaut ici),
// 'islamic', 'islamic-civil', 'islamic-tbla'.
const ISLAMIC_CAL = 'islamic-umalqura';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

// --- Outils de dates --------------------------------------------------------
// On ancre chaque jour à midi UTC pour éviter les décalages de fuseau.
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

// Hawl = même jour et mois hégiriens, année + 1. On part d'une estimation
// (≈ 354 jours) puis on cale la date grégorienne exacte par recherche locale.
function hawlAnchor(today) {
  const h = hijriParts(today);
  const target = { y: h.y + 1, m: h.m, d: h.d };
  const approx = addDays(today, 354);

  for (let off = -8; off <= 8; off++) {
    const cand = addDays(approx, off);
    const hc = hijriParts(cand);
    if (hc.y === target.y && hc.m === target.m && hc.d === target.d) return cand;
  }
  // Repli : le jour ciblé peut ne pas exister (mois de 29 jours).
  // On prend le dernier jour disponible du bon mois hégirien.
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
function formatGreg(date) {
  return gregFull.format(date);
}
function formatHijri(date) {
  return `${hijriDayMonth.format(date)} ${hijriParts(date).y} H`;
}

// --- Génération des liens d'agenda -----------------------------------------
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
  const end = ymdBasic(addDays(hawl, 1)); // fin exclusive pour un évènement « journée »
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: EVENT_TITLE,
    dates: `${start}/${end}`,
    details: eventDetails(hawl, data),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsContent(hawl, data) {
  const start = ymdBasic(hawl);
  const end = ymdBasic(addDays(hawl, 1));
  const stamp = ymdBasic(todayAnchor()) + 'T000000Z';
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nissab du Jour//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:hawl-${start}@nissab-du-jour`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(EVENT_TITLE)}`,
    `DESCRIPTION:${esc(eventDetails(hawl, data))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Hawl dans 3 jours — préparez votre Zakât',
    'TRIGGER:-P3D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// --- Rendu ------------------------------------------------------------------
let HAWL = null;
let icsObjectUrl = null;

// (Re)construit les liens d'agenda. Appelé une première fois sans les montants
// (pour que les boutons fonctionnent tout de suite), puis de nouveau avec les
// montants dès que les cours sont chargés.
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

function renderNisab(data) {
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

  // Reconstruit l'évènement d'agenda avec les montants du jour dans la description.
  buildCalendar(HAWL, data);

  if (data.stale) {
    const a = document.getElementById('alert');
    a.hidden = false;
    a.textContent = 'Les cours affichés datent d\'un jour précédent ; la mise à jour reprendra dès que la source sera de nouveau disponible.';
  }
}

function showError() {
  ['card-gold', 'card-silver'].forEach((id) => document.getElementById(id).classList.remove('is-loading'));
  document.getElementById('goldNisab').textContent = '—';
  document.getElementById('silverNisab').textContent = '—';
  const a = document.getElementById('alert');
  a.hidden = false;
  a.textContent = 'Les cours sont momentanément indisponibles. Réessayez dans quelques instants.';
}

async function init() {
  document.getElementById('card-gold').classList.add('is-loading');
  document.getElementById('card-silver').classList.add('is-loading');
  renderDates();
  try {
    const res = await fetch('/api/nissab', { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'indisponible');
    renderNisab(data);
  } catch (e) {
    console.error(e);
    showError();
  }
}

init();
