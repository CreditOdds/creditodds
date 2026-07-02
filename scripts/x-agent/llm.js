/**
 * Thin OpenAI chat helper shared by the generator and the judges.
 * Matches the existing repo convention (fetch against the OpenAI REST API,
 * OPENAI_API_KEY from env) rather than pulling in an SDK.
 */

async function chat({ model, messages, temperature = 0.7, maxTokens = 400, json = false }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${text}`);
  }

  const data = await res.json();
  return (data.choices[0]?.message?.content || '').trim();
}

async function chatJson(opts) {
  const raw = await chat({ ...opts, json: true });
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Expected JSON from model but got: ${raw.slice(0, 300)}`);
  }
}

module.exports = { chat, chatJson };
