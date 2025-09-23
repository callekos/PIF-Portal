// netlify/functions/kanban.js
// En enkel JSON-store för kanbantavlan via Netlify Blobs.
// Stödjer: GET (hämta), PUT (spara), OPTIONS (CORS preflight).

/* eslint-disable no-console */
const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Skapar en Blobs-store. Om NETLIFY_BLOBS_* är satta i Environment Variables
 * skickar vi med dem för att undvika MissingBlobsEnvironmentError i förhandsdeploys.
 */
function makeStore() {
  const opts = {};
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    opts.siteID = siteID;
    opts.token  = token;
  }
  // "kanban" = namnet på blob-butiken (syns i Netlify > Blobs)
  return getStore('kanban', opts);
}

exports.handler = async (event) => {
  // Netlify Functions ger httpMethod
  const method = event.httpMethod || 'GET';

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
  }

  try {
    const store = makeStore();

    if (method === 'GET') {
      // Hämta JSON för tavlan; nyckeln heter "board"
      const data = await store.get('board', { type: 'json' });
      if (!data) {
        // Inget sparat ännu → 404 (frontend initierar default då)
        return {
          statusCode: 404,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Not found' }),
        };
      }
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    if (method === 'PUT') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing body' }),
        };
      }

      let json;
      try {
        json = JSON.parse(event.body);
      } catch (e) {
        console.error('JSON-parse-fel:', e.message);
        return {
          statusCode: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON' }),
        };
      }

      // Spara JSON:en i blob-butiken
      await store.setJSON('board', json);

      return {
        statusCode: 204, // inget innehåll behövs tillbaka
        headers: CORS,
      };
    }

    // Annan metod → 405
    return {
      statusCode: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    // Logga för Netlify Logs och returnera 500
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err.message || 'Internal Server Error',
      }),
    };
  }
};
