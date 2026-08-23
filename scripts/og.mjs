// Renders the 1200×630 OG card to app/opengraph-image.png.
import sharp from "sharp";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="orb" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#3ba474"/>
      <stop offset="45%" stop-color="#1d5c3d"/>
      <stop offset="100%" stop-color="#0a2418"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#fbfaf5"/>
  <circle cx="955" cy="315" r="170" fill="url(#orb)"/>
  <circle cx="955" cy="315" r="196" fill="none" stroke="#c2a14d" stroke-width="3" opacity="0.8"/>
  <circle cx="895" cy="250" r="38" fill="#ffffff" opacity="0.28"/>
  <text x="90" y="305" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="110" letter-spacing="-3" fill="#131714">articulate<tspan fill="#c2a14d">.</tspan></text>
  <text x="94" y="375" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#123524">say more. with less.</text>
  <text x="94" y="480" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#6f7a72">voice-only training — conciseness · vocabulary · articulation · filler</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("app/opengraph-image.png");
console.log("wrote app/opengraph-image.png");
