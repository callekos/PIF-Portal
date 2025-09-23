// netlify/functions/kanban.js
const { getStore } = require('@netlify/blobs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const store = getStore({ name: 'kanban-store' });
  const key = 'board-default';

  if (event.httpMethod === 'GET') {
    const raw = await store.get(key); // string|null
    if (!raw) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    return { statusCode: 200, headers, body: raw };
  }

  if (event.httpMethod === 'PUT') {
    // Spara exakt det frontend skickar
    await store.set(key, event.body || '{}');
    return { statusCode: 204, headers };
  }

  // Allt annat -> 405
  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
