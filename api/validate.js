export const config = { runtime: 'edge' };

export default async function handler(req) {
  if(req.method === 'OPTIONS'){
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if(req.method !== 'POST'){
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();

    if(body.action === 'verify_license'){
      const licenseKey = body.license_key;
      if(!licenseKey){ return new Response(JSON.stringify({ error: 'No license key provided' }), { status: 400 }); }
      const lsRes = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ license_key: licenseKey, instance_name: 'browser' })
      });
      const lsData = await lsRes.json();
      if(lsData.valid){
        return new Response(JSON.stringify({ valid: true, expires: lsData.license_key.expires_at }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } else {
        return new Response(JSON.stringify({ valid: false, error: 'Invalid or expired license key' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    const { idea, chips } = body;
    if(!idea || idea.length < 20){
      return new Response(JSON.stringify({ error: 'Idea too short' }), { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if(!apiKey){ return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500 }); }

    const prompt = `You are a brutally honest startup advisor. Analyse this business idea and respond ONLY in valid JSON, no markdown, no backticks, no extra text:

{
  "viability_score": <number 1-100>,
  "score_label": "<one punchy sentence verdict>",
  "market_fit": "<2-3 sentences on target market, demand, timing>",
  "top_risks": ["<risk 1>","<risk 2>","<risk 3>"],
  "revenue_models": ["<model 1 with brief explanation>","<model 2>","<model 3>"],
  "competitors": "<2-3 sentences naming real competitors and how to differentiate>",
  "pivot_ideas": ["<pivot 1>","<pivot 2>","<pivot 3>"]
}

Business idea: ${idea}
Requested sections: ${(chips||[]).join(', ')}
Be specific. Name real markets, real competitors, real numbers. Do not sugarcoat.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'You are a brutally honest startup advisor. Always respond with valid JSON only. No markdown, no backticks, no extra text.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await groqRes.json();
    if(data.error){ return new Response(JSON.stringify({ error: data.error.message }), { status: 500 }); }
    const raw = data.choices[0].message.content;
    const clean = raw.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message || 'Something went wrong' }), { status: 500 });
  }
}
