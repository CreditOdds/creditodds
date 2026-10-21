const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Keep old source filenames for existing links, but publish catalog art at
// immutable content-addressed filenames so Next's optimizer sees a new URL.
function versionCardImage(filename, sourceDir, outputDir) {
  if (!filename) return filename;
  if (path.basename(filename) !== filename) throw new Error(`Invalid card image filename: ${filename}`);
  const source = path.join(sourceDir, filename);
  if (!fs.existsSync(source)) return filename; // Legacy CDN-only art.
  const bytes = fs.readFileSync(source);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const ext = path.extname(filename);
  const versioned = `${path.basename(filename, ext)}.${hash}${ext}`;
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, versioned), bytes);
  return versioned;
}
module.exports = { versionCardImage };
