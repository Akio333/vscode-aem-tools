const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

// Clean out and browser directories
try {
  fs.rmSync(path.join(__dirname, 'out'), { recursive: true, force: true });
  fs.rmSync(path.join(__dirname, 'browser'), { recursive: true, force: true });
} catch (e) {
  // Ignore
}

const clientConfig = {
  entryPoints: ['client/src/extension.ts'],
  bundle: true,
  outfile: 'out/client/src/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !minify,
  minify: minify,
  define: {
    'import.meta.url': 'importMetaUrl',
  },
  banner: {
    js: 'const importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
};

const serverConfig = {
  entryPoints: ['server/src/server.ts'],
  bundle: true,
  outfile: 'out/server/src/server.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  conditions: ['node', 'require'],
  alias: {
    'css-tree': path.resolve(__dirname, 'node_modules/css-tree/cjs/index.cjs'),
  },
  sourcemap: !minify,
  minify: minify,
  define: {
    'import.meta.url': 'importMetaUrl',
  },
  banner: {
    js: 'const importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
};

function copyAemSyncData() {
  try {
    const src = path.join(__dirname, 'node_modules', 'aemsync', 'data');
    const dest = path.join(__dirname, 'out', 'client', 'data');
    fs.cpSync(src, dest, { recursive: true });
    console.log('Copied aemsync data to out/client/data');
  } catch (err) {
    console.error('Failed to copy aemsync data:', err);
  }
}

function copyJsdomAssets() {
  try {
    // 1. Copy default-stylesheet.css
    const srcCss = path.join(__dirname, 'node_modules', 'jsdom', 'lib', 'jsdom', 'browser', 'default-stylesheet.css');
    const destCssDir = path.join(__dirname, 'browser');
    fs.mkdirSync(destCssDir, { recursive: true });
    fs.copyFileSync(srcCss, path.join(destCssDir, 'default-stylesheet.css'));
    console.log('Copied jsdom default-stylesheet.css to browser/default-stylesheet.css');

    // 2. Copy xhr-sync-worker.js
    const srcXhr = path.join(__dirname, 'node_modules', 'jsdom', 'lib', 'jsdom', 'living', 'xhr', 'xhr-sync-worker.js');
    const destXhrDir = path.join(__dirname, 'out', 'server', 'src');
    fs.mkdirSync(destXhrDir, { recursive: true });
    fs.copyFileSync(srcXhr, path.join(destXhrDir, 'xhr-sync-worker.js'));
    console.log('Copied jsdom xhr-sync-worker.js to out/server/src/xhr-sync-worker.js');

    // 3. Copy htlengine template files
    const htlTemplates = ['JSCodeTemplate.js', 'JSPureTemplate.js', 'JSRuntimeTemplate.js'];
    const htlSrcDir = path.join(__dirname, 'node_modules', '@adobe', 'htlengine', 'src', 'compiler');
    for (const file of htlTemplates) {
      fs.copyFileSync(path.join(htlSrcDir, file), path.join(destXhrDir, file));
    }
    console.log('Copied htlengine template files to out/server/src/');
  } catch (err) {
    console.error('Failed to copy assets:', err);
  }
}

async function run() {
  if (watch) {
    const clientCtx = await esbuild.context(clientConfig);
    const serverCtx = await esbuild.context(serverConfig);
    await clientCtx.watch();
    await serverCtx.watch();
    copyAemSyncData();
    copyJsdomAssets();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(clientConfig);
    await esbuild.build(serverConfig);
    copyAemSyncData();
    copyJsdomAssets();
    console.log('Build complete.');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
