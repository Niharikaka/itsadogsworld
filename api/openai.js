function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) throw new Error('Invalid image data.');
  return { type: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function openaiJson(url, options, key) {
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: { message: text || `OpenAI request failed (${r.status})` } }; }
  if (!r.ok) {
    const msg = data?.error?.message || data?.message || `OpenAI request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { key, op, imageData, prompt, videoId } = req.body || {};
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'OpenAI API key is required.' });

    if (op === 'cutout') {
      const source = parseDataUrl(imageData);
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('prompt', prompt || 'Remove only the paper/background around this hand-drawn dog. Preserve the dog exactly: same silhouette, proportions, line art, colors, markings, odd anatomy, and every intentional imperfection. Do not redraw, beautify, correct, or reinterpret the dog. Return only the dog on a fully transparent background.');
      form.append('background', 'transparent');
      form.append('input_fidelity', 'high');
      form.append('output_format', 'png');
      form.append('quality', 'high');
      form.append('size', '1024x1024');
      form.append('image', new Blob([source.buffer], { type: source.type }), 'dog-source.png');

      const data = await openaiJson('https://api.openai.com/v1/images/edits', { method: 'POST', body: form }, key);
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI returned no edited image.');
      return res.status(200).json({ imageData: `data:image/png;base64,${b64}` });
    }

    if (op === 'video_create') {
      const reference = parseDataUrl(imageData);
      const form = new FormData();
      form.append('model', 'sora-2');
      form.append('prompt', prompt || 'Animate this exact hand-drawn dog in place. Preserve its exact quirky silhouette, proportions, markings, colors, and line-art identity. Gentle playful character motion only. Static camera. Keep the background a perfectly flat uniform chroma green (#00FF00) with no shadows, texture, gradient, scenery, text, or objects. The dog stays fully visible and centered for the entire clip.');
      form.append('seconds', '4');
      form.append('size', '720x1280');
      form.append('input_reference', new Blob([reference.buffer], { type: reference.type }), 'dog-reference.png');
      const data = await openaiJson('https://api.openai.com/v1/videos', { method: 'POST', body: form }, key);
      return res.status(200).json(data);
    }

    if (op === 'video_status') {
      if (!videoId) return res.status(400).json({ error: 'videoId is required.' });
      const data = await openaiJson(`https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}`, { method: 'GET' }, key);
      return res.status(200).json(data);
    }

    if (op === 'video_content') {
      if (!videoId) return res.status(400).json({ error: 'videoId is required.' });
      const r = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}/content`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (!r.ok) {
        let msg = `Could not download video (${r.status})`;
        try { const j = await r.json(); msg = j?.error?.message || msg; } catch {}
        return res.status(r.status).json({ error: msg });
      }
      const bytes = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
      res.setHeader('Content-Length', String(bytes.length));
      return res.status(200).send(bytes);
    }

    return res.status(400).json({ error: 'Unknown operation.' });
  } catch (e) {
    const status = Number(e.status) || 500;
    return res.status(status).json({ error: e.message || 'OpenAI request failed.' });
  }
};
