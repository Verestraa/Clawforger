/**
 * Persona presets — Researcher / Writer / Trader.
 *
 * Single source of truth for what kind of skills each preset agent should
 * forge. Both the studio's Mint UI and the marketplace server's skill-forge
 * codegen prompt read from this module so a "Trader" never accidentally
 * forges an arxiv-fetcher and vice-versa.
 *
 * Plain data only — safe to import from both Node (server) and the browser
 * bundle (studio).
 */

export interface PersonaApi {
  /** Human-readable label */
  name: string;
  /** Base URL for the API (no trailing slash) */
  url: string;
  /** No-auth public API by default. Avoid keyed APIs. */
  auth: 'none' | 'key';
  /** Example fetch URL the codegen can copy */
  example: string;
  /** What this API returns */
  returns: string;
}

export interface PersonaConfig {
  /** Persona name (matches the preset button + iNFT manifest) */
  name: 'Researcher' | 'Writer' | 'Trader';
  /** Default system prompt for this persona (preset button writes this) */
  systemPrompt: string;
  /** One-line scope */
  scope: string;
  /** Skill tag namespace prefixes the agent SHOULD forge */
  preferredTagPrefixes: string[];
  /** Tag prefixes the agent should NOT forge — out of scope */
  forbiddenTagPrefixes: string[];
  /** Example skill tags the agent might forge */
  exampleTags: string[];
  /** Curated no-auth public APIs the codegen prompt references */
  preferredApis: PersonaApi[];
}

export const PERSONAS: PersonaConfig[] = [
  {
    name: 'Researcher',
    systemPrompt:
      'You are Researcher. You find, fetch, and summarize academic literature. When existing skills cannot solve a task, you design a new tool, sandbox-test it, and publish.',
    scope:
      'academic literature: papers, abstracts, citations, authors, references',
    preferredTagPrefixes: ['fetch.', 'paper.', 'arxiv.', 'cite.', 'wiki.'],
    forbiddenTagPrefixes: ['trade.', 'price.', 'token.', 'defi.'],
    exampleTags: [
      'arxiv.summarize',
      'wiki.lookup',
      'crossref.cite',
      'semantic_scholar.search',
    ],
    preferredApis: [
      {
        name: 'arXiv API',
        url: 'https://export.arxiv.org/api',
        auth: 'none',
        example:
          "fetch('https://export.arxiv.org/api/query?id_list=' + paperId)",
        returns: 'Atom XML — extract <summary> via indexOf',
      },
      {
        name: 'Wikipedia REST',
        url: 'https://en.wikipedia.org/api/rest_v1',
        auth: 'none',
        example:
          "fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))",
        returns: 'JSON with extract field',
      },
      {
        name: 'Semantic Scholar',
        url: 'https://api.semanticscholar.org/graph/v1',
        auth: 'none',
        example:
          "fetch('https://api.semanticscholar.org/graph/v1/paper/search?query=' + encodeURIComponent(q) + '&limit=5')",
        returns: 'JSON with paper list',
      },
      {
        name: 'CrossRef',
        url: 'https://api.crossref.org',
        auth: 'none',
        example: "fetch('https://api.crossref.org/works/' + doi)",
        returns: 'JSON metadata for DOI',
      },
    ],
  },
  {
    name: 'Writer',
    systemPrompt:
      'You are Writer. You compose well-structured prose. You purchase research data from other agents via x402 when you need facts.',
    scope: 'prose composition: summarize, rephrase, outline, translate, web reading',
    preferredTagPrefixes: ['text.', 'web.', 'content.', 'translate.', 'rss.'],
    forbiddenTagPrefixes: ['trade.', 'price.', 'token.', 'arxiv.', 'paper.'],
    exampleTags: [
      'text.summarize',
      'web.fetch_extract',
      'translate.text',
      'rss.fetch',
    ],
    preferredApis: [
      {
        name: 'Wikipedia REST (for facts)',
        url: 'https://en.wikipedia.org/api/rest_v1',
        auth: 'none',
        example:
          "fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(topic))",
        returns: 'JSON with extract',
      },
      {
        name: 'LibreTranslate',
        url: 'https://libretranslate.de/translate',
        auth: 'none',
        example:
          "fetch('https://libretranslate.de/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({q:text,source:'auto',target:'en'}) })",
        returns: 'JSON with translatedText',
      },
      {
        name: 'Direct webpage fetch (extract via indexOf)',
        url: 'any https URL',
        auth: 'none',
        example:
          "const r = await fetch(url); const html = await r.text(); const start = html.indexOf('<article'); /* ... */",
        returns: 'raw HTML — strip tags via indexOf/substring',
      },
    ],
  },
  {
    name: 'Trader',
    systemPrompt:
      'You are Trader. You manage a treasury. You autonomously rebalance holdings when balances drift past targets, settling every action through KeeperHub.',
    scope: 'market data: prices, TVL, volumes, gas, no execution',
    preferredTagPrefixes: ['price.', 'market.', 'token.', 'defi.', 'gas.'],
    forbiddenTagPrefixes: ['fetch.arxiv', 'paper.', 'wiki.', 'translate.'],
    exampleTags: [
      'price.crypto',
      'market.token_info',
      'defi.tvl',
      'price.history',
    ],
    preferredApis: [
      {
        name: 'CryptoCompare (symbol-based, FIRST CHOICE)',
        url: 'https://min-api.cryptocompare.com/data',
        auth: 'none',
        example:
          "const r = await fetch('https://min-api.cryptocompare.com/data/price?fsym=' + symbol.toUpperCase() + '&tsyms=USD'); const data = await r.json(); const priceUSD = Number(data.USD || 0);",
        returns: 'JSON like {"USD": 67234.12} — ACCEPTS RAW SYMBOLS like BTC, ETH, SOL',
      },
      {
        name: 'CoinPaprika (symbol via /tickers/btc-bitcoin)',
        url: 'https://api.coinpaprika.com/v1',
        auth: 'none',
        example:
          "fetch('https://api.coinpaprika.com/v1/tickers/btc-bitcoin')",
        returns: 'JSON with quotes.USD.price — needs slug like btc-bitcoin, eth-ethereum',
      },
      {
        name: 'CoinGecko (REQUIRES SLUG not symbol)',
        url: 'https://api.coingecko.com/api/v3',
        auth: 'none',
        example:
          "// CoinGecko ids are SLUGS not symbols. Map: BTC→bitcoin, ETH→ethereum, SOL→solana, etc.\nconst SLUG = { BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin', XRP:'ripple', DOGE:'dogecoin' };\nconst id = SLUG[symbol.toUpperCase()] || symbol.toLowerCase();\nfetch('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd')",
        returns: "JSON like {bitcoin: {usd: 67234}} — DO NOT pass raw symbols",
      },
      {
        name: 'DeFiLlama (TVL only, by protocol slug)',
        url: 'https://api.llama.fi',
        auth: 'none',
        example: "fetch('https://api.llama.fi/protocol/' + slug)",
        returns: 'JSON with TVL history — for protocol-level data, not token prices',
      },
    ],
  },
];

/**
 * Detect a persona from an agent's system prompt or stored name. Matches on
 * a leading "You are <Name>" phrase or a `personaName` field if you store
 * one. Returns null if no match — callers should fall back to a generic
 * codegen prompt.
 */
export function detectPersona(
  input: { systemPrompt?: string; name?: string } | string | null | undefined
): PersonaConfig | null {
  if (!input) return null;
  const haystack =
    typeof input === 'string'
      ? input
      : `${input.name ?? ''}\n${input.systemPrompt ?? ''}`;
  const lower = haystack.toLowerCase();
  for (const p of PERSONAS) {
    const needle = p.name.toLowerCase();
    if (
      lower.includes(`you are ${needle}`) ||
      lower.includes(`name: ${needle}`) ||
      lower.startsWith(needle) ||
      // raw match anywhere — last resort but useful for short inputs
      (lower.length < 80 && lower.includes(needle))
    ) {
      return p;
    }
  }
  return null;
}

/**
 * Render a persona context block suitable for splicing into the skill-forge
 * codegen prompt. Tells the model:
 *   - what kind of skill it's allowed to forge
 *   - which no-auth APIs to prefer
 *   - example skill tags to namespace under
 */
export function buildPersonaCodegenHint(persona: PersonaConfig): string {
  const apiBullets = persona.preferredApis
    .map(
      (a) =>
        `- ${a.name} (${a.url}, ${a.auth} auth): ${a.example}\n  → ${a.returns}`
    )
    .join('\n');
  return `
PERSONA: ${persona.name}
SCOPE: ${persona.scope}

You may ONLY forge skills with capability tags starting with one of:
  ${persona.preferredTagPrefixes.join(', ')}
You MUST NOT forge skills under:
  ${persona.forbiddenTagPrefixes.join(', ')}

Example tags this persona forges: ${persona.exampleTags.join(', ')}

PREFER these no-auth public APIs (do NOT use APIs that require an API key
or 'DEMO_KEY' — they fail at runtime and force the fallback path):
${apiBullets}
`.trim();
}
