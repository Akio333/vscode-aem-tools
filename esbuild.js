const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

// Clean out directory
try {
  fs.rmSync(path.join(__dirname, 'out'), { recursive: true, force: true });
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
};

const serverConfig = {
  entryPoints: ['server/src/server.ts'],
  bundle: true,
  outfile: 'out/server/src/server.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !minify,
  minify: minify,
};

async function run() {
  if (watch) {
    const clientCtx = await esbuild.context(clientConfig);
    const serverCtx = await esbuild.context(serverConfig);
    await clientCtx.watch();
    await serverCtx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(clientConfig);
    await esbuild.build(serverConfig);
    console.log('Build complete.');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
