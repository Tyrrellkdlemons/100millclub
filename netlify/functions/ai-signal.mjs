/* POST /api/ai-signal — the site-funded AI desk.
   Runs only when the owner has set OPENROUTER_API_KEY in Netlify env vars;
   until then it answers {enabled:false} and the client says so honestly and
   falls back to the visitor's own key (the existing AI desk) or to the
   local indicator engine. The key never reaches the browser.

   Env:
     OPENROUTER_API_KEY   required to enable
     OPENROUTER_MODEL     optional, default deepseek/deepseek-chat-v3.1:free */

const SYSTEM =
  'You are the signals analyst inside 100MillClub, an educational paper-trading terminal. ' +
  'You receive computed technical indicators for one market. Write a tight, honest read: ' +
  '2-4 short paragraphs. State what the indicators actually show, where the levels are, and ' +
  'what would invalidate the read. Never invent numbers not present in the context, never ' +
  'promise outcomes, and never give personalized financial advice — this is education about ' +
  'method. End with one sentence starting "Risk note:".';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return Response.json(
      { enabled: false, reason: 'No server key configured. Set OPENROUTER_API_KEY in Netlify env vars to switch this on for every visitor.' },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const context = String(body.context || '').slice(0, 4000);
  const question = String(body.question || 'Give your read of this market.').slice(0, 500);
  if (!context) return Response.json({ error: 'context required' }, { status: 400 });

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://100millclub.netlify.app',
        'X-Title': '100MillClub Signals'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1:free',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: 'Context:\n' + context + '\n\nTask: ' + question }
        ],
        max_tokens: 500
      })
    });

    if (!r.ok) {
      const status = r.status === 402 ? 'out of credits' : r.status === 429 ? 'rate limited' : 'error ' + r.status;
      return Response.json(
        { enabled: true, ok: false, reason: 'OpenRouter is ' + status + ' right now.' },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content?.trim();
    return Response.json(
      { enabled: true, ok: !!text, text: text || '', reason: text ? '' : 'Empty reply from the model.' },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    return Response.json(
      { enabled: true, ok: false, reason: String(e?.message || e) },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
};

export const config = { path: '/api/ai-signal' };
