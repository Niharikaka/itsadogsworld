const ALLOWED_MODELS = new Set([
  'fal-ai/birefnet/v2',
  'fal-ai/one-to-all-animation/1.3b',
  'fal-ai/birefnet/v2/video'
]);

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function modelFromQueueUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.hostname !== 'queue.fal.run') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const reqIndex = parts.indexOf('requests');
    if (reqIndex < 2) return null;
    return parts.slice(0, reqIndex).join('/');
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  const body = req.body || {};
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return send(res, 400, { error: 'Enter your fal API key first.' });
  if (key.length > 500) return send(res, 400, { error: 'Invalid API key.' });

  const headers = {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
    'X-Fal-Store-IO': '0'
  };

  let target;
  let method = 'POST';
  let payload;

  if (body.op === 'run' || body.op === 'submit') {
    const model = String(body.model || '');
    if (!ALLOWED_MODELS.has(model)) return send(res, 403, { error: 'Model not allowed.' });
    target = `${body.op === 'run' ? 'https://fal.run' : 'https://queue.fal.run'}/${model}`;
    payload = JSON.stringify(body.input || {});
  } else if (body.op === 'get') {
    const raw = String(body.url || '');
    const model = modelFromQueueUrl(raw);
    if (!model || !ALLOWED_MODELS.has(model)) return send(res, 403, { error: 'Queue URL not allowed.' });
    target = raw;
    method = 'GET';
  } else {
    return send(res, 400, { error: 'Invalid operation.' });
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' ? undefined : payload
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(text);
  } catch (err) {
    send(res, 502, { error: 'Could not reach fal.', detail: String(err?.message || err) });
  }
};
