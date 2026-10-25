// 列出源码里所有 tl() 键，检查英文包缺哪些、多哪些（node scripts/i18n/check.mjs [--json 输出文件]）
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(path.join(ROOT, 'src')).filter((f) => /\.tsx?$/.test(f) && !/\.test\.|\.d\.ts$|\/i18n\//.test(f));

const keys = new Map();
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (k, n) => { const at = `${path.relative(ROOT, f)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`; if (!keys.has(k)) keys.set(k, []); keys.get(k).push(at); };
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tl' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) add(n.arguments[0].text, n);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tlc' && n.arguments.length === 2 && n.arguments.every((a) => ts.isStringLiteral(a))) add(`${n.arguments[0].text}|${n.arguments[1].text}`, n);
    if (ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag) && n.tag.text === 'tl') {
      const tp = n.template;
      if (ts.isNoSubstitutionTemplateLiteral(tp)) add(tp.text, n);
      else add(tp.head.text + tp.templateSpans.map((s, i) => `{${i}}` + s.literal.text).join(''), n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// 读英文包（en*.ts 里 export const 的对象字面量，键值都是字符串）
const en = {};
for (const f of fs.readdirSync(path.join(ROOT, 'src/i18n')).filter((x) => /^en.*\.ts$/.test(x))) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(ROOT, 'src/i18n', f), 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isIdentifier(n.name)) && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) en[n.name.text] = n.initializer.text;
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const missing = [...keys.keys()].filter((k) => !(k in en));
const unused = Object.keys(en).filter((k) => !keys.has(k));
// 占位符要对得上
const badPh = [...keys.keys()].filter((k) => k in en && (k.match(/\{\d+\}/g) ?? []).sort().join() !== (en[k].match(/\{\d+\}/g) ?? []).sort().join());
console.log(`keys ${keys.size}, translated ${keys.size - missing.length}, missing ${missing.length}, unused ${unused.length}, placeholder mismatch ${badPh.length}`);
badPh.forEach((k) => console.log('  placeholder:', JSON.stringify(k), '→', JSON.stringify(en[k])));
const out = process.argv.indexOf('--json');
if (out > 0) fs.writeFileSync(process.argv[out + 1], JSON.stringify(missing.map((k) => ({ k, at: keys.get(k).slice(0, 3) })), null, 1));
else if (missing.length) console.log(missing.slice(0, 40).map((k) => '  ' + JSON.stringify(k) + '  ' + keys.get(k)[0]).join('\n'));
if (process.argv.includes('--unused')) unused.forEach((k) => console.log('  unused:', JSON.stringify(k)));
