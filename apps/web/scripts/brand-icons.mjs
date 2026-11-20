#!/usr/bin/env node
/**
 * Ícone do Dama — fonte única. Uma geometria (a peça de latão com a coroa da dama gravada, sobre
 * obsidiana) gera tudo o que mostra a marca:
 *
 *   Android  res/drawable/ic_launcher_{background,foreground,monochrome}.xml  (vetores, API 26+)
 *            res/mipmap-anydpi-v26/ic_launcher{,_round}.xml                   (ícone adaptativo)
 *            res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher{,_round}.png         (Android 7, API 24–25)
 *   Web      public/favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
 *
 * A tela de abertura do Android usa o mesmo vetor da frente (styles.xml). Rode depois de mudar a
 * geometria abaixo:  npm run icons -w @dama/web
 *
 * Coordenadas no quadro de 108×108 do ícone adaptativo: o círculo central de raio 33 sempre
 * aparece, qualquer que seja a máscara do aparelho; a peça (raio 27 + sombra) cabe nele.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'android/app/src/main/res');
const PUBLIC = join(ROOT, 'public');
const GENERATED = 'Gerado por apps/web/scripts/brand-icons.mjs — não edite à mão.';

// ── Geometria ──────────────────────────────────────────────────────────────────────────────

const circle = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
const radial = (cx, cy, r, stops) => ({ cx, cy, r, stops });

const OBSIDIAN = '#0A0A0B';
const INK = '#3B2709';
const LIGHT = '#FFF0C8';

/** A coroa da dama, centrada em (54, 53 + dy). */
function crown(dy = 0) {
  const y = (v) => +(v + dy).toFixed(2);
  return [
    `M44,${y(58.5)}L42.5,${y(48.5)}L48.5,${y(53)}L54,${y(46)}L59.5,${y(53)}L65.5,${y(48.5)}L64,${y(58.5)}Z`,
    circle(42.5, y(47.7), 1.7),
    circle(54, y(45.1), 1.9),
    circle(65.5, y(47.7), 1.7),
    `M45.3,${y(60)}h17.4a1.3,1.3 0 0 1 0,2.6h-17.4a1.3,1.3 0 0 1 0,-2.6Z`,
  ].join('');
}

const BACKGROUND = [
  { d: 'M0,0h108v108h-108Z', fill: OBSIDIAN },
  // Luz quente vinda de cima, como na interface: o latão parece aceso, não chapado.
  {
    d: 'M0,0h108v108h-108Z',
    fill: radial(54, 44, 62, [
      [0, '#D6A955', 0.2],
      [0.5, '#D6A955', 0.06],
      [1, '#D6A955', 0],
    ]),
  },
];

const FOREGROUND = [
  // Sombra no tabuleiro.
  {
    d: circle(54, 58.5, 31),
    fill: radial(54, 58.5, 31, [
      [0, '#000000', 0.6],
      [0.8, '#000000', 0.42],
      [1, '#000000', 0],
    ]),
  },
  // Espessura da peça (a borda que aparece abaixo da face).
  { d: circle(54, 56.4, 27), fill: '#7A5520' },
  // Face de latão, iluminada do alto à esquerda.
  {
    d: circle(54, 53, 27),
    fill: radial(45, 43, 40, [
      [0, '#F6D58E', 1],
      [0.45, '#DDB060', 1],
      [1, '#A27530', 1],
    ]),
  },
  // Fio de luz na borda da face.
  { d: circle(54, 53, 26.4), stroke: [LIGHT, 0.32, 0.9] },
  // Sulco gravado: luz embaixo, sombra em cima — lê como entalhe, não como linha desenhada.
  { d: circle(54, 53.7, 20.5), stroke: [LIGHT, 0.42, 1] },
  { d: circle(54, 53, 20.5), stroke: ['#5E4013', 0.62, 1.5] },
  // A coroa da dama, gravada do mesmo jeito.
  { d: crown(0.6), fill: [LIGHT, 0.38] },
  { d: crown(), fill: INK },
];

/** Android 13+: o sistema pinta esta camada com a cor do tema. Contorno da peça + coroa. */
const MONOCHROME = [
  { d: circle(54, 54, 26), stroke: ['#FFFFFF', 1, 3.2] },
  { d: crown(1), fill: '#FFFFFF' },
];

// ── Saída: VectorDrawable (Android) ───────────────────────────────────────────────────────────

const argb = (hex, alpha = 1) =>
  `#${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}${hex.slice(1).toUpperCase()}`;

function vectorPath(shape) {
  const lines = [`    <path android:pathData="${shape.d}"`];
  let gradient = '';
  if (shape.stroke) {
    const [hex, alpha, width] = shape.stroke;
    lines.push(
      `        android:fillColor="#00000000"`,
      `        android:strokeColor="${argb(hex, alpha)}"`,
      `        android:strokeWidth="${width}"`,
    );
  } else if (typeof shape.fill === 'string') {
    lines.push(`        android:fillColor="${shape.fill}"`);
  } else if (Array.isArray(shape.fill)) {
    lines.push(`        android:fillColor="${argb(shape.fill[0], shape.fill[1])}"`);
  } else {
    const g = shape.fill;
    gradient = [
      '        <aapt:attr name="android:fillColor">',
      `            <gradient android:type="radial" android:centerX="${g.cx}" android:centerY="${g.cy}" android:gradientRadius="${g.r}">`,
      ...g.stops.map(
        ([offset, hex, alpha]) =>
          `                <item android:offset="${offset}" android:color="${argb(hex, alpha)}" />`,
      ),
      '            </gradient>',
      '        </aapt:attr>',
    ].join('\n');
  }
  return gradient ? `${lines.join('\n')}>\n${gradient}\n    </path>` : `${lines.join('\n')} />`;
}

const vector = (shapes) =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<!-- ${GENERATED} -->`,
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    xmlns:aapt="http://schemas.android.com/aapt"',
    '    android:width="108dp" android:height="108dp"',
    '    android:viewportWidth="108" android:viewportHeight="108">',
    ...shapes.map(vectorPath),
    '</vector>',
    '',
  ].join('\n');

const adaptive = [
  '<?xml version="1.0" encoding="utf-8"?>',
  `<!-- ${GENERATED} -->`,
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
  '    <background android:drawable="@drawable/ic_launcher_background" />',
  '    <foreground android:drawable="@drawable/ic_launcher_foreground" />',
  '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />',
  '</adaptive-icon>',
  '',
].join('\n');

// ── Saída: SVG (web e PNGs) ───────────────────────────────────────────────────────────────────

/**
 * O ícone composto (fundo + peça) recortado em `view` = [x, y, lado] do quadro 108, com máscara
 * opcional: `square` (cantos arredondados) ou `round`.
 */
function svg({ view, mask = 'none', title = true }) {
  const [x, y, size] = view;
  const defs = [];
  const body = [...BACKGROUND, ...FOREGROUND].map((shape, i) => {
    if (shape.stroke) {
      const [hex, alpha, width] = shape.stroke;
      return `<path d="${shape.d}" fill="none" stroke="${hex}" stroke-opacity="${alpha}" stroke-width="${width}"/>`;
    }
    if (typeof shape.fill === 'string') return `<path d="${shape.d}" fill="${shape.fill}"/>`;
    if (Array.isArray(shape.fill)) {
      return `<path d="${shape.d}" fill="${shape.fill[0]}" fill-opacity="${shape.fill[1]}"/>`;
    }
    const g = shape.fill;
    defs.push(
      `<radialGradient id="g${i}" gradientUnits="userSpaceOnUse" cx="${g.cx}" cy="${g.cy}" r="${g.r}">${g.stops
        .map(([o, hex, a]) => `<stop offset="${o}" stop-color="${hex}" stop-opacity="${a}"/>`)
        .join('')}</radialGradient>`,
    );
    return `<path d="${shape.d}" fill="url(#g${i})"/>`;
  });
  let open = '';
  let close = '';
  if (mask !== 'none') {
    const shape =
      mask === 'round'
        ? `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}"/>`
        : `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}"/>`;
    defs.push(`<clipPath id="m">${shape}</clipPath>`);
    open = '<g clip-path="url(#m)">';
    close = '</g>';
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${size} ${size}">`,
    title ? '<title>Dama</title>' : '',
    `<defs>${defs.join('')}</defs>`,
    open,
    ...body,
    close,
    '</svg>',
  ].join('');
}

// O que cada máscara de launcher mostra do quadro 108 (a área visível do ícone adaptativo).
const LAUNCHER_VIEW = [18, 18, 72, 72];
// "maskable" da web: tudo dentro do círculo de 80% — a peça com folga.
const MASKABLE_VIEW = [9, 9, 90, 90];
// iOS recorta os cantos sozinho; quadro cheio, peça um pouco maior.
const APPLE_VIEW = [14, 14, 80, 80];

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

async function main() {
  const write = async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    console.log('  ', path.slice(ROOT.length + 1));
  };

  // Vetores do Android.
  await write(join(RES, 'drawable/ic_launcher_background.xml'), vector(BACKGROUND));
  await write(join(RES, 'drawable/ic_launcher_foreground.xml'), vector(FOREGROUND));
  await write(join(RES, 'drawable/ic_launcher_monochrome.xml'), vector(MONOCHROME));
  await write(join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
  await write(join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);
  // Restos do modelo do Capacitor que este ícone substitui.
  await rm(join(RES, 'drawable-v24/ic_launcher_foreground.xml'), { force: true });
  await rm(join(RES, 'values/ic_launcher_background.xml'), { force: true });
  for (const density of Object.keys(DENSITIES)) {
    await rm(join(RES, `mipmap-${density}/ic_launcher_foreground.png`), { force: true });
  }

  await write(join(PUBLIC, 'favicon.svg'), `${svg({ view: LAUNCHER_VIEW, mask: 'square' })}\n`);

  // PNGs: o mesmo SVG rasterizado pelo Chromium do Playwright (já usado pelos testes E2E).
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const png = async (path, size, markup) => {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<html><body style="margin:0;background:transparent">${markup.replace(
          '<svg ',
          `<svg width="${size}" height="${size}" style="display:block" `,
        )}</body></html>`,
      );
      await mkdir(dirname(path), { recursive: true });
      await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      console.log('  ', path.slice(ROOT.length + 1));
    };

    for (const [density, size] of Object.entries(DENSITIES)) {
      await png(
        join(RES, `mipmap-${density}/ic_launcher.png`),
        size,
        svg({ view: LAUNCHER_VIEW, mask: 'square' }),
      );
      await png(
        join(RES, `mipmap-${density}/ic_launcher_round.png`),
        size,
        svg({ view: LAUNCHER_VIEW, mask: 'round' }),
      );
    }
    await png(join(PUBLIC, 'icon-192.png'), 192, svg({ view: MASKABLE_VIEW }));
    await png(join(PUBLIC, 'icon-512.png'), 512, svg({ view: MASKABLE_VIEW }));
    await png(join(PUBLIC, 'apple-touch-icon.png'), 180, svg({ view: APPLE_VIEW }));
  } finally {
    await browser.close();
  }
}

await main();
