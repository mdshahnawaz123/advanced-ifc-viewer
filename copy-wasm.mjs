import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');
const wasmSource = join(__dirname, 'node_modules', 'web-ifc', 'web-ifc.wasm');

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

if (existsSync(wasmSource)) {
  copyFileSync(wasmSource, join(publicDir, 'web-ifc.wasm'));
  console.log('✅ Copied web-ifc.wasm to public/');
} else {
  console.warn('⚠️ web-ifc.wasm not found. Run npm install first.');
}
