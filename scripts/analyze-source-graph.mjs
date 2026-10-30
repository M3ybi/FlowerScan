import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["src", "netlify/functions", "supabase/functions"];
const collect = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = `${directory}/${entry.name}`;
  return entry.isDirectory() ? collect(file) : /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts") ? [file] : [];
});
const files = roots.flatMap(collect).sort();
const known = new Set(files);
const edges = [];
const unresolved = [];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const add = (specifier, kind) => {
    if (!specifier.startsWith(".")) return;
    const resolved = ts.resolveModuleName(specifier, path.resolve(file), { moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }, ts.sys).resolvedModule;
    const target = resolved ? path.relative(process.cwd(), resolved.resolvedFileName).replaceAll("\\", "/") : "";
    if (known.has(target)) edges.push({ from: file, to: target, kind });
    else if (!resolved && !/\.(css|svg|png|jpe?g|webp)$/.test(specifier)) unresolved.push({ file, specifier });
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly = clause?.isTypeOnly || (!clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(item => item.isTypeOnly));
      add(node.moduleSpecifier.text, typeOnly ? "type" : "runtime");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text, node.isTypeOnly ? "type" : "runtime");
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text, "dynamic");
    else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" &&
      node.arguments?.length === 2 && ts.isStringLiteral(node.arguments[0]) && node.arguments[1].getText(source) === "import.meta.url") {
      if (/\.[cm]?[jt]sx?$/.test(node.arguments[0].text)) add(node.arguments[0].text, "worker");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const adjacency = new Map(files.map(file => [file, edges.filter(edge => edge.from === file && edge.kind !== "type").map(edge => edge.to)]));
const visited = new Set(), active = new Set(), stack = [], cycles = [];
const visit = file => {
  if (active.has(file)) { cycles.push([...stack.slice(stack.indexOf(file)), file]); return; }
  if (visited.has(file)) return;
  visited.add(file); active.add(file); stack.push(file);
  for (const target of adjacency.get(file)) visit(target);
  stack.pop(); active.delete(file);
};
files.forEach(visit);
const fanIn = file => edges.filter(edge => edge.to === file && edge.kind !== "type").length;
const report = { scope: roots, modules: files.length, edges: edges.length, unresolved, cycles,
  largestModules: files.map(file => ({ file, lines: fs.readFileSync(file, "utf8").split("\n").length, imports: adjacency.get(file).length, consumers: fanIn(file) })).sort((a,b) => b.lines-a.lines).slice(0,20), imports: edges };
if (process.argv.includes("--write")) {
  const output = path.resolve(".tmp-tests/source-graph.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ modules: report.modules, edges: report.edges, unresolved, cycles }, null, 2));
if (unresolved.length || cycles.length) process.exitCode = 1;
