import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const targets = [
  resolve('node_modules/webpackbar/dist/index.cjs'),
  resolve('node_modules/webpackbar/dist/index.mjs')
];

const replacements = [
  [
    'this.options = Object.assign({}, DEFAULTS, options);',
    'this.webpackbarOptions = Object.assign({}, DEFAULTS, options);\n    this.options = { activeModules: true };'
  ],
  [
    'Array.from(this.options.reporters || []).concat(this.options.reporter)',
    'Array.from(this.webpackbarOptions.reporters || []).concat(this.webpackbarOptions.reporter)'
  ],
  [
    'if (this.options[reporter] === false) {',
    'if (this.webpackbarOptions[reporter] === false) {'
  ],
  [
    'options2 = { ...this.options[reporter], ...options2 };',
    'options2 = { ...this.webpackbarOptions[reporter], ...options2 };'
  ],
  ['globalStates[this.options.name]', 'globalStates[this.webpackbarOptions.name]'],
  ['if (!this.states[this.options.name]) {', 'if (!this.states[this.webpackbarOptions.name]) {'],
  ['this.states[this.options.name] = {', 'this.states[this.webpackbarOptions.name] = {'],
  ['color: this.options.color,', 'color: this.webpackbarOptions.color,'],
  ['name: startCase(this.options.name)', 'name: startCase(this.webpackbarOptions.name)']
];

for (const target of targets) {
  let content = readFileSync(target, 'utf8');
  let changed = false;

  for (const [from, to] of replacements) {
    if (content.includes(from)) {
      content = content.replaceAll(from, to);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(target, content);
    console.log(`patched ${target}`);
  } else {
    console.log(`no changes needed for ${target}`);
  }
}
