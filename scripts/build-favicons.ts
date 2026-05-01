/**
 * Build favicon.ico + apple-touch-icon.png + og-image.png from SVG sources.
 * Run: bun run scripts/build-favicons.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const PUBLIC = 'apps/studio/public';

async function rasterize(svgPath: string, width: number): Promise<Uint8Array> {
  const svg = await readFile(svgPath, 'utf-8');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  return new Uint8Array(resvg.render().asPng());
}

/**
 * Build a single-image .ico from a 32×32 PNG buffer.
 * ICO format: 6-byte header + 16-byte directory + image data.
 */
function pngToIco(png32: Uint8Array): Uint8Array {
  const ICO_HEADER = 6;
  const ICO_DIR = 16;
  const total = ICO_HEADER + ICO_DIR + png32.length;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);

  // Header: reserved(2)=0, type(2)=1, count(2)=1
  dv.setUint16(0, 0, true);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, 1, true);

  // Directory entry (offset 6, length 16)
  buf[6] = 32; // width  (0 = 256)
  buf[7] = 32; // height (0 = 256)
  buf[8] = 0;  // colorCount (0 for >=256 colors)
  buf[9] = 0;  // reserved
  dv.setUint16(10, 1, true);  // planes
  dv.setUint16(12, 32, true); // bitCount
  dv.setUint32(14, png32.length, true);    // size of image data
  dv.setUint32(18, ICO_HEADER + ICO_DIR, true); // offset to image data

  // Image data
  buf.set(png32, ICO_HEADER + ICO_DIR);
  return buf;
}

async function main() {
  console.log('rendering favicon.svg → 32×32 PNG');
  const png32 = await rasterize(`${PUBLIC}/favicon.svg`, 32);
  await writeFile(`${PUBLIC}/favicon-32.png`, png32);

  console.log('packing PNG → favicon.ico');
  const ico = pngToIco(png32);
  await writeFile(`${PUBLIC}/favicon.ico`, ico);

  console.log('rendering apple-touch-icon.svg → 180×180 PNG');
  const apple180 = await rasterize(`${PUBLIC}/apple-touch-icon.svg`, 180);
  await writeFile(`${PUBLIC}/apple-touch-icon.png`, apple180);

  console.log('rendering apple-touch-icon.svg → 1024×1024 PNG (for stores)');
  const app1024 = await rasterize(`${PUBLIC}/apple-touch-icon.svg`, 1024);
  await writeFile(`${PUBLIC}/app-icon-1024.png`, app1024);

  console.log('rendering logo.svg → 192×192 + 512×512 (PWA manifest sizes)');
  const png192 = await rasterize(`${PUBLIC}/logo.svg`, 192);
  await writeFile(`${PUBLIC}/logo-192.png`, png192);
  const png512 = await rasterize(`${PUBLIC}/logo.svg`, 512);
  await writeFile(`${PUBLIC}/logo-512.png`, png512);

  console.log('done. files in', PUBLIC);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
