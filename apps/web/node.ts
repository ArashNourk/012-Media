import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { RequestContext } from './app';

export type Handler = (req: Request, ctx: RequestContext) => Promise<Response>;

/** Adapt the fetch-style handler to Node's HTTP server. */
export function createNodeServer(handle: Handler, opts: { trustProxy: boolean }): Server {
  async function toRequest(req: IncomingMessage): Promise<Request> {
    const host = req.headers.host ?? 'localhost';
    const proto = opts.trustProxy ? String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0] : 'http';
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    let body: Buffer | undefined;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        size += (c as Buffer).length;
        if (size > 32_768) break; // the app rejects oversized bodies
        chunks.push(c as Buffer);
      }
      body = Buffer.concat(chunks);
    }
    return new Request(`${proto}://${host}${req.url ?? '/'}`, { method: req.method, headers, body: body ? (new Uint8Array(body) as unknown as BodyInit) : undefined });
  }

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
      const ip = (opts.trustProxy && fwd) || req.socket.remoteAddress || '';
      const r = await handle(await toRequest(req), { ip });
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      if (req.method === 'HEAD') return void res.end();
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error('[012] request failed', e instanceof Error ? e.message : e);
      res.statusCode = 500;
      res.end('Internal error');
    }
  });
}
