#!/usr/bin/env node
import { execSync } from 'node:child_process';

execSync('npx typedoc --options typedoc.json', { stdio: 'inherit' });
console.log('Generated API docs in docs/api');
