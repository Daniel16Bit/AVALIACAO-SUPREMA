'use strict';
// Proves that a formatting change did not alter any JavaScript: for every tracked .js file
// whose working copy differs from a Git reference, both versions are parsed and their syntax
// trees compared. Positions and the spelling of literals are ignored; structure, names,
// values and comments are not.
//
//   node scripts/format-equivalence.js            compares the working copy with HEAD
//   node scripts/format-equivalence.js <ref>      compares it with another commit or branch
//
// Exit code 0 only when every changed file is equivalent.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {Linter} = require('eslint');

const root = path.resolve(__dirname, '..');
const ref = process.argv[2] || 'HEAD';
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const IGNORED = new Set(['start', 'end', 'loc', 'range', 'raw', 'parent', 'tokens', 'comments']);

function parse(code, name) {
  const errors = [];
  for (const sourceType of ['commonjs', 'module']) {
    const linter = new Linter({configType: 'flat'});
    // A fixed file name: the linter only keeps the syntax tree of files its configuration covers.
    const fatal = linter
      .verify(code, [{files: ['**/*.js'], languageOptions: {ecmaVersion: 'latest', sourceType}}], {
        filename: 'arquivo.js'
      })
      .filter(message => message.fatal);
    const source = linter.getSourceCode();
    if (!fatal.length && source) return source;
    errors.push(fatal[0]?.message || 'arvore de sintaxe indisponivel');
  }
  throw Error(`${name}: ${errors.join(' | ')}`);
}

// A plain structure with everything that defines what the code does and nothing about where it is written.
function shape(node) {
  if (Array.isArray(node)) return node.map(shape);
  if (node instanceof RegExp) return String(node);
  if (typeof node === 'bigint') return node + 'n';
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.keys(node)
      .filter(key => !IGNORED.has(key))
      .sort()
      .map(key => [key, shape(node[key])])
  );
}
const comments = source =>
  source.getAllComments().map(comment => comment.type + ':' + comment.value.replace(/\s+/g, ' ').trim());

const changed = git('diff', '--name-only', ref, '--', '*.js').split('\n').filter(Boolean);
let different = 0;
for (const file of changed) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue; // removed files have nothing to compare
  let before;
  try {
    before = git('show', `${ref}:${file}`);
  } catch {
    console.log('NOVO      ' + file);
    continue;
  }
  const a = parse(before, file + '@' + ref),
    b = parse(fs.readFileSync(full, 'utf8'), file);
  const sameCode = JSON.stringify(shape(a.ast)) === JSON.stringify(shape(b.ast));
  const sameComments = JSON.stringify(comments(a)) === JSON.stringify(comments(b));
  if (sameCode && sameComments) console.log('IDENTICO  ' + file);
  else {
    different++;
    console.log('DIFERENTE ' + file + (sameCode ? ' (comentarios)' : ' (codigo)'));
  }
}
console.log(
  `${changed.length} arquivo(s) alterado(s) em relacao a ${ref}; ${different} com diferenca de codigo ou de comentario.`
);
process.exit(different ? 1 : 0);
