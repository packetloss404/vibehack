/**
 * Shared helpers for extracting credit signals from free-form text.
 * Used by luma (event description), aggregators (README markdown), and providers (HTML).
 */

const PROVIDER_ALLOWLIST = /\b(OpenAI|Anthropic|Claude|Cohere|Mistral|Groq|Fireworks|Together|Replicate|Modal|Vercel|Convex|Vapi|ElevenLabs|Cartesia|Pinecone|MongoDB|Weaviate|LangChain|LlamaIndex|AWS|GCP|Azure|Google Cloud|Nvidia|Cerebras|HuggingFace|Lambda Labs?|Fly\.?io|Hugging Face|Smithery|MiniMax|Browser Use|TestSprite|CopilotKit|Unstructured|Datadog|Microsoft)\b/gi;

const PATTERNS = [
  // "$50 MongoDB Atlas credits", "$15,000 in AWS credits", "$250 Anthropic API credits"
  /\$\s?([\d,]+)(?:\.\d+)?\s*(?:in\s+)?(?:[A-Z][\w ]{0,30}\s+)?(?:API\s+)?credits?/gi,
  // "$80,000 total prize pool"
  /\$\s?([\d,]+)\+?\s*(?:in\s+)?(?:cash\s+)?(?:prize|prize pool)/gi,
  // "$5,000 grant", "$10,000 in grants"
  /\$\s?([\d,]+)\s*(?:in\s+)?grants?/gi,
  // "up to $5,000", "$5K", "$10k"
  /(?:up\s+to\s+)?\$\s?([\d,]+)\s?[kK]\b/gi,
];

/** Parse a dollar-amount string like "$5,000" → 5000, or "$5K" → 5000 */
export function parseUsd(s) {
  if (!s) return 0;
  const str = String(s);
  let m = str.match(/\$\s?([\d,]+(?:\.\d+)?)\s?[kK]\b/);
  if (m) return Math.round(parseFloat(m[1].replace(/,/g, '')) * 1000);
  m = str.match(/\$\s?([\d,]+(?:\.\d+)?)/);
  if (m) return Math.round(parseFloat(m[1].replace(/,/g, '')));
  return 0;
}

/**
 * Extract credit signals from text. Returns array of { value, valueUsd, provider, raw }.
 * Deduped by (provider + valueUsd).
 */
export function extractCreditSignals(text) {
  if (!text) return [];
  const out = new Map(); // key = provider|valueUsd → entry

  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      // Scan a 60-char window around the match for a provider name
      const window = text.slice(Math.max(0, m.index - 30), Math.min(text.length, m.index + raw.length + 60));
      const provMatch = window.match(PROVIDER_ALLOWLIST);
      const provider = provMatch ? provMatch[0] : 'Unknown';
      const valueUsd = parseUsd(raw);
      if (valueUsd <= 0) continue;
      const key = `${provider.toLowerCase()}|${valueUsd}`;
      if (!out.has(key)) {
        out.set(key, { value: `$${valueUsd.toLocaleString()}`, valueUsd, provider, raw: raw.trim() });
      }
    }
  }

  // Also detect "free tier" / "API access" + provider — zero-dollar leads worth surfacing
  const freeRe = /(?:free|complimentary|community)\s+(?:API|compute|GPU|inference|cloud|tier|access|credits?)/gi;
  let fm;
  while ((fm = freeRe.exec(text)) !== null) {
    const window = text.slice(Math.max(0, fm.index - 40), Math.min(text.length, fm.index + fm[0].length + 40));
    const provMatch = window.match(PROVIDER_ALLOWLIST);
    if (!provMatch) continue;
    const provider = provMatch[0];
    const key = `${provider.toLowerCase()}|free`;
    if (!out.has(key)) {
      out.set(key, { value: 'free tier', valueUsd: 0, provider, raw: fm[0].trim() });
    }
  }

  return [...out.values()];
}

/**
 * Walk a Lu.ma / ProseMirror doc and return flat text.
 * Shape: { type: 'doc', content: [{ type: 'paragraph', content: [{ type:'text', text:'...' }] }] }
 */
export function flattenProseMirror(doc) {
  if (!doc) return '';
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return parts.join('\n');
}
