import 'dotenv/config';

interface EnvConfig {
  app: {
    port: number;
  };
  mongo: {
    url: string;
  };
  auth: {
    jwtSecret: string;
  };
  githubApp: {
    appId: string;
    // The app's URL slug, used to build the install link we send users to.
    slug: string;
    // User-to-server login. A GitHub App does its own OAuth-shaped flow; there is no
    // separate OAuth App any more.
    clientId: string;
    clientSecret: string;
    privateKey: string;
    webhookSecret: string;
  };
}

export function getEnvConfig(): EnvConfig {
  return {
    app: {
      // Uncommon defaults so a local run never fights another service for a port.
      port: Number(process.env.PORT ?? 48211),
    },
    mongo: {
      url: process.env.MONGO_URL ?? 'mongodb://localhost:47117/proke',
    },
    auth: {
      // The fallback keeps local dev and tests running without a .env file. Set it in any
      // deployed environment - tokens signed with a public secret can be forged by anyone.
      jwtSecret: process.env.AUTH_JWT_SECRET ?? 'local-development-secret',
    },
    githubApp: {
      appId: process.env.GITHUB_APP_ID ?? '',
      slug: process.env.GITHUB_APP_SLUG ?? '',
      clientId: process.env.GITHUB_APP_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? '',
      privateKey: readPrivateKey(),
      webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET ?? '',
    },
  };
}

/**
 * A PEM is multi-line and .env files are not, so the key may arrive either as literal PEM
 * (with escaped newlines) or base64-encoded. Accept both rather than making the reader guess.
 */
function readPrivateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY ?? '';

  if (raw.length === 0) {
    return '';
  }

  if (raw.includes('-----BEGIN')) {
    return raw.replace(/\\n/g, '\n');
  }

  return Buffer.from(raw, 'base64').toString('utf8');
}
