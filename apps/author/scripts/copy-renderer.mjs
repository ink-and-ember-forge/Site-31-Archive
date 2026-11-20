// Copies the static renderer files next to the compiled main process.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/renderer', { recursive: true });
cpSync('renderer', 'dist/renderer', { recursive: true });
