/**
 * Streaming HTTP pass-through for /api/sim/* → the TrueMemory Simulator sidecar.
 *
 * Hand-rolled with node:http so we can (a) skip a new npm dep and (b) keep the
 * pipe unbuffered — /api/sim/events emits Server-Sent Events and any buffering
 * layer would batch frames and defeat the point of SSE.
 *
 * Behavior:
 *   - Forwards method, sub-path (Express mount strips /api/sim for us), query
 *     string, request headers (minus hop-by-hop) and body.
 *   - Streams the response back preserving status + response headers.
 *   - 30-second idle timeout, except when the client indicated SSE via
 *     Accept: text/event-stream — those are long-lived by design.
 *   - On connect failure emits a 502 JSON envelope; if the response headers
 *     have already been flushed we quietly end the socket instead.
 *
 * The proxy accepts every HTTP method (via app.use), so control endpoints
 * (POST /api/sim/start, DELETE /api/sim/session/:id, etc.) work the same way
 * as reads.
 */
import type { Request, Response, RequestHandler } from 'express';
import http, { type OutgoingHttpHeaders, type RequestOptions } from 'node:http';

const DEFAULT_TIMEOUT_MS = 30_000;
const SSE_TIMEOUT_MS = 0; // 0 = disabled; SSE connections are long-lived

/**
 * RFC 7230 §6.1 hop-by-hop headers plus 'host' (the target's host wins). These
 * describe the client↔proxy hop and must not be forwarded to the sidecar.
 */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function acceptsEventStream(req: Request): boolean {
  const raw = req.headers['accept'];
  const asStr = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  return /text\/event-stream/i.test(asStr);
}

function stripHopByHop(src: http.IncomingHttpHeaders): OutgoingHttpHeaders {
  const dst: OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(src)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (value !== undefined) dst[key] = value;
  }
  return dst;
}

/**
 * Build an Express handler that proxies to the given sidecar base URL. Called
 * once at server startup — the URL parse cost is amortized across every request.
 */
export function createSidecarProxy(baseUrl: string): RequestHandler {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:') {
    // HTTPS would need node:https and TLS config; the sidecar is loopback-only
    // per the deployment brief so we hard-fail early rather than silently
    // half-supporting it.
    throw new Error(`sidecar proxy only supports http:// (got ${parsed.protocol})`);
  }
  const host = parsed.hostname;
  const port = Number.parseInt(parsed.port || '80', 10);

  return function sidecarProxyHandler(req: Request, res: Response): void {
    const isSse = acceptsEventStream(req);
    const timeout = isSse ? SSE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

    // When mounted via app.use('/api/sim', handler), Express rewrites req.url
    // to the sub-path + query string. Bare /api/sim shows up as '/' or ''.
    const targetPath = req.url && req.url.length > 0 ? req.url : '/';

    const options: RequestOptions = {
      host,
      port,
      method: req.method,
      path: targetPath,
      headers: stripHopByHop(req.headers),
      timeout,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const status = proxyRes.statusCode ?? 502;
      const outHeaders: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value === undefined) continue;
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        outHeaders[key] = value;
      }

      // For SSE responses, disable Nagle so tiny event frames flush immediately
      // instead of coalescing on the socket buffer for ~40ms.
      const upstreamCT = String(proxyRes.headers['content-type'] ?? '');
      if (isSse || /text\/event-stream/i.test(upstreamCT)) {
        try {
          res.socket?.setNoDelay(true);
        } catch {
          // Socket may already be closed — safe to ignore.
        }
      }

      res.writeHead(status, outHeaders);
      proxyRes.pipe(res);

      proxyRes.on('error', () => {
        // Upstream died mid-response; just terminate the downstream stream.
        try {
          res.end();
        } catch {
          /* noop */
        }
      });
    });

    proxyReq.on('error', (err) => {
      if (res.headersSent) {
        // Response already opened — can't rewrite status. Just close.
        try {
          res.end();
        } catch {
          /* noop */
        }
        return;
      }
      const detail = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: 'sidecar unavailable', detail });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('sidecar request timed out'));
    });

    // If the client hangs up (e.g. SSE window closed), abort the upstream call
    // so the sidecar doesn't keep computing for a vanished subscriber.
    const onClientClose = (): void => {
      if (!proxyReq.destroyed) proxyReq.destroy();
    };
    res.on('close', onClientClose);
    req.on('aborted', onClientClose);

    // Pipe the request body through. For methods without a body (GET/HEAD) req
    // emits 'end' immediately and pipe closes the proxy stream cleanly.
    req.pipe(proxyReq);
  };
}
