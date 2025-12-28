import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Plugin to replace Node.js-only dependencies with local stub files
const nodeStubPlugin = {
  name: 'node-stub',
  setup(build) {
    // Replace sharp with local stub file
    build.onResolve({ filter: /^sharp$/ }, () => {
      return { path: join(projectRoot, 'lib/sharp.js') };
    });
    
    // Replace onnxruntime-node with local stub file
    build.onResolve({ filter: /^onnxruntime-node$/ }, () => {
      return { path: join(projectRoot, 'lib/onnxruntime-node.js') };
    });
  }
};

try {
  await esbuild.build({
    entryPoints: [join(projectRoot, 'node_modules/@xenova/transformers/src/transformers.js')],
    bundle: true,
    format: 'esm',
    outfile: join(projectRoot, 'lib/transformers.js'),
    platform: 'browser',
    target: 'es2020',
    plugins: [nodeStubPlugin],
    banner: {
      js: '// Bundled transformers.js for Chrome extension'
    }
  });
  console.log('✓ Successfully bundled transformers.js');
} catch (error) {
  console.error('✗ Failed to bundle transformers.js:', error);
  process.exit(1);
}

