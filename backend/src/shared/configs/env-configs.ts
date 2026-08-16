import 'dotenv/config';

interface EnvConfig {
  app: {
    port: number;
    // Where the frontend is served. OAuth redirects that land here get handed back to it, so
    // the browser finishes on the origin that actually holds the session.
    url: string;
  };
  mongo: {
    url: string;
  };
  auth: {
    jwtSecret: string;
  };
  // Read from GH_APP_* rather than GITHUB_APP_*: GitHub reserves the GITHUB_ prefix for Actions
  // secrets, so a deploy would otherwise have to rename them on the way in.
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
  slack: {
    clientId: string;
    clientSecret: string;
    // Signs the Events API requests, the way the webhook secret signs GitHub's.
    signingSecret: string;
    // Where Slack sends the user back after they authorize - a page in the frontend, which
    // then posts the code here. Slack refuses plain http, localhost included, so local
    // development needs a tunnel rather than the dev server's own URL.
    redirectUri: string;
    // Guards the bot tokens at rest. They can post as proke into any channel of somebody
    // else's workspace, which is a good deal more than the GitHub token next to them.
    tokenEncryptionKey: string;
  };
}

export function getEnvConfig(): EnvConfig {
  return {
    app: {
      // Uncommon defaults so a local run never fights another service for a port.
      port: Number(process.env.PORT ?? 48211),
      url: (process.env.APP_URL ?? 'http://localhost:49173').replace(/\/$/, ''),
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
      appId: process.env.GH_APP_ID ?? '',
      slug: process.env.GH_APP_SLUG ?? '',
      clientId: process.env.GH_APP_CLIENT_ID ?? '',
      clientSecret: process.env.GH_APP_CLIENT_SECRET ?? '',
      privateKey: readPrivateKey(),
      webhookSecret: process.env.GH_APP_WEBHOOK_SECRET ?? '',
    },
    slack: {
      clientId: process.env.SLACK_CLIENT_ID ?? '',
      clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
      signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
      redirectUri: process.env.SLACK_REDIRECT_URI ?? '',
      // Same bargain as the JWT secret above: a fallback so local runs and tests need no
      // .env, and a hard requirement anywhere real. Rows encrypted under the fallback are
      // readable by anyone holding this source.
      tokenEncryptionKey:
        process.env.SLACK_TOKEN_ENCRYPTION_KEY ?? 'local-development-encryption-key',
    },
  };
}

/** Whether the Slack app is wired up at all. Everything user-facing degrades politely on false. */
export function isSlackConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = getEnvConfig().slack;

  return Boolean(clientId && clientSecret && redirectUri);
}

/**
 * A PEM is multi-line and .env files are not, so the key may arrive either as literal PEM
 * (with escaped newlines) or base64-encoded. Accept both rather than making the reader guess.
 */
function readPrivateKey(): string {
  const raw = process.env.GH_APP_PRIVATE_KEY ?? '';

  if (raw.length === 0) {
    return '';
  }

  if (raw.includes('-----BEGIN')) {
    return raw.replace(/\\n/g, '\n');
  }

  return Buffer.from(raw, 'base64').toString('utf8');
}
