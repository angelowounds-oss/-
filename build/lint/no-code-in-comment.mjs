// ESLint rule (EV-94): a line comment that trails code and itself holds code (REVIEW-2026-11-08 §3.5: a why-comment put mid-line swallowed the
// statements after it three times). A tail of the comment after a ';' that parses as JS statements doing something (an assignment, a call,
// an update, an await) is reported; prose does not parse, so it passes.
import * as espree from 'espree';

const ACTS = new Set(['AssignmentExpression', 'CallExpression', 'UpdateExpression', 'AwaitExpression']);
// whether a piece of comment text is runnable statements, at least one of which acts
function isCode(src) {
  const s = src.trim(); if (s.length < 4 || !/[=(]/.test(s)) return false;
  let ast; try { ast = espree.parse(s, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true }); } catch { try { ast = espree.parse(`async () => { ${s} }`, { ecmaVersion: 'latest', sourceType: 'module' }); ast = { body: ast.body[0].expression.body.body }; } catch { return false; } }
  return ast.body.some((n) => n.type === 'ExpressionStatement' && ACTS.has(n.expression.type) || n.type === 'VariableDeclaration' || n.type === 'IfStatement' || n.type === 'ReturnStatement');
}

export default {
  meta: { type: 'problem', docs: { description: 'a trailing line comment that holds code after a semicolon' }, schema: [] },
  create(ctx) {
    const sc = ctx.sourceCode;
    return {
      Program() {
        for (const c of sc.getAllComments()) {
          if (c.type !== 'Line') continue;
          const before = sc.lines[c.loc.start.line - 1].slice(0, c.loc.start.column); if (!before.trim()) continue;   // only comments after code
          const t = c.value; let hit = false;
          for (let i = t.indexOf(';'); i >= 0 && !hit; i = t.indexOf(';', i + 1)) hit = isCode(t.slice(i + 1));
          if (hit) ctx.report({ loc: c.loc, message: 'this comment holds code after a semicolon: did a mid-line comment swallow statements?' });
        }
      },
    };
  },
};
