/**
 * First-run onboarding — creates ITS_ME.md if it doesn't exist.
 * Prompts the user for their name, role, and optionally configures
 * communication channels (Telegram, Slack, Discord).
 * Also checks for Docker and offers to install it + pull scanner images.
 */

import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { platform } from "os";
import readline from "readline";
import { USER_DATA_DIR } from "./config.js";
import { saveChannelCredentials, loadChannelConfig } from "./channels/channelConfig.js";

const ITS_ME_PATH = join(USER_DATA_DIR, "ITS_ME.md");

// ── Docker helpers ──────────────────────────────────────────────────────────

function isDockerInstalled(): boolean {
  try {
    execSync("docker --version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function isDockerRunning(): boolean {
  try {
    execSync("docker info", { stdio: "pipe", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function getDockerInstallCmd(): { cmd: string; label: string } | null {
  const os = platform();
  if (os === "win32") {
    return { cmd: "winget install -e --id Docker.DockerDesktop", label: "winget (Docker Desktop)" };
  }
  if (os === "darwin") {
    return { cmd: "brew install --cask docker", label: "Homebrew (Docker Desktop)" };
  }
  if (os === "linux") {
    return { cmd: "curl -fsSL https://get.docker.com | sh", label: "get.docker.com (Docker Engine)" };
  }
  return null;
}

async function checkAndInstallDocker(
  ask: (q: string) => Promise<string>
): Promise<void> {
  console.log("  ── Dependencies: Docker ──\n");

  if (isDockerInstalled()) {
    console.log("  ✓ Docker is installed.");
    if (isDockerRunning()) {
      console.log("  ✓ Docker daemon is running.\n");
    } else {
      console.log("  ⚠ Docker daemon is NOT running.");
      console.log("  Start Docker to use security scanners and integrations.\n");
    }
    return;
  }

  console.log("  ✗ Docker not found on this system.\n");
  console.log("  Docker is needed for security scanning integrations");
  console.log("  (Gitleaks, Semgrep, Trivy, SonarQube).\n");
  console.log("  You can enable/disable individual tools later from the Dashboard.\n");

  const installInfo = getDockerInstallCmd();

  if (installInfo) {
    const doInstall = await ask(`  Install Docker via ${installInfo.label}? (y/N): `);
    if (doInstall.toLowerCase() === "y" || doInstall.toLowerCase() === "yes") {
      console.log(`\n  Running: ${installInfo.cmd}\n`);
      try {
        execSync(installInfo.cmd, { stdio: "inherit", timeout: 300000 });
        console.log("\n  ✓ Docker installed successfully!");
        if (platform() !== "linux") {
          console.log("  Note: Start Docker Desktop and restart your terminal before using scanners.\n");
        } else {
          console.log("");
        }
      } catch {
        console.log(`\n  ✗ Installation failed. You may need admin/sudo privileges.`);
        console.log(`  Try running manually: ${installInfo.cmd}\n`);
      }
    } else {
      console.log("  Skipped. Install Docker anytime — scanners are optional.\n");
    }
  } else {
    console.log("  Install Docker manually: https://docs.docker.com/get-docker/\n");
  }
}

// ── Main onboarding ─────────────────────────────────────────────────────────

export async function runOnboardingIfNeeded(): Promise<void> {
  if (existsSync(ITS_ME_PATH)) return;

  console.log("");
  console.log("  ╔══════════════════════════════════════════════╗");
  console.log("  ║        Welcome to OCTO VEC!                  ║");
  console.log("  ║        Let's get you set up.                 ║");
  console.log("  ╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Your data will be stored at: ${USER_DATA_DIR}`);
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));

  // ── Pre-step: Docker check ─────────────────────────────────────────────
  await checkAndInstallDocker(ask);

  // ── Step 1: Profile ─────────────────────────────────────────────────────
  console.log("  ── Step 1: Your Profile ──\n");
  const name = (await ask("  Your name (press Enter for 'User'): ")) || "User";
  const role = (await ask("  Your role (press Enter for 'Founder & CEO'): ")) || "Founder & CEO";

  const content = `**Name:** ${name}\n**Role:** ${role}\n`;
  writeFileSync(ITS_ME_PATH, content, "utf-8");
  console.log(`\n  Profile saved. Your agents will call you "${name}".\n`);

  // ── Step 2: Integrations (optional) ─────────────────────────────────────
  console.log("  ── Step 2: Communication Channels (optional) ──\n");
  console.log("  OCTO VEC can connect to messaging platforms so you can");
  console.log("  talk to your agents from Telegram, Slack, or Discord.\n");
  console.log("  You can skip this now and configure later from the Dashboard.\n");

  const setupChannels = await ask("  Configure channels now? (y/N): ");

  if (setupChannels.toLowerCase() === "y" || setupChannels.toLowerCase() === "yes") {
    // ── Telegram ──
    console.log("\n  ── Telegram ──");
    console.log("  Needs: Bot Token (from @BotFather) + Chat ID\n");
    const setupTg = await ask("  Set up Telegram? (y/N): ");
    if (setupTg.toLowerCase() === "y" || setupTg.toLowerCase() === "yes") {
      const tgToken = await ask("  Bot Token: ");
      const tgChatId = await ask("  Chat ID: ");
      if (tgToken && tgChatId) {
        saveChannelCredentials("telegram", { botToken: tgToken, chatId: tgChatId });
        console.log("  Telegram configured.\n");
      } else {
        console.log("  Skipped (missing values).\n");
      }
    }

    // ── Slack ──
    console.log("  ── Slack ──");
    console.log("  Needs: Bot Token (xoxb-...), App Token (xapp-...), Channel ID\n");
    const setupSlack = await ask("  Set up Slack? (y/N): ");
    if (setupSlack.toLowerCase() === "y" || setupSlack.toLowerCase() === "yes") {
      const slackBot = await ask("  Bot Token (xoxb-...): ");
      const slackApp = await ask("  App Token (xapp-...): ");
      const slackCh = await ask("  Channel ID: ");
      if (slackBot && slackApp && slackCh) {
        saveChannelCredentials("slack", { botToken: slackBot, appToken: slackApp, channelId: slackCh });
        console.log("  Slack configured.\n");
      } else {
        console.log("  Skipped (missing values).\n");
      }
    }

    // ── Discord ──
    console.log("  ── Discord ──");
    console.log("  Needs: Bot Token (from Developer Portal) + Channel ID\n");
    const setupDiscord = await ask("  Set up Discord? (y/N): ");
    if (setupDiscord.toLowerCase() === "y" || setupDiscord.toLowerCase() === "yes") {
      const dcToken = await ask("  Bot Token: ");
      const dcChannel = await ask("  Channel ID: ");
      if (dcToken && dcChannel) {
        saveChannelCredentials("discord", { botToken: dcToken, channelId: dcChannel });
        console.log("  Discord configured.\n");
      } else {
        console.log("  Skipped (missing values).\n");
      }
    }
  } else {
    console.log("  Skipped. You can configure channels anytime from the Dashboard Settings.\n");
  }

  // ── Done ────────────────────────────────────────────────────────────────
  const cfg = loadChannelConfig();
  const activeChannels = [
    cfg.telegram ? "Telegram" : null,
    cfg.slack ? "Slack" : null,
    cfg.discord ? "Discord" : null,
  ].filter(Boolean);

  console.log("  ── Setup Complete ──\n");
  console.log(`  Profile  : ${name} (${role})`);
  console.log(`  Data Dir : ${USER_DATA_DIR}`);
  console.log(`  Channels : ${activeChannels.length ? activeChannels.join(", ") : "None (CLI + Dashboard only)"}`);
  console.log("");
  console.log("  Tip: Open the Dashboard at http://localhost:3000 to manage everything visually.");
  console.log("");

  rl.close();
}
