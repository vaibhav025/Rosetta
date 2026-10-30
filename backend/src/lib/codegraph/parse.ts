/**
 * Reading one source file for the repository map: which other files it
 * imports, and the top-level things it defines (with their line numbers).
 *
 * Plain pattern matching per language, no compilers: fast enough for
 * thousands of files in one serverless call, and close enough to say what a
 * change reaches. Comments are blanked first (line numbers kept), so a
 * commented-out import doesn't count.
 */

export type Lang = "js" | "py" | "go" | "jvm" | "rb" | "php" | "c" | "rust";

export type DefKind = "function" | "class" | "type" | "value";
/** `default`: what `import x from` (JavaScript) gets from this file. */
export type Def = { name: string; line: number; kind: DefKind; default?: true };

/**
 * One import as written. `names`: what it takes from the file; missing means
 * the whole module, or that we can't tell. `reexport`: passed on to the file's
 * own importers (`export { a } from "./x"`).
 */
export type Import = { spec: string; names?: string[]; reexport?: true };

export type FileNode = { lang: Lang; defs: Def[]; imports: Import[] };

const EXT: Record<string, Lang> = {
  ts: "js", tsx: "js", js: "js", jsx: "js", mjs: "js", cjs: "js", mts: "js", cts: "js", vue: "js", svelte: "js",
  py: "py",
  go: "go",
  java: "jvm", kt: "jvm", kts: "jvm", scala: "jvm",
  rb: "rb",
  php: "php",
  c: "c", h: "c", cc: "c", cpp: "c", cxx: "c", hpp: "c", hh: "c", hxx: "c",
  rs: "rust",
};

/** Folders that hold other people's code or build output: never part of the map. */
const IGNORED_DIR = /(^|\/)(node_modules|vendor|bower_components|third_party|dist|build|out|target|coverage|\.next|\.nuxt|\.svelte-kit|\.git|\.venv|venv|env|__pycache__|\.tox|\.mypy_cache|Pods|DerivedData)\//;
const IGNORED_FILE = /(\.min\.js|\.d\.ts|\.bundle\.js|\.generated\.\w+|_pb2\.py|\.pb\.go)$/;

export function langOf(path: string): Lang | undefined {
  if (IGNORED_DIR.test(path) || IGNORED_FILE.test(path)) return undefined;
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return Object.hasOwn(EXT, ext) ? EXT[ext] : undefined;
}

/** Files that change how imports resolve (path aliases, Go module names). */
export const isConfig = (path: string) => !IGNORED_DIR.test(path) && /(^|\/)(tsconfig[\w.-]*\.json|jsconfig\.json|go\.mod)$/.test(path);

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

const blank = (s: string) => s.replace(/[^\n]/g, " ");

/** Comments replaced by spaces, newlines kept, so line numbers still match the file. */
function stripComments(text: string, lang: Lang) {
  if (lang === "py" || lang === "rb") {
    let out = text.replace(/(^|[ \t])#.*$/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
    // Docstrings and =begin blocks often quote code: blank them too.
    if (lang === "py") out = out.replace(/("""|''')[\s\S]*?\1/g, blank);
    else out = out.replace(/^=begin[\s\S]*?^=end/gm, blank);
    return out;
  }
  // C-style: block comments, then line comments that don't sit inside a URL (http://).
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  out = out.replace(/(^|[\s;{}()])\/\/.*$/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
  if (lang === "php") out = out.replace(/(^|[\s;{}()])#(?!\[).*$/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
  return out;
}

/* ------------------------------------------------------------------ */
/* Imports                                                             */
/* ------------------------------------------------------------------ */

const splitNames = (list: string) =>
  list
    .split(",")
    .map((p) => p.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
    .filter((p) => /^[\w$]+$/.test(p));

/** `import a, { b as c, type d } from` → ["default", "b", "d"]; `* as x` → whole module. */
function jsClause(kind: string, clause: string): Pick<Import, "names" | "reexport"> {
  const c = clause.trim();
  const reexport = kind === "export" ? ({ reexport: true } as const) : {};
  if (!c || c.includes("*")) return reexport;
  const names: string[] = [];
  const braces = /\{([^}]*)\}/.exec(c);
  if (braces) names.push(...splitNames(braces[1]));
  const rest = c.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
  if (rest && kind === "import") names.push("default");
  return { names, ...reexport };
}

function jsImports(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(/\b(import|export)\s+(?:type\s+)?([\w*${}\s,]*?)\s*from\s*["'`]([^"'`\n]+)["'`]/g)) {
    out.push({ spec: m[3], ...jsClause(m[1], m[2]) });
  }
  for (const m of text.matchAll(/\bimport\s*["']([^"'\n]+)["']/g)) out.push({ spec: m[1] });
  for (const m of text.matchAll(/\b(?:require|import)\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g)) out.push({ spec: m[1] });
  return out;
}

function pyImports(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm)) {
    const list = m[2].replace(/[()\\]/g, " ");
    out.push(list.includes("*") ? { spec: m[1] } : { spec: m[1], names: splitNames(list) });
  }
  for (const m of text.matchAll(/^[ \t]*import[ \t]+([^\n]+)/gm)) {
    for (const part of m[1].split(",")) {
      const spec = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[\w.]+$/.test(spec)) out.push({ spec });
    }
  }
  return out;
}

function goImports(text: string): Import[] {
  const out: Import[] = [];
  const one = /(?:^|\s)(?:[\w.]+\s+)?"([^"]+)"/g;
  for (const m of text.matchAll(/^import\s*\(([\s\S]*?)\)/gm)) for (const n of m[1].matchAll(one)) out.push({ spec: n[1] });
  for (const m of text.matchAll(/^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) out.push({ spec: m[1] });
  return out;
}

function jvmImports(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(/^import\s+(?:static\s+)?([\w.]+?)(\.\*|\._)?(?:\s+as\s+\w+)?\s*;?\s*$/gm)) {
    out.push({ spec: m[2] ? `${m[1]}.*` : m[1] });
  }
  return out;
}

function rbImports(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(/^\s*require_relative\s*\(?\s*["']([^"']+)["']/gm)) out.push({ spec: `./${m[1].replace(/^\.\//, "")}` });
  for (const m of text.matchAll(/^\s*require\s*\(?\s*["']([^"']+)["']/gm)) out.push({ spec: m[1] });
  return out;
}

function phpImports(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(/^\s*(?:require|include)(?:_once)?\s*\(?\s*(__DIR__\s*\.\s*)?["']([^"']+)["']/gm)) {
    out.push({ spec: `./${m[2].replace(/^\.?\//, "")}` });
  }
  for (const m of text.matchAll(/^\s*use\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/gm)) out.push({ spec: m[1].replace(/^\\/, "") });
  return out;
}

function cImports(text: string): Import[] {
  return [...text.matchAll(/^\s*#\s*include\s*"([^"]+)"/gm)].map((m) => ({ spec: m[1] }));
}

function rustImports(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)) out.push({ spec: `mod:${m[1]}` });
  for (const m of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+((?:crate|self|super)(?:::\w+)*)(?:::\{([^}]*)\}|::(\w+|\*))?\s*;/gm)) {
    if (m[2]) out.push({ spec: m[1], names: splitNames(m[2]) });
    else if (m[3] && m[3] !== "*") out.push({ spec: m[1], names: [m[3]] });
    else out.push({ spec: m[1] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

type DefRule = [RegExp, DefKind];

/** Each pattern has a `name` group; `dflt` marks a JavaScript default export. */
const DEFS: Record<Lang, DefRule[]> = {
  js: [
    [/^(?:export\s+)?(?<dflt>default\s+)?(?:async\s+)?function\s*\*?\s*(?<name>[A-Za-z_$][\w$]*)/, "function"],
    [/^(?:export\s+)?(?<dflt>default\s+)?(?:abstract\s+)?class\s+(?<name>[A-Za-z_$][\w$]*)/, "class"],
    [/^(?:export\s+)?(?:declare\s+)?(?:const\s+)?(?:interface|type|enum)\s+(?<name>[A-Za-z_$][\w$]*)/, "type"],
    [/^(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)/, "value"],
    [/^(?:module\.)?exports\.(?<name>[A-Za-z_$][\w$]*)\s*=/, "value"],
  ],
  py: [
    [/^(?:async\s+)?def\s+(?<name>\w+)/, "function"],
    [/^class\s+(?<name>\w+)/, "class"],
    [/^(?<name>[A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/, "value"],
  ],
  go: [
    [/^func\s+(?:\([^)]*\)\s*)?(?<name>[A-Za-z_]\w*)/, "function"],
    [/^type\s+(?<name>[A-Za-z_]\w*)/, "type"],
    [/^(?:var|const)\s+(?<name>[A-Za-z_]\w*)/, "value"],
  ],
  jvm: [
    [/^\s*(?:(?:public|private|protected|internal|abstract|final|open|sealed|data|static|inner|enum|annotation|value|case)\s+)*(?:class|interface|enum|object|record|trait)\s+(?<name>[A-Za-z_]\w*)/, "class"],
    [/^\s*(?:(?:public|private|protected|internal|override|suspend|inline|open|abstract|operator|infix|tailrec|external)\s+)*(?:fun|def)\s+(?:<[^>]*>\s*)?(?:[\w.<>]+\.)?(?<name>[A-Za-z_]\w*)\s*[([]/, "function"],
    [/^\s+(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)+(?:<[^>]*>\s*)?[\w<>[\],.?]+\s+(?<name>[a-zA-Z_]\w*)\s*\(/, "function"],
  ],
  rb: [
    [/^\s*def\s+(?:self\.)?(?<name>[\w?!=]+)/, "function"],
    [/^\s*(?:class|module)\s+(?<name>[\w:]+)/, "class"],
  ],
  php: [
    [/^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+(?<name>\w+)/, "class"],
    [/^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?(?<name>\w+)/, "function"],
  ],
  c: [
    [/^(?:typedef\s+)?(?:struct|class|enum|union|namespace)\s+(?<name>[A-Za-z_]\w*)\s*(?:[:{]|$)/, "class"],
    [/^(?!(?:if|for|while|switch|return|else|do|case|typedef)\b)[A-Za-z_][\w:<>*&\s,]*?[\s*&](?<name>[A-Za-z_][\w:~]*)\s*\([^;]*$/, "function"],
    [/^#\s*define\s+(?<name>[A-Za-z_]\w*)/, "value"],
  ],
  rust: [
    [/^\s{0,4}(?:pub(?:\([^)]*\))?\s+)?(?:(?:async|const|unsafe|extern\s+"[^"]*")\s+)*fn\s+(?<name>[A-Za-z_]\w*)/, "function"],
    [/^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+(?<name>[A-Za-z_]\w*)/, "class"],
    [/^(?:pub(?:\([^)]*\))?\s+)?(?:type|const|static)\s+(?<name>[A-Za-z_]\w*)/, "value"],
    [/^impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?(?<name>[A-Za-z_]\w*)/, "class"],
  ],
};

/** The top-level definitions in some lines of code. `firstLine` numbers them (1-based). */
export function defsIn(lines: string[], lang: Lang, firstLine = 1): Def[] {
  const out: Def[] = [];
  const rules = DEFS[lang];
  lines.forEach((line, i) => {
    for (const [re, kind] of rules) {
      const m = re.exec(line);
      if (!m?.groups?.name) continue;
      out.push({ name: m.groups.name, line: firstLine + i, kind, ...(m.groups.dflt ? { default: true as const } : {}) });
      break;
    }
    if (lang === "js") {
      // `export default Name;` after the definition marks it as the default export.
      const d = /^export\s+default\s+(?<name>[A-Za-z_$][\w$]*)\s*;?\s*$/.exec(line);
      if (d?.groups) {
        const def = [...out].reverse().find((x) => x.name === d.groups!.name);
        if (def) def.default = true;
      } else if (/^export\s+default\b/.test(line) && !out.some((x) => x.line === firstLine + i)) {
        out.push({ name: "default", line: firstLine + i, kind: "value", default: true });
      }
    }
  });
  return out;
}

const IMPORTS: Record<Lang, (text: string) => Import[]> = {
  js: jsImports,
  py: pyImports,
  go: goImports,
  jvm: jvmImports,
  rb: rbImports,
  php: phpImports,
  c: cImports,
  rust: rustImports,
};

/** Imports and definitions of one file, or undefined when it isn't source code we read. */
export function parseFile(path: string, text: string): FileNode | undefined {
  const lang = langOf(path);
  if (!lang || text.includes("\u0000")) return undefined;
  const clean = stripComments(text, lang);
  const seen = new Set<string>();
  const imports = IMPORTS[lang](clean).filter((i) => {
    const key = `${i.spec}|${i.names?.join(",") ?? "*"}|${i.reexport ? 1 : 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { lang, defs: defsIn(clean.split("\n"), lang), imports };
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * A path alias from a tsconfig or jsconfig: imports starting with `prefix`
 * (from files under `root`) point into `targets`. "@/*": ["./src/*"] in
 * frontend/tsconfig.json → { root: "frontend/", prefix: "@/", targets: ["frontend/src/"] }.
 */
export type Alias = { root: string; prefix: string; targets: string[]; exact?: true };

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");

/** Joins and tidies a path: no "./", ".." applied, no leading "/". */
export function normalize(p: string) {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export function tsconfigAliases(path: string, text: string): Alias[] {
  let config: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    // JSON with comments and trailing commas, as tsconfig allows.
    const json = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
    config = JSON.parse(json);
  } catch {
    return [];
  }
  const root = dirOf(path);
  const opts = config.compilerOptions ?? {};
  const base = normalize(root + (opts.baseUrl ?? "."));
  const dir = (p: string) => (p ? `${p}/` : "");
  const out: Alias[] = [];
  for (const [key, values] of Object.entries(opts.paths ?? {})) {
    if (!Array.isArray(values)) continue;
    const wild = key.endsWith("*");
    const targets = values.filter((v) => typeof v === "string").map((v) => (wild ? dir(normalize(`${base}/${v.replace(/\*$/, "")}`)) : normalize(`${base}/${v}`)));
    out.push({ root, prefix: wild ? key.slice(0, -1) : key, targets, ...(wild ? {} : { exact: true as const }) });
  }
  // A baseUrl alone lets non-relative imports start from it ("components/Button").
  if (opts.baseUrl) out.push({ root, prefix: "", targets: [dir(base)] });
  return out;
}

export function goModule(text: string) {
  return /^module\s+(\S+)/m.exec(text)?.[1];
}
