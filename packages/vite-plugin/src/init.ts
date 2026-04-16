/**
 * @pix2figma/vite-plugin CLI
 *
 * Usage:
 *   npx @pix2figma/vite-plugin init [--force] [--port 5173] [--name "My Plugin"]
 *
 * Scaffolds a figma-plugin/manifest.json that points to the installed
 * @pix2figma/figma-plugin dist files in node_modules.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ─── Helpers ──────────────────────────────────────────────────────────────

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** Try to detect the Vite dev server port from vite.config.{ts,js,mts,mjs} */
function detectVitePort(cwd: string): number | null {
  const candidates = [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
    'vite.config.mjs',
  ];

  for (const file of candidates) {
    const filePath = resolve(cwd, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    // Match patterns like: port: 1420 or port: 5173
    const match = content.match(/port\s*:\s*(\d+)/);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}

/** Derive a human-readable plugin name from the project name */
function derivePluginName(projectName: string): string {
  return projectName
    .replace(/^@[^/]+\//, '')           // strip npm scope
    .replace(/[-_]/g, ' ')              // dashes/underscores to spaces
    .replace(/\b\w/g, c => c.toUpperCase()) // title case
    + ' Screen Importer';
}

/** Derive a slug ID from the project name */
function derivePluginId(projectName: string): string {
  return projectName
    .replace(/^@[^/]+\//, '')           // strip npm scope
    .replace(/[^a-zA-Z0-9-]/g, '-')    // non-alphanumeric to dashes
    .replace(/-+/g, '-')               // collapse multiple dashes
    .replace(/^-|-$/g, '')             // trim leading/trailing
    .toLowerCase()
    + '-screen-importer';
}

/** Ensure a pattern is present in .gitignore, add it if missing */
function ensureGitignore(cwd: string, pattern: string): boolean {
  const gitignorePath = resolve(cwd, '.gitignore');

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    // Check if pattern already present (exact line match)
    const lines = content.split('\n').map(l => l.trim());
    if (lines.includes(pattern)) return false;
  }

  // Append with a trailing newline, preceded by newline if file exists and doesn't end with one
  const prefix = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8').endsWith('\n') ? '' : '\n'
    : '';
  appendFileSync(gitignorePath, `${prefix}${pattern}\n`);
  return true;
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (command !== 'init') {
  console.log(`
@pix2figma/vite-plugin CLI

Usage:
  npx @pix2figma/vite-plugin init [options]

Options:
  --force         Overwrite existing manifest.json
  --port <port>   Dev server port (auto-detected from vite.config)
  --name <name>   Plugin display name in Figma
  --dir <dir>     Output directory (default: figma-plugin)

Scaffolds a figma-plugin/manifest.json that references the installed
@pix2figma/figma-plugin package. Only the manifest stays in your project --
code.js and ui.html come from node_modules.
`);
  process.exit(command === undefined || command === '--help' || command === '-h' ? 0 : 1);
}

// Parse flags
let force = false;
let portOverride: number | null = null;
let nameOverride: string | null = null;
let dirOverride = 'figma-plugin';

for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case '--force':
    case '-f':
      force = true;
      break;
    case '--port':
    case '-p':
      portOverride = parseInt(args[++i], 10);
      break;
    case '--name':
    case '-n':
      nameOverride = args[++i];
      break;
    case '--dir':
    case '-d':
      dirOverride = args[++i];
      break;
  }
}

const cwd = process.cwd();
const outDir = resolve(cwd, dirOverride);
const manifestPath = join(outDir, 'manifest.json');

// Check if manifest already exists
if (existsSync(manifestPath) && !force) {
  console.log(`[pix2figma] ${dirOverride}/manifest.json already exists.`);
  console.log(`  Use --force to overwrite.`);
  process.exit(0);
}

// Detect project info
const pkg = readJson(resolve(cwd, 'package.json'));
const projectName = (pkg?.name as string) ?? 'my-app';

const pluginName = nameOverride ?? derivePluginName(projectName);
const pluginId = derivePluginId(projectName);
const port = portOverride ?? detectVitePort(cwd) ?? 5173;

// Compute relative path from output dir to node_modules
const relPrefix = dirOverride === '.'
  ? 'node_modules'
  : '../node_modules';

const manifest = {
  name: pluginName,
  id: pluginId,
  api: '1.0.0',
  main: `${relPrefix}/@pix2figma/figma-plugin/dist/code.js`,
  ui: `${relPrefix}/@pix2figma/figma-plugin/dist/ui.html`,
  editorType: ['figma'],
  networkAccess: {
    allowedDomains: ['none'],
    devAllowedDomains: [`http://localhost:${port}`],
  },
};

// Write
mkdirSync(outDir, { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Add to .gitignore
const gitignorePattern = dirOverride.endsWith('/') ? dirOverride : `${dirOverride}/`;
const addedToGitignore = ensureGitignore(cwd, gitignorePattern);

console.log(`[pix2figma] Created ${dirOverride}/manifest.json`);
if (addedToGitignore) {
  console.log(`[pix2figma] Added '${gitignorePattern}' to .gitignore`);
}
console.log();
console.log(`  Name:  ${pluginName}`);
console.log(`  Port:  ${port}`);
console.log(`  Main:  ${manifest.main}`);
console.log();
console.log(`Next steps:`);
console.log(`  1. In Figma: Plugins > Development > Import plugin from manifest`);
console.log(`  2. Point it to: ${manifestPath}`);
