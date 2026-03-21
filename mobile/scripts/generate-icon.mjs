/**
 * Generate OCTO VEC app icon — modern, premium design.
 * Black background, thin elegant "OV" with subtle accent ring.
 */

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const SIZES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const RES_DIR = join(import.meta.dirname, "..", "android", "app", "src", "main", "res");

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  // ── Black background ───────────────────────────────────────────────────
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, s, s);

  // ── Subtle accent circle ring ──────────────────────────────────────────
  const ringR = s * 0.38;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(123, 142, 248, 0.35)";
  ctx.lineWidth = s * 0.008;
  ctx.stroke();

  // ── Inner thin ring ────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, ringR - s * 0.03, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(123, 142, 248, 0.15)";
  ctx.lineWidth = s * 0.004;
  ctx.stroke();

  // ── Subtle glow behind text ────────────────────────────────────────────
  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.25);
  glowGrad.addColorStop(0, "rgba(123, 142, 248, 0.08)");
  glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  // ── "O" — draw manually as a thin elegant circle letter ────────────────
  const letterH = s * 0.22;
  const oX = cx - s * 0.09;
  const oY = cy;
  const oRx = letterH * 0.38;
  const oRy = letterH * 0.5;

  ctx.beginPath();
  ctx.ellipse(oX, oY, oRx, oRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = s * 0.02;
  ctx.stroke();

  // ── "V" — draw manually as thin elegant V ──────────────────────────────
  const vX = cx + s * 0.1;
  const vTop = cy - letterH * 0.5;
  const vBottom = cy + letterH * 0.5;
  const vHalfW = letterH * 0.32;

  ctx.beginPath();
  ctx.moveTo(vX - vHalfW, vTop);
  ctx.lineTo(vX, vBottom);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = s * 0.02;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(vX + vHalfW, vTop);
  ctx.lineTo(vX, vBottom);
  ctx.stroke();

  return canvas;
}

function drawRoundIcon(size) {
  const source = drawIcon(size);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(source, 0, 0);
  return canvas;
}

for (const [folder, size] of Object.entries(SIZES)) {
  const dir = join(RES_DIR, folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ic_launcher.png"), drawIcon(size).toBuffer("image/png"));
  writeFileSync(join(dir, "ic_launcher_round.png"), drawRoundIcon(size).toBuffer("image/png"));
  console.log(`  ${folder} (${size}x${size})`);
}

const bigIcon = drawIcon(1024);
writeFileSync(join(import.meta.dirname, "..", "icon-1024.png"), bigIcon.toBuffer("image/png"));
console.log("  icon-1024.png (1024x1024)\nDone!");
