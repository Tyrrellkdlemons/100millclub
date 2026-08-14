/* /api/config — which server-side features are switched on.
   The client asks once at boot and shapes the UI honestly around the answer
   (e.g. the signals desk shows "site AI: on" only when the key exists).
   Only booleans leave this function — never the keys themselves. */

export default async () => {
  return Response.json(
    {
      ai: !!process.env.OPENROUTER_API_KEY,
      aiModel: process.env.OPENROUTER_API_KEY
        ? (process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1:free')
        : null,
      quotes: true,     // the Yahoo proxy needs no key — always on when deployed
      cot: true,        // CFTC public reporting — keyless primary source
      macro: true,      // FRED via the keyless CSV route
      term: true,       // futures curve from Yahoo-quoted contract months
      eia: !!process.env.EIA_API_KEY,
      fred: !!process.env.FRED_API_KEY,
      at: Date.now()
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
};

export const config = { path: '/api/config' };
