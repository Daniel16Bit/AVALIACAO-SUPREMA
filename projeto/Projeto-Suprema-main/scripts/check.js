'use strict';
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..');
function walk(folder) {
  return fs
    .readdirSync(folder, {withFileTypes: true})
    .filter(entry => entry.name !== 'node_modules')
    .flatMap(entry => {
      const filename = path.join(folder, entry.name);
      return entry.isDirectory() ? walk(filename) : [filename];
    });
}
const files = ['apps', 'scripts', 'packages', 'tests']
  .flatMap(dir => walk(path.join(root, dir)))
  .filter(p => p.endsWith('.js'));
for (const file of [path.join(root, 'server.js'), ...files]) {
  const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(1);
  }
  if (!file.includes(path.join('web', 'public'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (match[1].startsWith('.')) createRequire(file).resolve(match[1]);
    }
  }
}
const web = path.join(root, 'apps/web/public');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)) {
  if (!fs.existsSync(path.join(web, match[1]))) throw Error('Recurso ausente: ' + match[1]);
}
// Domain modules must not import sibling features or the frontend.
const modules = path.join(root, 'apps/api/src/modules');
for (const file of walk(modules).filter(p => p.endsWith('.js') && path.dirname(p) !== modules)) {
  const feature = path.relative(modules, file).split(path.sep)[0];
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), match[1]);
    if (target.startsWith(modules + path.sep) && path.relative(modules, target).split(path.sep)[0] !== feature)
      throw Error('Dependencia entre modulos: ' + file);
    if (target.includes(path.join('apps', 'web'))) throw Error('API depende da interface: ' + file);
  }
}
console.log(`Sintaxe de ${files.length + 1} arquivos, recursos HTML e fronteiras dos modulos: OK`);
