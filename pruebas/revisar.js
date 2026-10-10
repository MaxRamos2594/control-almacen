// Revisión estática del escape de HTML en index.html (no necesita emuladores):
//  1. Datos (campo de un objeto) insertados en HTML sin esc().
//  2. esc() aplicado a HTML armado por el propio programa (se vería como texto),
//     incluidos atributos con comillas como data-num="…" (el atributo se rompe).
const fs = require('fs'), path = require('path'), acorn = require('acorn'), walk = require('acorn-walk');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inicio = html.indexOf('<script>\nconst firebaseConfig') + '<script>'.length;
const fin = html.indexOf('</script>', inicio);
const js = html.slice(inicio, fin);
const desfase = html.slice(0, inicio).split('\n').length - 1;
const ast = acorn.parse(js, { ecmaVersion: 'latest', locations: true });
const ES_HTML = /<[a-zA-Z\/!]|&[a-z#0-9]+;/;
const linea = n => n.loc.start.line + desfase;
const texto = n => js.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, 90);
const ES_ATRIB = /\b[a-z][a-z0-9-]*=["']/i;
const tieneHtml = (e, re = ES_HTML) => { let r = false; walk.full(e, n => {
  if(n.type === 'Literal' && typeof n.value === 'string' && re.test(n.value)) r = true;
  if(n.type === 'TemplateElement' && re.test(n.value.raw)) r = true; }); return r; };
const problemas = [];

// 1. Campos de datos sin escapar
function hojas(e, out){
  if((e.type === 'BinaryExpression' && e.operator === '+') || e.type === 'LogicalExpression'){ hojas(e.left, out); hojas(e.right, out); }
  else if(e.type === 'ConditionalExpression'){ hojas(e.consequent, out); hojas(e.alternate, out); }
  else out.push(e);
  return out;
}
function revisarHojas(e){
  for(const h of hojas(e, [])){
    if(h.type !== 'MemberExpression') continue;
    let r = h; while(r.type === 'MemberExpression') r = r.object;
    if(r.type === 'Identifier' && /^[A-Z][A-Z0-9_]+$/.test(r.name)) continue;      // constantes del programa
    if(!h.computed && /^(length|size)$/.test(h.property.name)) continue;
    problemas.push(`Línea ${linea(h)}: dato sin esc(): ${texto(h)}`);
  }
}
walk.full(ast, n => { if(n.type === 'TemplateLiteral' && n.quasis.some(q => ES_HTML.test(q.value.raw))) n.expressions.forEach(revisarHojas); });
walk.ancestor(ast, { BinaryExpression(n, anc){
  if(n.operator !== '+') return;
  const p = anc[anc.length - 2]; if(p && p.type === 'BinaryExpression' && p.operator === '+') return;
  const partes = []; (function f(e){ if(e.type === 'BinaryExpression' && e.operator === '+'){ f(e.left); f(e.right); } else partes.push(e); })(n);
  if(partes.some(x => (x.type === 'Literal' && typeof x.value === 'string' && ES_HTML.test(x.value)) || (x.type === 'TemplateLiteral' && x.quasis.some(q => ES_HTML.test(q.value.raw)))))
    partes.forEach(revisarHojas);
} });

// 2. esc() sobre HTML del programa
const varsHtml = new Set();
walk.full(ast, n => {
  if(n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && tieneHtml(n.init)) varsHtml.add(n.id.name);
  if(n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && tieneHtml(n.right)) varsHtml.add(n.left.name);
  if(n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'push' && n.callee.object.type === 'Identifier' && n.arguments.some(a => tieneHtml(a) || (a.type === 'CallExpression' && /html$/i.test(a.callee.name || '')))) varsHtml.add(n.callee.object.name);
});
walk.full(ast, n => {
  if(n.type !== 'CallExpression' || n.callee.name !== 'esc') return;
  const a = n.arguments[0];
  if(tieneHtml(a)) return problemas.push(`Línea ${linea(n)}: esc() sobre HTML: ${texto(n)}`);
  if(tieneHtml(a, ES_ATRIB)) return problemas.push(`Línea ${linea(n)}: esc() sobre atributos HTML: ${texto(n)}`);
  walk.full(a, m => {
    if(m.type === 'Identifier' && varsHtml.has(m.name) && !(a.type === 'MemberExpression' && !a.computed && /^(length|size)$/.test(a.property.name)) && !texto(a).includes('.length'))
      problemas.push(`Línea ${linea(n)}: esc() sobre variable con HTML (${m.name}): ${texto(n)}`);
  });
});

if(problemas.length){ console.log('✗ Problemas de escape de HTML:\n  ' + [...new Set(problemas)].join('\n  ')); process.exit(1); }
console.log('✓ Escape de HTML revisado: sin datos sin escapar ni HTML escapado por error.');
