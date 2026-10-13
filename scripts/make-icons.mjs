// Renders every app icon and the iOS launch screen from public/logo.svg.
//   web:  public/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
//   iOS:  AppIcon 1024 (square, opaque) and the 2732² launch images
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const logo = readFileSync('public/logo.svg', 'utf8');
const square = logo.replace(/rx="\d+"/, 'rx="0"'); // iOS and maskable icons must be full-bleed and opaque
const inner = logo.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();

writeFileSync('public/icon.svg', logo);
writeFileSync('public/icon-192.png', png(logo, 192));
writeFileSync('public/icon-512.png', png(logo, 512));
writeFileSync('public/icon-maskable-512.png', png(square, 512));

const iosIcon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
if (existsSync(iosIcon)) {
  writeFileSync(iosIcon, new Resvg(square, { fitTo: { mode: 'width', value: 1024 }, background: '#28574a' }).render().asPng());
  // Launch screen: the logo centered on the app background.
  const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="#f2f4ef"/><g transform="translate(1066 1066) scale(1.171875)">${inner}</g></svg>`;
  const img = new Resvg(splash, { fitTo: { mode: 'width', value: 2732 } }).render().asPng();
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
    writeFileSync(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, img);
  console.log('icons written (web + iOS icon + launch screen)');
} else console.log('icons written (web only)');
