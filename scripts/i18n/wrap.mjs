// 把源码里的中文文案包进 tl('…') / tl`…`，供英文语言包查表（node scripts/i18n/wrap.mjs）
// 可以反复运行：已经包过的不会再包。--dry 只列出要改的地方，不写文件。
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DRY = process.argv.includes('--dry');
const CJK = /[　-〿㐀-鿿＀-￯…·—]/;
const HAN = /[㐀-鿿　-〿＀-￯]/;

const cfg = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const files = cfg.fileNames.filter((f) => !/\.test\.tsx?$|\.d\.ts$|\/i18n[/.]/.test(f));
const program = ts.createProgram(files, cfg.options);
const checker = program.getTypeChecker();

const isWrapCall = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'tl' || n.expression.text === 'tlc');
const isTag = (n) => ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag) && n.tag.text === 'tl';
function skipCtx(node) {
  const p = node.parent;
  // 行尾写了 i18n-ignore 的不包（输入解析之类的逻辑字符串）
  const sf = node.getSourceFile();
  const ln = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  if (sf.text.split('\n')[ln].includes('i18n-ignore')) return true;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return 'elem';
  if (isWrapCall(p) || isTag(p)) return true;
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
    const obj = p.expression.expression.getText();
    if (obj === 'console') return true;
  }
  return false;
}
// 表达式结果是不是纯文本（字符串或数字），能直接拼进模板
function isPlain(expr) {
  let bad = false;
  const walk = (n) => { if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) bad = true; else ts.forEachChild(n, walk); };
  walk(expr);
  if (bad) return false;
  const ty = checker.getTypeAtLocation(expr);
  const ok = (t) => !!(t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike));
  if (ty.isUnion()) return ty.types.every(ok);
  return ok(ty);
}
// JSX 文本的空白规则：带换行的空白整段折叠
function jsxClean(s) {
  if (!s.includes('\n')) return s;
  const lines = s.split(/\r?\n/);
  let out = '';
  lines.forEach((ln, i) => {
    let x = ln.replace(/\t/g, ' ');
    if (i > 0) x = x.replace(/^ +/, '');
    if (i < lines.length - 1) x = x.replace(/ +$/, '');
    if (x) out += (out ? ' ' : '') + x;
  });
  return out;
}
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const sq = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const report = { files: 0, edits: 0, elem: [] };
for (const sf of program.getSourceFiles()) {
  if (!files.includes(sf.fileName)) continue;
  const edits = [];
  const used = new Set();
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const kids = node.children;
      let i = 0;
      while (i < kids.length) {
        const k = kids[i];
        const textish = (c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && !ts.isStringLiteral(c.expression) && isPlain(c.expression));
        if (!textish(k)) { if (!ts.isJsxText(k)) visit(k); i++; continue; }
        let j = i;
        while (j < kids.length && textish(kids[j])) j++;
        const run = kids.slice(i, j);
        const hasHan = run.some((c) => ts.isJsxText(c) && HAN.test(c.text));
        if (hasHan) {
          // 去掉首尾纯空白文本
          let a = 0, b = run.length;
          while (a < b && ts.isJsxText(run[a]) && !run[a].text.trim()) a++;
          while (b > a && ts.isJsxText(run[b - 1]) && !run[b - 1].text.trim()) b--;
          const seg = run.slice(a, b);
          let tpl = '';
          let plain = '';
          let nExpr = 0;
          seg.forEach((c) => {
            if (ts.isJsxText(c)) { const s = jsxClean(c.text); tpl += esc(s); plain += s; }
            else { tpl += '${' + c.expression.getText(sf) + '}'; nExpr++; }
          });
          const s0 = ts.isJsxText(seg[0]) ? seg[0].pos : seg[0].getStart(sf);
          const e0 = seg[seg.length - 1].getEnd();
          const body = nExpr ? `{tl\`${tpl}\`}` : `{tl(${sq(plain)})}`;
          used.add('tl');
          edits.push([s0, e0, body]);
        } else {
          run.forEach((c) => { if (ts.isJsxExpression(c)) visit(c); });
        }
        i = j;
      }
      if (ts.isJsxElement(node)) visit(node.openingElement);
      return;
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && CJK.test(node.initializer.text) && HAN.test(node.initializer.text)) {
      edits.push([node.initializer.getStart(sf), node.initializer.getEnd(), `{tl(${node.initializer.getText(sf)})}`]);
      used.add('tl');
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CJK.test(node.text) && HAN.test(node.text)) {
      const sk = skipCtx(node);
      if (sk === 'elem') report.elem.push(`${path.relative(ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${node.getText(sf)}`);
      if (!sk) { edits.push([node.getStart(sf), node.getEnd(), `tl(${node.getText(sf)})`]); used.add('tl'); }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((p) => HAN.test(p)) && !skipCtx(node)) { edits.push([node.getStart(sf), node.getStart(sf), 'tl']); used.add('tl'); }
      node.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  const visitInner = (n) => visit(n);
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  // 去掉嵌套重叠（外层先处理的保留）
  let text = sf.text;
  let lastStart = Infinity;
  for (const [s, e, r] of edits) {
    if (e > lastStart) continue;
    text = text.slice(0, s) + r + text.slice(e);
    lastStart = s;
  }
  // 补 import
  const rel = path.relative(path.dirname(sf.fileName), path.join(ROOT, 'src/i18n')).replace(/\\/g, '/');
  const spec = rel.startsWith('.') ? rel : './' + rel;
  const m = text.match(/^import \{([^}]*)\} from '([^']*\/i18n)';\n/m);
  const names = [...used];
  if (m) {
    const have = new Set(m[1].split(',').map((x) => x.trim()).filter(Boolean));
    names.forEach((n) => have.add(n));
    text = text.replace(m[0], `import { ${[...have].sort().join(', ')} } from '${m[2]}';\n`);
  } else {
    // 放在最后一个 import 之后
    const imps = [...text.matchAll(/^import [\s\S]*?from '[^']+';\n/gm)];
    const at = imps.length ? imps[imps.length - 1].index + imps[imps.length - 1][0].length : 0;
    text = text.slice(0, at) + `import { ${names.sort().join(', ')} } from '${spec}';\n` + text.slice(at);
  }
  report.files++; report.edits += edits.length;
  if (!DRY) fs.writeFileSync(sf.fileName, text);
}
console.log(`files ${report.files}, edits ${report.edits}`);
if (report.elem.length) console.log('element-access keys (not wrapped):\n' + report.elem.join('\n'));
