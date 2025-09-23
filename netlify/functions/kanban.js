// netlify/functions/kanban.js
// CommonJS (passar din övriga kod & Netlify Functions)
const { getStore } = require('@netlify/blobs');

// ---- CORS + cache ----
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

// ---- Hjälp: välj nyckel för den här tavlan ----
// Vi stödjer flera parametrar för kompatibilitet: ?key=..., ?id=..., ?dataset=...
function resolveKey(event) {
  const qs = event.queryStringParameters || {};
  const raw =
    qs.key ||
    qs.id ||
    qs.dataset ||
    'kanban_user_v1'; // default-nyckel om inget skickas
  // lite sanering för säkerhets skull
  return String(raw).replace(/[^a-zA-Z0-9_\-:.]/g, '');
}

// ---- Skapa store med explicita credentials (miljövariabler i Netlify UI) ----
function createStore() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  // Liten guard så vi får tydligare fel i loggen om ngt saknas
  if (!siteID || !token) {
    throw new Error(
      'Missing NETLIFY_BLOBS_SITE_ID or NETLIFY_BLOBS_TOKEN environment variables'
    );
  }

  // Namnet "kanban" blir själva butiken; nycklarna (resolveKey) blir objekten i butiken
  return getStore('kanban', { siteID, token });
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const store = createStore();
    const key = resolveKey(event);

    if (event.httpMethod === 'GET') {
      // Hämta som sträng (kan vara null om ej finns)
      const raw = await store.get(key);
      if (!raw) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Not found' }),
        };
      }
      return { statusCode: 200, headers, body: raw };
    }

    if (event.httpMethod === 'PUT') {
      // Spara exakt det frontend skickar (antaget JSON)
      await store.set(key, event.body || '{}');
      return { statusCode: 204, headers };
    }

    // Allt annat -> 405
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    // Hjälpsam felbild för Netlify logs + 500 till klienten
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
