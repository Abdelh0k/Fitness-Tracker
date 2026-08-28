import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  requireBearerAuth,
  type OAuthMetadata,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import type { AppConfig } from './config.js';
import { buildAteformServer } from './server.js';

function authorizationMetadata(config: AppConfig): OAuthMetadata {
  const issuer = `${config.supabaseUrl}/auth/v1`;
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'email', 'profile'],
  };
}

function cors(response: Response, request: Request, config: AppConfig): Response {
  const origin = request.headers.get('origin');
  if (!origin || !config.allowedOrigins.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createAteformHttpHandler(config: AppConfig, verifier: OAuthTokenVerifier) {
  const metadataOptions = {
    oauthMetadata: authorizationMetadata(config),
    resourceServerUrl: config.publicUrl,
    scopesSupported: ['openid', 'email', 'profile'],
    resourceName: 'Ateform Fitness Tracker',
    dangerouslyAllowInsecureIssuerUrl: config.supabaseUrl.startsWith('http://'),
  };
  const authGate = requireBearerAuth({
    verifier,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(config.publicUrl),
  });
  const mcp = createMcpHandler(
    ({ authInfo }) => buildAteformServer(config, authInfo),
    { legacy: 'stateless', responseMode: 'json' },
  );

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const metadata = oauthMetadataResponse(request, metadataOptions);
      if (metadata) return metadata;

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true, service: 'ateform-mcp' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.pathname !== config.publicUrl.pathname) return new Response('Not found', { status: 404 });

      const origin = request.headers.get('origin');
      if (origin && !config.allowedOrigins.has(origin)) return new Response('Origin not allowed', { status: 403 });
      if (request.method === 'OPTIONS') {
        return cors(new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
            'access-control-allow-headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
          },
        }), request, config);
      }

      const auth = await authGate(request);
      if (auth instanceof Response) return cors(auth, request, config);
      return cors(await mcp.fetch(request, { authInfo: auth }), request, config);
    },
  };
}
