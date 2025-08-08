export type OpenAIProviderOptions = {
  baseUrl: string; // e.g., https://api.openrouter.ai/v1
  apiKeyEnv?: string; // e.g., OPENROUTER_KEY
  fetchImpl?: typeof fetch; // allow injection for tests
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.replace(/^\//, "");
  return `${b}/${p}`;
}

export function createOpenAIProvider(opts: OpenAIProviderOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKeyEnv ? process.env[opts.apiKeyEnv] : undefined;

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // If baseUrl already ends with /v1 and incoming path starts with /v1, drop the leading /v1 from the path
    const baseHasV1 = /\/v1\/?$/.test(opts.baseUrl);
    let forwardPath = url.pathname;
    if (baseHasV1 && forwardPath.startsWith("/v1")) {
      forwardPath = forwardPath.slice(3) || "/"; // remove '/v1'
    }
    const target = joinUrl(opts.baseUrl, forwardPath);

    const headers = new Headers(req.headers);
    if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);

    const init: RequestInit = {
      method: req.method,
      headers,
      body: req.body,
    };

    const upstream = await fetchImpl(target, init);

    if ((upstream.headers.get("content-type") || "").includes("text/event-stream") && upstream.body) {
      // passthrough stream unchanged
      return new Response(upstream.body, { headers: upstream.headers });
    }

    const buf = await upstream.arrayBuffer();
    return new Response(buf, { status: upstream.status, headers: upstream.headers });
  };
}
