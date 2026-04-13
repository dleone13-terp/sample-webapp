import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';

const TEAM_DOMAIN_SCHEME = 'https://';

const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(rawDomain: string): string {
  const trimmed = rawDomain.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `${TEAM_DOMAIN_SCHEME}${trimmed}`;
}

function getJwks(teamDomain: string) {
  const cached = jwksByDomain.get(teamDomain);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  jwksByDomain.set(teamDomain, jwks);
  return jwks;
}

function getToken(c: Context<{ Bindings: Env }>): string | null {
  return c.req.header('cf-access-jwt-assertion') ?? null;
}

export const requireCloudflareAccessAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.env.JWT_VALIDATION_DISABLED === 'true') {
    await next();
    return;
  }

  const teamDomain = normalizeTeamDomain(c.env.TEAM_DOMAIN ?? '');
  const policyAud = (c.env.POLICY_AUD ?? '').trim();

  if (!teamDomain || !policyAud) {
    return c.json(
      {
        error:
          'Worker auth misconfigured: set TEAM_DOMAIN and POLICY_AUD, or set JWT_VALIDATION_DISABLED=true for local development.',
      },
      500
    );
  }

  const token = getToken(c);
  if (!token) {
    return c.json({ error: 'Missing Cloudflare Access token.' }, 401);
  }

  try {
    await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience: policyAud,
    });

    await next();
  } catch {
    return c.json({ error: 'Invalid Cloudflare Access token.' }, 403);
  }
};