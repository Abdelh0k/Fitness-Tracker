import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import type { AppConfig } from './config.js';

type JwtPayload = { exp?: number; client_id?: string; scope?: string; scp?: string[] };

export function decodeJwtPayload(token: string): JwtPayload {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed JWT');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as JwtPayload;
}

export function createSupabaseTokenVerifier(config: AppConfig): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: config.supabasePublishableKey,
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Supabase rejected the access token');
      }

      const user = (await response.json()) as { id?: string; email?: string };
      let payload: JwtPayload;
      try {
        payload = decodeJwtPayload(token);
      } catch {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Access token is not a valid JWT');
      }
      if (!user.id || !payload.exp) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Access token is missing required claims');
      }

      const scopes = Array.isArray(payload.scp)
        ? payload.scp
        : (payload.scope || 'openid profile email').split(/\s+/).filter(Boolean);

      return {
        token,
        clientId: payload.client_id || 'ateform-mcp-client',
        scopes,
        expiresAt: payload.exp,
        extra: { userId: user.id, email: user.email },
      };
    },
  };
}
