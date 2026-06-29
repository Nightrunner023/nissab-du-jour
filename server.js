/**
 * Nissab du Jour — serveur unique (API + site statique)
 *
 * Récupère une fois par jour le prix de l'once troy d'or (XAU) et d'argent (XAG)
 * en euros depuis GoldAPI.io, met le résultat en cache (fichier JSON), calcule le
 * nisâb de l'or (85 g) et de l'argent (595 g), et conserve un historique quotidien.
 * Le frontend interroge /api/nissab et /api/history.
 */

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOLDAPI_KEY;
const PRICE_FIELD = process.env.PRICE_FIELD || 'prev_close_price'; // 'prev_close_price' ou 'price'
const CRON_EXPR = process.env.CRON || '0 6 * * *';

const TROY_OUNCE_GRAMS = 31.1034768;
const NISAB_GOLD_GRAMS = 85;
const NISAB_SILVER_GRAMS = 595;

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY = 420; // un peu plus d'une année lunaire

let cache = null;
let history = [];
let inflight = null;

// --- Persistance ------------------------------------------------------------
function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function saveJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, file === HISTORY_FILE ? 0 : 2));
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA'); // AAAA-MM-JJ, fuseau du serveur
}

function recordHistory(c) {
  const entry = {
    date: c.dateKey,
    goldNisab: c.gold.nisab,
    silverNisab: c.silver.nisab,
    goldPerGram: c.gold.perGram,
    silverPerGram: c.silver.perGram,
  };
  const i = history.findIndex((h) => h.date === entry.date);
  if (i >= 0) history[i] = entry; else history.push(entry);
  history.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveJson(HISTORY_FILE, history);
}

// --- Appel GoldAPI.io -------------------------------------------------------
async function fetchMetal(metal) {
  const res = await fetch(`https://www.goldapi.io/api/${metal}/EUR`, {
    headers: { 'x-access-token': API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${metal}: HTTP ${res.status}`);
  const data = await res.json();
  const perOunce = data[PRICE_FIELD] ?? data.price;
  if (typeof perOunce !== 'number' || !isFinite(perOunce)) {
    throw new Error(`${metal}: prix invalide`);
  }
  return { perOunce, timestamp: data.timestamp };
}

function refresh(force = false) {
  const key = todayKey();
  if (!force && cache && cache.dateKey === key) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = (async () => {
    if (!API_KEY) throw new Error('GOLDAPI_KEY manquante (voir .env)');
    const [gold, silver] = await Promise.all([fetchMetal('XAU'), fetchMetal('XAG')]);

    const goldPerGram = gold.perOunce / TROY_OUNCE_GRAMS;
    const silverPerGram = silver.perOunce / TROY_OUNCE_GRAMS;

    cache = {
      dateKey: key,
      currency: 'EUR',
      priceField: PRICE_FIELD,
      gold: { grams: NISAB_GOLD_GRAMS, perOunce: gold.perOunce, perGram: goldPerGram, nisab: goldPerGram * NISAB_GOLD_GRAMS },
      silver: { grams: NISAB_SILVER_GRAMS, perOunce: silver.perOunce, perGram: silverPerGram, nisab: silverPerGram * NISAB_SILVER_GRAMS },
      sourceTimestamp: gold.timestamp || silver.timestamp || null,
      fetchedAt: new Date().toISOString(),
    };
    saveJson(CACHE_FILE, cache);
    recordHistory(cache);
    console.log(`[nissab] rafraîchissement OK pour ${key}`);
    return cache;
  })().finally(() => { inflight = null; });

  return inflight;
}

// --- Routes -----------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/nissab', async (_req, res) => {
  try {
    if (!cache || cache.dateKey !== todayKey()) {
      try { await refresh(); }
      catch (e) {
        if (!cache) throw e;
        console.error('[nissab] échec du rafraîchissement, on sert le cache existant :', e.message);
      }
    }
    res.json({ ok: true, ...cache, stale: cache.dateKey !== todayKey() });
  } catch (e) {
    console.error('[nissab] erreur :', e.message);
    res.status(503).json({ ok: false, error: 'Données indisponibles pour le moment.' });
  }
});

app.get('/api/history', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, MAX_HISTORY);
  res.json({ ok: true, currency: 'EUR', points: history.slice(-days) });
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// --- Démarrage --------------------------------------------------------------
cache = loadJson(CACHE_FILE, null);
history = loadJson(HISTORY_FILE, []);
cron.schedule(CRON_EXPR, () => refresh(true).catch((e) => console.error('[cron]', e.message)));
refresh().catch((e) => console.error('[boot]', e.message));

app.listen(PORT, () => console.log(`Nissab du Jour : http://localhost:${PORT}`));
