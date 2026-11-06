const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'app', 'src', 'main', 'assets', 'index.html');
const outDir = path.join(root, 'desktop-assets');
const vendorDir = path.join(outDir, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

let html = fs.readFileSync(source, 'utf8');
html = html.replace(
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'vendor/three.min.js'
).replace(
  'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js',
  'vendor/cannon.min.js'
);
fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

const threePath = require.resolve('three/build/three.min.js');
const cannonPath = require.resolve('cannon/build/cannon.min.js');
fs.copyFileSync(threePath, path.join(vendorDir, 'three.min.js'));
fs.copyFileSync(cannonPath, path.join(vendorDir, 'cannon.min.js'));
console.log('Prepared Sandbox Protocol desktop assets with local Three.js and Cannon.js.');
