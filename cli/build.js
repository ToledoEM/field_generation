import { mkdirSync, cpSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dirname + '/dist', { recursive: true });
cpSync(__dirname + '/src/index.js', __dirname + '/dist/index.js');
cpSync(__dirname + '/src/methods.js', __dirname + '/dist/methods.js');
cpSync(__dirname + '/src/generate.js', __dirname + '/dist/generate.js');
cpSync(__dirname + '/src/noise.js', __dirname + '/dist/noise.js');
