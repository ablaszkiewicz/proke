#!/usr/bin/env node
/**
 * Puts the backend on a public https URL and prints exactly what to paste where.
 *
 *   node scripts/tunnels.mjs [--no-write] [--verbose]
 *
 * One tunnel, not two. GitHub webhooks, the Slack events URL and the Slack redirect all point
 * at the backend; the frontend stays on http://localhost and the backend hands OAuth callbacks
 * back to it, so the browser finishes on the origin that holds the session.
 *
 * Two modes, picked from config:
 *
 *   named  TUNNEL_NAME + TUNNEL_API_HOSTNAME are set. A permanent hostname on a domain in your
 *          Cloudflare account. Paste the URLs into GitHub and Slack once, ever.
 *   quick  Nothing configured. A fresh *.trycloudflare.com every restart, which means
 *          re-pasting those fields every session.
 *
 * Config comes from the environment or a gitignored `.env.tunnel` at the repo root.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKEND_PORT = 48211;
const FRONTEND_PORT = 49173;
const WRITE = !process.argv.includes("--no-write");
const VERBOSE = process.argv.includes("--verbose");

const tty = Boolean(process.stdout.isTTY);
const c = {
  dim: (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s) => (tty ? `\x1b[36m${s}\x1b[0m` : s),
};

/** Reads a KEY=value file into a Map, leaving quotes and the rest of the file alone. */
function readEnvFile(path) {
  const values = new Map();

  if (!existsSync(path)) {
    return values;
  }

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);

    if (match) {
      values.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
    }
  }

  return values;
}

/**
 * Rewrites one key in place. Every other byte of the file is preserved - these files hold
 * secrets and comments, and a helper that reformats them would not be worth running.
 */
function writeEnvKey(path, key, value) {
  if (!existsSync(path)) {
    return "missing";
  }

  const contents = readFileSync(path, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(contents)) {
    const current = pattern.exec(contents)[0].slice(key.length + 1).trim();

    if (current === value) {
      return "unchanged";
    }

    writeFileSync(path, contents.replace(pattern, `${key}=${value}`));
    return "updated";
  }

  writeFileSync(path, `${contents.replace(/\n*$/, "\n")}\n${key}=${value}\n`);
  return "added";
}

const tunnelEnv = readEnvFile(join(ROOT, ".env.tunnel"));
const setting = (key) => process.env[key] ?? tunnelEnv.get(key) ?? "";

const TUNNEL_NAME = setting("TUNNEL_NAME");
const API_HOSTNAME = setting("TUNNEL_API_HOSTNAME");
// Optional. Nothing needs the frontend to be public, but it is one ingress rule away if you
// ever want to show it to somebody.
const APP_HOSTNAME = setting("TUNNEL_APP_HOSTNAME");
const named = Boolean(TUNNEL_NAME && API_HOSTNAME);

if (!which("cloudflared")) {
  console.error(c.red("cloudflared is not installed.  brew install cloudflared"));
  process.exit(1);
}

const children = [];
const stop = () => children.forEach((child) => child.kill("SIGINT"));
process.on("SIGINT", () => (stop(), process.exit(0)));
process.on("SIGTERM", () => (stop(), process.exit(0)));

const apiUrl = named ? await runNamed() : await runQuick();
report(apiUrl);

// ---------------------------------------------------------------------------

/** Whether anything is accepting connections on a local port. */
function listening(port) {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(1500);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
    socket.connect(port, "127.0.0.1");
  });
}

function which(binary) {
  try {
    execFileSync("which", [binary], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Forwards only what is worth reading; cloudflared's INF stream would bury the panel. */
function pipe(child, label) {
  const onLine = (line) => {
    if (!line.trim()) {
      return;
    }

    if (VERBOSE || /ERR|WRN|error|failed/i.test(line)) {
      console.log(c.dim(`${label} `) + line.trim());
    }
  };

  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(onLine);
    });
  }

  child.on("exit", (code) => {
    console.log(c.red(`\n${label} cloudflared exited (${code}). Restart this pane to retry.`));
  });
}

async function runQuick() {
  const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${BACKEND_PORT}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  pipe(child, "[tunnel]");

  console.log(c.dim("Opening a quick tunnel…"));

  return new Promise((resolve, reject) => {
    let settled = false;
    const watch = (chunk) => {
      const found = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());

      if (found && !settled) {
        settled = true;
        resolve(found[0]);
      }
    };

    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    setTimeout(() => {
      if (!settled) {
        reject(new Error("cloudflared never printed a hostname"));
      }
    }, 30_000);
  });
}

async function runNamed() {
  if (!existsSync(join(homedir(), ".cloudflared", "cert.pem"))) {
    console.error(firstRunHelp("You have not logged in to Cloudflare on this machine yet."));
    process.exit(1);
  }

  const tunnel = findTunnel(TUNNEL_NAME);

  if (!tunnel) {
    console.error(firstRunHelp(`No tunnel named "${TUNNEL_NAME}" exists in your account.`));
    process.exit(1);
  }

  const configPath = writeNamedConfig(tunnel);
  const child = spawn("cloudflared", ["tunnel", "--config", configPath, "run", TUNNEL_NAME], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  pipe(child, "[tunnel]");

  // Nothing to wait for: the hostname is a DNS record that already exists.
  return `https://${API_HOSTNAME}`;
}

function findTunnel(name) {
  try {
    const listed = JSON.parse(
      execFileSync("cloudflared", ["tunnel", "list", "--output", "json"], {
        stdio: ["ignore", "pipe", "pipe"],
      }).toString(),
    );

    return listed.find((tunnel) => tunnel.name === name) ?? null;
  } catch {
    return null;
  }
}

/**
 * Generated rather than hand-written, so the ports and hostnames cannot drift out of sync with
 * everything else this script prints. Gitignored - it names your domain.
 */
function writeNamedConfig(tunnel) {
  const directory = join(ROOT, ".cloudflared");
  mkdirSync(directory, { recursive: true });

  const credentials = join(homedir(), ".cloudflared", `${tunnel.id}.json`);
  const ingress = [`  - hostname: ${API_HOSTNAME}`, `    service: http://localhost:${BACKEND_PORT}`];

  if (APP_HOSTNAME) {
    ingress.push(`  - hostname: ${APP_HOSTNAME}`, `    service: http://localhost:${FRONTEND_PORT}`);
  }

  const configPath = join(directory, "config.yml");
  writeFileSync(
    configPath,
    [
      "# Generated by scripts/tunnels.mjs. Edit that, not this.",
      `tunnel: ${tunnel.id}`,
      ...(existsSync(credentials) ? [`credentials-file: ${credentials}`] : []),
      "",
      "ingress:",
      ...ingress,
      "  - service: http_status:404",
      "",
    ].join("\n"),
  );

  return configPath;
}

function firstRunHelp(problem) {
  const host = API_HOSTNAME || "proke-api.yourdomain.com";

  return [
    "",
    c.yellow(problem),
    "",
    c.bold("  One-time setup, then the hostname is permanent:"),
    "",
    c.cyan("    cloudflared login"),
    c.dim("      # pick the domain you want to use, in the browser window it opens"),
    c.cyan(`    cloudflared tunnel create ${TUNNEL_NAME || "proke"}`),
    c.cyan(`    cloudflared tunnel route dns ${TUNNEL_NAME || "proke"} ${host}`),
    "",
    `  Then put this in ${c.bold(".env.tunnel")} at the repo root:`,
    "",
    c.cyan(`    TUNNEL_NAME=${TUNNEL_NAME || "proke"}`),
    c.cyan(`    TUNNEL_API_HOSTNAME=${host}`),
    "",
    c.dim("  Leave those unset and this falls back to a throwaway quick tunnel."),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------

function report(base) {
  const backendEnv = readEnvFile(join(ROOT, "backend", ".env"));
  const slug = backendEnv.get("GH_APP_SLUG");
  const redirectUri = `${base}/slack/oauth/callback`;

  const rows = [
    ["GitHub App", slug ? `https://github.com/settings/apps/${slug}` : "https://github.com/settings/apps"],
    ["  Webhook URL", `${base}/webhooks/github`],
    [],
    ["Slack app", "https://api.slack.com/apps"],
    ["  OAuth & Permissions → Redirect URLs", redirectUri],
    ["  Event Subscriptions → Request URL", `${base}/webhooks/slack/events`],
  ];

  const width = 78;
  const line = "─".repeat(width);

  console.log("");
  console.log(c.dim(line));
  console.log(
    `  ${c.bold("proke tunnel")}  ${named ? c.green("named · permanent") : c.yellow("quick · new every restart")}`,
  );
  console.log(`  ${c.cyan(base)}  ${c.dim(`→ localhost:${BACKEND_PORT}`)}`);
  if (APP_HOSTNAME) {
    console.log(`  ${c.cyan(`https://${APP_HOSTNAME}`)}  ${c.dim(`→ localhost:${FRONTEND_PORT}`)}`);
  }
  console.log(c.dim(line));
  console.log("");

  for (const [label, value] of rows) {
    if (!label) {
      console.log("");
      continue;
    }

    console.log(`  ${label.padEnd(40)}${value ? c.cyan(value) : ""}`);
  }

  console.log("");
  console.log(c.dim("  " + "─".repeat(width - 2)));
  console.log("");

  // backend/.env has to agree with what Slack is pointed at, so it is synced rather than
  // printed and forgotten. --no-write turns this off.
  if (WRITE) {
    const result = writeEnvKey(join(ROOT, "backend", ".env"), "SLACK_REDIRECT_URI", redirectUri);
    const note = {
      updated: c.green("backend/.env → SLACK_REDIRECT_URI updated"),
      added: c.green("backend/.env → SLACK_REDIRECT_URI added"),
      unchanged: c.dim("backend/.env already agrees"),
      missing: c.yellow("backend/.env does not exist yet - copy .env.example to it"),
    }[result];

    console.log(`  ${note}`);

    // nest --watch only watches src/, so a changed .env sits in the file while the running
    // process keeps the old value - and Slack rejects an exchange whose redirect_uri does not
    // match the one it was sent. Named tunnels never hit this: the hostname does not move.
    if (result === "updated" || result === "added") {
      console.log(
        `  ${c.yellow("Restart the backend pane to load it - nest --watch ignores .env.")}`,
      );
    }
  } else {
    console.log(`  ${c.dim("backend/.env")}  SLACK_REDIRECT_URI=${c.cyan(redirectUri)}`);
  }

  if (!backendEnv.get("SLACK_CLIENT_ID") || !backendEnv.get("SLACK_CLIENT_SECRET")) {
    console.log(`  ${c.yellow("SLACK_CLIENT_ID / SLACK_CLIENT_SECRET are still empty")}`);
  }

  // A tunnel to a port nothing is listening on answers 502, which reads like a broken tunnel
  // rather than a backend that has not booted yet. Worth naming.
  void listening(BACKEND_PORT).then((up) => {
    if (!up) {
      console.log(
        `  ${c.yellow(`Nothing is listening on ${BACKEND_PORT} yet - until the backend boots, this URL answers 502.`)}`,
      );
    }
  });

  if (named) {
    console.log(`  ${c.dim("Permanent - the two web-UI fields above only need pasting once.")}`);
  } else {
    console.log(`  ${c.yellow("Quick tunnel: this host dies with the process.")}`);
    console.log(
      `  ${c.dim("Run `node scripts/tunnels.mjs` with TUNNEL_NAME set for a permanent one.")}`,
    );
  }

  console.log("");
}
