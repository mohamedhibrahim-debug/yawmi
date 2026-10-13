// Assembles dist-artifact/ into one self-contained HTML page for a hosted preview.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = 'dist-artifact';
const assets = readdirSync(`${dir}/assets`);
const css = readFileSync(`${dir}/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8');
const js = readFileSync(`${dir}/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8');
if (js.includes('</script')) throw new Error('bundle contains </script; cannot inline safely');
const icon = `data:image/svg+xml;base64,${Buffer.from(readFileSync('public/icon.svg')).toString('base64')}`;

const page = `<title>Yawmi MVP</title>
<meta name="theme-color" content="#28574a">
<link rel="icon" href="${icon}">
<style>${css}</style>
<div id="app" dir="rtl" lang="ar"></div>
<noscript>يومي محتاج JavaScript عشان يشتغل.</noscript>
<script type="module">${js}</script>
`;
writeFileSync(`${dir}/yawmi-mvp.html`, page);
console.log(`wrote ${dir}/yawmi-mvp.html (${Math.round(page.length / 1024)} KB)`);
