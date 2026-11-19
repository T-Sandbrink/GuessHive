// Side-effect module: main.ts imports it FIRST, so a local .env is loaded before
// any other module (and its decorators) is evaluated. ES modules evaluate their
// imports in order, before the importing module's own body runs.
import { loadDotEnvFile } from './env.js';

loadDotEnvFile();
