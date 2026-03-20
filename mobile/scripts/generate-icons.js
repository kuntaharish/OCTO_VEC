// Generate OCTO VEC app icons as PNG files
// Uses pure Node.js to create simple but clean icons

const fs = require("fs");
const path = require("path");

// PNG encoder (minimal implementation for solid color + shapes)
function createPNG(size) {
  // We'll create an SVG and note that we need a proper tool
  // Instead, let's create the icon using Android's adaptive icon XML approach
  return null;
}

// Icon sizes for Android mipmap directories
const sizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

// Create adaptive icon XML (Android 8+)
const resDir = path.join(__dirname, "..", "android", "app", "src", "main", "res");

// Create ic_launcher_background.xml (solid black background)
const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#000000" />
</shape>`;

// Create ic_launcher_foreground.xml (white octagon with V)
const fgXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">

    <!-- Octagon outline -->
    <path
        android:pathData="M54,22 L72,28 L82,44 L82,64 L72,80 L54,86 L36,80 L26,64 L26,44 L36,28 Z"
        android:strokeWidth="2.5"
        android:strokeColor="#FFFFFF"
        android:fillColor="#00000000" />

    <!-- Letter O -->
    <path
        android:pathData="M40,47 C40,42.5 43.5,39 48,39 C52.5,39 56,42.5 56,47 C56,51.5 52.5,55 48,55 C43.5,55 40,51.5 40,47 Z"
        android:strokeWidth="2.2"
        android:strokeColor="#FFFFFF"
        android:fillColor="#00000000" />

    <!-- Letter V -->
    <path
        android:pathData="M56,39 L63,55 L70,39"
        android:strokeWidth="2.2"
        android:strokeColor="#FFFFFF"
        android:fillColor="#00000000"
        android:strokeLineCap="round"
        android:strokeLineJoin="round" />
</vector>`;

// Adaptive icon XML
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`;

// Write drawable files
const drawableDir = path.join(resDir, "drawable");
if (!fs.existsSync(drawableDir)) fs.mkdirSync(drawableDir, { recursive: true });
fs.writeFileSync(path.join(drawableDir, "ic_launcher_background.xml"), bgXml);
fs.writeFileSync(path.join(drawableDir, "ic_launcher_foreground.xml"), fgXml);

// Write adaptive icon definitions
const mipmapAnydpi = path.join(resDir, "mipmap-anydpi-v26");
if (!fs.existsSync(mipmapAnydpi)) fs.mkdirSync(mipmapAnydpi, { recursive: true });
fs.writeFileSync(path.join(mipmapAnydpi, "ic_launcher.xml"), adaptiveXml);
fs.writeFileSync(path.join(mipmapAnydpi, "ic_launcher_round.xml"), adaptiveXml);

console.log("✓ Adaptive icon XMLs created");
console.log("  - drawable/ic_launcher_background.xml (black)");
console.log("  - drawable/ic_launcher_foreground.xml (octagon + OV)");
console.log("  - mipmap-anydpi-v26/ic_launcher.xml");
console.log("  - mipmap-anydpi-v26/ic_launcher_round.xml");
