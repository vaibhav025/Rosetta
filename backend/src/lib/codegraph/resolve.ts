import { normalize, type Alias, type FileNode, type Import } from "./parse";

/**
 * Which file in the repository an import points to. Packages from outside the
 * repository resolve to nothing, which is what we want: the map is about the
 * company's own code.
 */

/** Settings that change resolution, by the config file they came from. */
export type RepoConfig = {
  /** tsconfig/jsconfig path → its aliases. */
  aliases: Record<string, Alias[]>;
  /** go.mod path → the module name it declares. */
  goModules: Record<string, string>;
};

/** One resolved import: `to` imports nothing more specific than `names` (missing: the whole file). */
export type Edge = { from: string; to: string; names?: string[]; reexport?: true };

const JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const join = (dir: string, rel: string) => normalize(dir ? `${dir}/${rel}` : rel);

/** How many leading path segments two paths share: the nearer file wins a tie. */
function shared(a: string, b: string) {
  const x = a.split("/");
  const y = b.split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

export class Resolver {
  private paths: Set<string>;
  private byName = new Map<string, string[]>();
  private byDir = new Map<string, string[]>();
  private aliases: Alias[];
  private modules: { dir: string; module: string }[];

  constructor(files: Iterable<string>, config: RepoConfig) {
    this.paths = new Set(files);
    for (const p of this.paths) {
      const name = baseOf(p);
      (this.byName.get(name) ?? this.byName.set(name, []).get(name)!).push(p);
      const dir = dirOf(p);
      (this.byDir.get(dir) ?? this.byDir.set(dir, []).get(dir)!).push(p);
    }
    // Most specific first: a deeper config, then a longer prefix.
    this.aliases = Object.values(config.aliases)
      .flat()
      .sort((a, b) => b.root.length - a.root.length || b.prefix.length - a.prefix.length);
    this.modules = Object.entries(config.goModules)
      .map(([path, module]) => ({ dir: dirOf(path), module }))
      .sort((a, b) => b.module.length - a.module.length);
  }

  /** The files `imp` (written in `from`) points to. */
  resolve(from: string, node: FileNode, imp: Import): Edge[] {
    const targets = this.targets(from, node.lang, imp);
    return targets.filter((t) => t.to !== from).map((t) => ({ from, ...t, ...(imp.reexport ? { reexport: true as const } : {}) }));
  }

  private targets(from: string, lang: FileNode["lang"], imp: Import): Omit<Edge, "from" | "reexport">[] {
    const one = (to: string | undefined, names = imp.names) => (to ? [{ to, ...(names ? { names } : {}) }] : []);
    const spec = imp.spec;
    switch (lang) {
      case "js":
        return one(this.js(from, spec));
      case "py":
        return this.py(from, imp);
      case "go":
        return this.go(spec).map((to) => ({ to }));
      case "jvm":
        return this.jvm(from, spec);
      case "rb":
        return one(spec.startsWith(".") ? this.firstFile([join(dirOf(from), spec), `${join(dirOf(from), spec)}.rb`]) : this.suffix(from, `${spec}.rb`));
      case "php":
        if (spec.startsWith(".")) return one(this.firstFile([join(dirOf(from), spec)]));
        return one(this.namespaced(from, spec.split("\\"), ".php"));
      case "c":
        return one(this.firstFile([join(dirOf(from), spec)]) ?? this.suffix(from, normalize(spec)));
      case "rust":
        return one(this.rust(from, spec));
    }
  }

  private firstFile(candidates: string[]) {
    return candidates.find((c) => this.paths.has(c));
  }

  /** The file ending in `suffix` nearest to `from`. */
  private suffix(from: string, suffix: string) {
    const list = this.byName.get(baseOf(suffix)) ?? [];
    const hits = list.filter((p) => p === suffix || p.endsWith(`/${suffix}`));
    if (hits.length <= 1) return hits[0];
    return hits.reduce((best, p) => (shared(p, from) > shared(best, from) ? p : best));
  }

  /** "App\Models\User" → …/App/Models/User.php, else …/Models/User.php (PSR-4 often drops the first part). */
  private namespaced(from: string, parts: string[], ext: string) {
    for (let drop = 0; drop < Math.min(2, parts.length - 1); drop++) {
      const hit = this.suffix(from, `${parts.slice(drop).join("/")}${ext}`);
      if (hit) return hit;
    }
    return undefined;
  }

  private jsFile(base: string) {
    const stem = base.replace(/\.(m|c)?jsx?$/, "");
    return this.firstFile([
      base,
      ...JS_EXT.map((e) => base + e),
      ...(stem !== base ? JS_EXT.map((e) => stem + e) : []),
      ...JS_EXT.map((e) => `${base}/index${e}`),
    ]);
  }

  private js(from: string, spec: string) {
    if (spec.startsWith(".")) return this.jsFile(join(dirOf(from), spec));
    for (const a of this.aliases) {
      if (a.root && !from.startsWith(a.root)) continue;
      const hit = a.exact ? spec === a.prefix : spec.startsWith(a.prefix);
      if (!hit) continue;
      for (const t of a.targets) {
        const found = this.jsFile(a.exact ? t : normalize(t + spec.slice(a.prefix.length)));
        if (found) return found;
      }
    }
    return undefined;
  }

  private pyModule(from: string, dotted: string) {
    const rel = dotted.replace(/\./g, "/");
    return this.suffix(from, `${rel}.py`) ?? this.suffix(from, `${rel}/__init__.py`);
  }

  private py(from: string, imp: Import) {
    const out: Omit<Edge, "from" | "reexport">[] = [];
    const dots = /^\.*/.exec(imp.spec)![0].length;
    const rest = imp.spec.slice(dots);
    if (dots) {
      let dir = dirOf(from);
      for (let i = 1; i < dots; i++) dir = dirOf(dir);
      const base = rest ? join(dir, rest.replace(/\./g, "/")) : dir;
      const mod = rest ? this.firstFile([`${base}.py`, `${base}/__init__.py`]) : this.firstFile([`${base}/__init__.py`]);
      if (mod) out.push({ to: mod, ...(imp.names ? { names: imp.names } : {}) });
      // `from . import views`: each name may be a module of its own.
      for (const n of imp.names ?? []) {
        const sub = this.firstFile([`${base}/${n}.py`, `${base}/${n}/__init__.py`]);
        if (sub) out.push({ to: sub });
      }
      return out;
    }
    const mod = this.pyModule(from, rest);
    if (mod) out.push({ to: mod, ...(imp.names ? { names: imp.names } : {}) });
    for (const n of imp.names ?? []) {
      const sub = this.pyModule(from, `${rest}.${n}`);
      if (sub) out.push({ to: sub });
    }
    return out;
  }

  /** A Go import is a whole package: every non-test file in its folder. */
  private go(spec: string) {
    const m = this.modules.find((x) => spec === x.module || spec.startsWith(`${x.module}/`));
    if (!m) return [];
    const dir = normalize(`${m.dir}/${spec.slice(m.module.length)}`);
    return (this.byDir.get(dir) ?? []).filter((p) => p.endsWith(".go") && !p.endsWith("_test.go"));
  }

  private jvm(from: string, spec: string): Omit<Edge, "from" | "reexport">[] {
    const parts = spec.split(".");
    if (parts.at(-1) === "*") {
      const tail = parts.slice(0, -1).join("/");
      const dirs = [...this.byDir.keys()].filter((d) => d === tail || d.endsWith(`/${tail}`));
      const dir = dirs.sort((a, b) => shared(b, from) - shared(a, from))[0];
      return dir ? (this.byDir.get(dir) ?? []).filter((p) => /\.(java|kt|kts|scala)$/.test(p)).map((to) => ({ to })) : [];
    }
    for (const ext of [".java", ".kt", ".scala"]) {
      const hit = this.suffix(from, `${parts.join("/")}${ext}`);
      if (hit) return [{ to: hit }];
    }
    // `import a.b.C.method` (static) or a Kotlin top-level function: the class or package one level up.
    const owner = parts.slice(0, -1);
    for (const ext of [".java", ".kt", ".scala"]) {
      const hit = this.suffix(from, `${owner.join("/")}${ext}`);
      if (hit) return [{ to: hit, names: [parts.at(-1)!] }];
    }
    return [];
  }

  private rust(from: string, spec: string) {
    const dir = dirOf(from);
    const file = baseOf(from);
    // Submodules of foo.rs live in foo/; of mod.rs, lib.rs and main.rs, next to it.
    const moduleDir = ["mod.rs", "lib.rs", "main.rs"].includes(file) ? dir : join(dir, file.replace(/\.rs$/, ""));
    const tryPath = (base: string, segs: string[]) => {
      for (let n = segs.length; n > 0; n--) {
        const p = join(base, segs.slice(0, n).join("/"));
        const hit = this.firstFile([`${p}.rs`, `${p}/mod.rs`]);
        if (hit) return hit;
      }
      return undefined;
    };
    if (spec.startsWith("mod:")) return tryPath(moduleDir, [spec.slice(4)]);
    const [head, ...segs] = spec.split("::");
    if (head === "crate") {
      const at = from.lastIndexOf("src/");
      return tryPath(at >= 0 ? from.slice(0, at + 3) : "", segs);
    }
    if (head === "self") return tryPath(moduleDir, segs);
    if (head === "super") return tryPath(dirOf(moduleDir), segs);
    return undefined;
  }
}
