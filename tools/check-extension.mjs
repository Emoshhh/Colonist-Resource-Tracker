/**
 * Eklenti bütünlük denetimi.
 *
 * Testler çekirdeği kapsıyor ama `main.js` ve `ui/overlay.js` DOM'a bağlı
 * olduğu için hiçbir test onları yüklemiyor. Yani oradaki bir yazım hatası
 * ya da yanlış import yolu, tarayıcıda açana kadar fark edilmiyor.
 * Bu betik onu kapatır:
 *
 *   1. manifest.json geçerli JSON mu, andığı dosyalar var mı
 *   2. her .js dosyası sözdizimsel olarak geçerli mi
 *   3. her göreli import gerçek bir dosyaya çıkıyor mu
 *
 * Kullanım: npm run check
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');

const problems = [];
const fail = (msg) => problems.push(msg);
const rel = (p) => relative(ROOT, p);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(EXT);
const jsFiles = files.filter((f) => f.endsWith('.js'));

// 1) manifest -------------------------------------------------------------
const manifestPath = join(EXT, 'manifest.json');
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`manifest.json okunamadı: ${err.message}`);
}

if (manifest) {
  const referenced = [];
  for (const entry of manifest.content_scripts || []) {
    referenced.push(...(entry.js || []), ...(entry.css || []));
  }
  for (const ref of referenced) {
    if (!existsSync(join(EXT, ref))) fail(`manifest.json "${ref}" diyor ama dosya yok`);
  }
  if (!manifest.version) fail('manifest.json içinde version yok');
  if (manifest.manifest_version !== 3) fail('manifest_version 3 olmalı');

  // web_accessible_resources olmadan main.js dinamik import ile yüklenemez
  const war = JSON.stringify(manifest.web_accessible_resources || []);
  if (!war.includes('src/')) fail('web_accessible_resources src/ dosyalarını açmıyor');
}

// 2) sözdizimi ------------------------------------------------------------
for (const file of jsFiles) {
  try {
    // package.json "type":"module" olduğu için --check dosyayı modül olarak
    // ayrıştırır; import/export sözdizimi de denetlenmiş olur.
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    const detail = String(err.stderr || err.message).trim().split('\n').slice(0, 3).join(' ');
    fail(`${rel(file)}: sözdizimi hatası — ${detail}`);
  }
}

// 3) import yolları -------------------------------------------------------
const IMPORT_RE = /(?:^|\s)(?:import|export)[\s\S]*?from\s+['"](\.[^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

for (const file of jsFiles) {
  const source = readFileSync(file, 'utf8');
  for (const re of [IMPORT_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) {
      const target = resolve(dirname(file), m[1]);
      if (!existsSync(target)) fail(`${rel(file)}: "${m[1]}" diye bir dosya yok`);
    }
  }
}

// -------------------------------------------------------------------------
if (problems.length) {
  console.error(`✗ ${problems.length} sorun bulundu:\n`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`✓ eklenti bütün: ${jsFiles.length} js dosyası, manifest v${manifest.version}`);
