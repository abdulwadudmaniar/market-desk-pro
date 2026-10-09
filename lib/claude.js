// Minimal Claude Messages API client (no SDK needed).
const BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const claudeEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function claude(body, { timeoutMs = 45000 } = {}) {
  const r = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL(), ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || `Claude API error ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status, type: j.error && j.error.type });
  }
  return j;
}
