/* eslint-env node */
import { console } from "node:console";


import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname); // Go up one level from tools/ to project root

function fixImports(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    // Fix relative imports: from "./something" to from "./something.js"
    content = content.replace(/from\s+["'](\.\.[/\\][^"']*?)["']/g, (match, importPath) => {
        if (!importPath.endsWith('.js')) {
            changed = true;
            return match.replace(importPath, importPath + '.js');
        }
        return match;
    });
    
    content = content.replace(/from\s+["'](\.[/\\][^"']*?)["']/g, (match, importPath) => {
        if (!importPath.endsWith('.js')) {
            changed = true;
            return match.replace(importPath, importPath + '.js');
        }
        return match;
    });
    
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed: ${path.relative(projectRoot, filePath)}`);
    }
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory ${dir} doesn't exist, skipping...`);
        return;
    }
    
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (file.endsWith('.ts')) {
            fixImports(fullPath);
        }
    }
}

console.log('Fixing TypeScript imports...');
console.log(`Project root: ${projectRoot}`);
walkDir(path.join(projectRoot, 'src'));
walkDir(path.join(projectRoot, 'tools'));
console.log('Done!');
