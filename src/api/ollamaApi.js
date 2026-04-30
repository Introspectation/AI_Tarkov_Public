const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'ministral-3';
const TIMEOUT_MS = 5 * 60 * 1000; // 5min — generous for model loading + long prompts
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const insightCache = new Map();

/**
 * @param {string} craftId - Cache key
 * @param {string} prompt - The prompt to send
 * @param {AbortSignal} [externalSignal] - Optional signal for user cancellation
 */
export async function fetchOllamaInsight(craftId, prompt, externalSignal) {
  const cached = insightCache.get(craftId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Wire external signal (stop button) to our internal controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new Error('AI analysis cancelled');
    }
    const onAbort = () => controller.abort();
    externalSignal.addEventListener('abort', onAbort);
  }

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const json = await response.json();
    const result = json.response || '';

    insightCache.set(craftId, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        throw new Error('AI analysis cancelled');
      }
      throw new Error('AI timed out — model may still be loading, try again');
    }
    throw new Error('AI unavailable — is Ollama running?');
  } finally {
    clearTimeout(timer);
  }
}
