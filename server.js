/**
 * Nissab du Jour — serveur unique (API + site statique)
 *
 * Récupère une fois par jour le prix de l'once troy d'or (XAU) et d'argent (XAG)
 * en euros depuis GoldAPI.io, met le résultat en cache (fichier JSON) et calcule
 * le nisâb de l'or (85 g) et de l'argent (595 g). Le frontend interroge /api/nissab.
 */

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOLDAPI_KEY;
const PRICE_FIELD = process.env.PRICE_FIELD || 'prev_close_price'; // 'prev_close_price' (clôture) ou 'price' (spot)
const CRON_EXPR = process.env.CRON || '0 6 * * *'; // tous les jours à 06:00 (heure du serveur)

const TROY_OUNCE_GRAMS = 31.1034768;
const NISAB_GOLD_GRAMS = 85;
const NISAB_SILVER_GRAMS = 595;

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

let cache = null;      // dernier résultat calculé
let inflight = null;   // verrou : une seule requête API à la fois

// --- Cache disque (survit aux redémarrages) ---------------------------------
function loadCache() {
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { cache = null; }
}
function saveCache() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Clé du jour au format AAAA-MM-JJ (fuseau du serveur)
function todayKey() {
  return new Date().toLocaleDateString('en-CA');
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

// Rafraîchit le cache au plus une fois par jour (verrou anti-doublon).
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
      gold: {
        grams: NISAB_GOLD_GRAMS,
        perOunce: gold.perOunce,
        perGram: goldPerGram,
        nisab: goldPerGram * NISAB_GOLD_GRAMS,
      },
      silver: {
        grams: NISAB_SILVER_GRAMS,
        perOunce: silver.perOunce,
        perGram: silverPerGram,
        nisab: silverPerGram * NISAB_SILVER_GRAMS,
      },
      sourceTimestamp: gold.timestamp || silver.timestamp || null,
      fetchedAt: new Date().toISOString(),
    };
    saveCache();
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
        if (!cache) throw e; // aucune donnée du tout
        console.error('[nissab] échec du rafraîchissement, on sert le cache existant :', e.message);
      }
    }
    res.json({ ok: true, ...cache, stale: cache.dateKey !== todayKey() });
  } catch (e) {
    console.error('[nissab] erreur :', e.message);
    res.status(503).json({ ok: false, error: 'Données indisponibles pour le moment.' });
  }
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// --- Démarrage --------------------------------------------------------------
loadCache();
cron.schedule(CRON_EXPR, () => refresh(true).catch((e) => console.error('[cron]', e.message)));
refresh().catch((e) => console.error('[boot]', e.message)); // premier appel si nécessaire (limité à 1/jour)

app.listen(PORT, () => console.log(`Nissab du Jour : http://localhost:${PORT}`));
