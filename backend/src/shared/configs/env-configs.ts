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
    // Signs the OAuth `state` that ties a Slack round trip to one user. Deliberately not the
    // JWT secret: state travels through Slack's logs and a browser's history, and rotating one
    // of the two should not silently invalidate the other.
    stateSigningSecret: string;
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
    // Guards every third-party token at rest - Slack bot tokens and GitHub user tokens alike.
    // Named for Slack because that is where it started; it is the app's one data-at-rest key.
    tokenEncryptionKey: string;
  };
}

/**
 * Every fallback below that is a secret rather than a convenience. Local runs and the e2e suite
 * need no .env, so the defaults have to work - which means they are published in this repo, and
 * production has to refuse them rather than quietly accept them. See assertProductionEnv.
 */
const DEVELOPMENT_SECRETS = {
  jwtSecret: 'local-development-secret',
  stateSigningSecret: 'local-development-state-secret',
  tokenEncryptionKey: 'local-development-encryption-key',
} as const;

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
      jwtSecret: process.env.AUTH_JWT_SECRET ?? DEVELOPMENT_SECRETS.jwtSecret,
      stateSigningSecret:
        process.env.STATE_SIGNING_SECRET ?? DEVELOPMENT_SECRETS.stateSigningSecret,
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
      tokenEncryptionKey:
        process.env.SLACK_TOKEN_ENCRYPTION_KEY ?? DEVELOPMENT_SECRETS.tokenEncryptionKey,
    },
  };
}

/**
 * Refuses to start on a production box that is missing anything it needs.
 *
 * The alternative is what this replaces: every secret had a working fallback, so a deploy that
 * dropped one booted perfectly and signed forgeable tokens, or encrypted other people's
 * workspace tokens under a key printed in this repository. It failed open and it failed quietly.
 *
 * Called before the Nest app is built, so a bad environment is a non-zero exit and a crash loop
 * the deploy can see, rather than a healthy-looking container serving something unsafe.
 */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const config = getEnvConfig();
  const problems: string[] = [];

  const required = (name: string, value: string) => {
    if (!value) {
      problems.push(`${name} is not set`);
    }
  };

  /**
   * Absent and "left at the value printed in this repository" are the same failure with two
   * causes, so only one of them is ever reported - a list that names the same variable twice
   * reads like two separate things to fix.
   */
  const requiredSecret = (name: string, developmentDefault: string) => {
    const value = process.env[name] ?? '';

    if (!value) {
      problems.push(`${name} is not set`);
      return;
    }

    if (value === developmentDefault) {
      problems.push(`${name} is still the development default, which is public in this repository`);
    }
  };

  required('MONGO_URL', process.env.MONGO_URL ?? '');
  required('APP_URL', process.env.APP_URL ?? '');

  requiredSecret('AUTH_JWT_SECRET', DEVELOPMENT_SECRETS.jwtSecret);
  requiredSecret('STATE_SIGNING_SECRET', DEVELOPMENT_SECRETS.stateSigningSecret);

  required('GH_APP_ID', config.githubApp.appId);
  required('GH_APP_SLUG', config.githubApp.slug);
  required('GH_APP_CLIENT_ID', config.githubApp.clientId);
  required('GH_APP_CLIENT_SECRET', config.githubApp.clientSecret);
  required('GH_APP_PRIVATE_KEY', config.githubApp.privateKey);
  required('GH_APP_WEBHOOK_SECRET', config.githubApp.webhookSecret);

  // Slack stays optional as a whole - isSlackConfigured() exists so the dashboard can say "not
  // set up" instead of failing. But a half-configured Slack is worse than none: it would accept
  // an install and then either reject every event or store the bot token under a public key.
  if (isSlackConfigured()) {
    required('SLACK_SIGNING_SECRET', config.slack.signingSecret);
    requiredSecret('SLACK_TOKEN_ENCRYPTION_KEY', DEVELOPMENT_SECRETS.tokenEncryptionKey);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with an incomplete environment:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }
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
