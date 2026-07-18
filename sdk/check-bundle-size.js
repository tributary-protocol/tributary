import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const filesToCheck = [
  {
    path: 'dist/index.js',
    rawLimit: 10 * 1024,   // 10 KB
    gzipLimit: 4 * 1024,  // 4 KB
  },
  {
    path: 'dist/retry.js',
    rawLimit: 5 * 1024,    // 5 KB
    gzipLimit: 2 * 1024,   // 2 KB
  }
];

let failed = false;

console.log('----------------------------------------------------------------------');
console.log('SDK Bundle Size Report:');
console.log('----------------------------------------------------------------------');
console.log(
  sprintf('%-20s %-12s %-12s %-12s %-12s Status', 'File', 'Size (Raw)', 'Limit (Raw)', 'Size (Gzip)', 'Limit (Gzip)')
);
console.log('----------------------------------------------------------------------');

function sprintf(format, ...args) {
  let index = 0;
  return format.replace(/%(-?\d+)?s/g, (match, width) => {
    let val = String(args[index++]);
    if (width) {
      const absWidth = Math.abs(parseInt(width));
      const pad = ' '.repeat(Math.max(0, absWidth - val.length));
      if (width.startsWith('-')) {
        val = val + pad;
      } else {
        val = pad + val;
      }
    }
    return val;
  });
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

for (const fileSpec of filesToCheck) {
  const filePath = path.resolve(__dirname, fileSpec.path);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(filePath);
  const rawSize = content.length;
  const gzipSize = zlib.gzipSync(content).length;

  const rawPass = rawSize <= fileSpec.rawLimit;
  const gzipPass = gzipSize <= fileSpec.gzipLimit;
  const pass = rawPass && gzipPass;

  console.log(
    sprintf(
      '%-20s %-12s %-12s %-12s %-12s %s',
      fileSpec.path,
      formatBytes(rawSize),
      formatBytes(fileSpec.rawLimit),
      formatBytes(gzipSize),
      formatBytes(fileSpec.gzipLimit),
      pass ? 'PASS' : 'FAIL'
    )
  );

  if (!rawPass) {
    console.error(`❌ FAIL: ${fileSpec.path} raw size exceeds limit of ${formatBytes(fileSpec.rawLimit)}`);
    failed = true;
  }
  if (!gzipPass) {
    console.error(`❌ FAIL: ${fileSpec.path} gzip size exceeds limit of ${formatBytes(fileSpec.gzipLimit)}`);
    failed = true;
  }
}

console.log('----------------------------------------------------------------------');

if (failed) {
  console.error('❌ SDK bundle size check failed.');
  process.exit(1);
} else {
  console.log('✅ SDK bundle size check passed.');
  process.exit(0);
}
