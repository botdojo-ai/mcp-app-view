import { McpAppClient } from './protocol/client';

/** Structurally compatible with the frontend SDK's ModelContext. Functions stay in the iframe. */
export interface FrontendMcpContext {
  name: string;
  description?: string;
  tools?: Array<{ name: string; description?: string; inputSchema: any; execute?: (args: any) => any }> | Record<string, { description?: string; inputSchema: any; execute?: (args: any) => any }>;
}

function tools(context: FrontendMcpContext) {
  return Array.isArray(context.tools) ? context.tools : Object.entries(context.tools || {}).map(([name, tool]) => ({ ...tool, name }));
}

/** Register this app's live handlers with its workspace host. No credentials or sockets required. */
export async function registerFrontendMcp(context: FrontendMcpContext, options: { client?: McpAppClient; timeoutMs?: number } = {}) {
  const client = options.client || new McpAppClient();
  const ownsClient = !options.client;
  let current = context;
  let generation = '';
  let disposed = false;
  let queue: Promise<any> = Promise.resolve();
  const inflight = new Map<string, Promise<any>>();
  const serialize = (value: FrontendMcpContext) => ({
    name: value.name, description: value.description,
    tools: tools(value).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  });
  const invoke = async (request: any) => {
    if (disposed || request?.generation !== generation) throw new Error('Stale or unavailable app generation');
    if (typeof request?.requestId !== 'string') throw new Error('Request ID is required');
    const key = request.requestId;
    if (inflight.has(key)) return inflight.get(key);
    if (inflight.size >= 256) throw new Error('App request limit reached; reopen preview');
    const operationGeneration = generation;
    const run = queue.then(async () => {
      if (disposed || generation !== operationGeneration) throw new Error('Stale app generation');
      const handler = tools(current).find(item => item.name === request.name)?.execute;
      if (!handler) throw new Error('App tool unavailable');
      const result = await handler(request.arguments || {});
      const json = JSON.stringify(result ?? null);
      if (json.length > 262144) throw new Error('App result exceeds 256 KiB');
      return JSON.parse(json);
    });
    queue = run.catch(() => {});
    inflight.set(key, run);
    return run;
  };
  client.setRequestHandler('botdojo/mcp/call', invoke);
  try {
    if (!client.isInitialized) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { off(); reject(new Error('Frontend MCP host initialization timed out')); }, options.timeoutMs ?? 10000);
        const off = client.on('initialized', () => { clearTimeout(timer); off(); resolve(); });
        if (ownsClient) client.start();
      });
    }
    if ((client.state.hostCapabilities as any)?.['botdojo/frontend-mcp']?.version !== 1) throw new Error('Frontend MCP is unavailable in this host');
    const ack: any = await client.sendRequest('botdojo/mcp/register', serialize(current));
    if (ack?.ok !== true || ack.version !== 1 || typeof ack.generation !== 'string') throw new Error('Frontend MCP registration was not acknowledged');
    generation = ack.generation;
  } catch (error) {
    client.setRequestHandler('botdojo/mcp/call');
    if (ownsClient) client.stop();
    throw error;
  }
  return {
    async update(next: FrontendMcpContext) {
      if (disposed) throw new Error('App registration disposed');
      const ack: any = await client.sendRequest('botdojo/mcp/update', serialize(next));
      if (ack?.ok !== true || ack.version !== 1 || typeof ack.generation !== 'string') throw new Error('Frontend MCP update was not acknowledged');
      current = next; generation = ack.generation;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      try { await client.sendRequest('botdojo/mcp/unregister', {}); }
      finally {
        client.setRequestHandler('botdojo/mcp/call');
        if (ownsClient) client.stop();
      }
    },
  };
}
