/**
 * Unit tests for the repository map: reading files, resolving imports, the
 * impact of a change, and reading tarballs. Compiles src/lib/codegraph on the
 * fly; no server, no GitHub, no AI.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
let out;
let impact;
let parse;
let tar;

before(() => {
  out = mkdtempSync(path.join(root, ".test-build-"));
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      path.join(root, "src", "lib", "codegraph", "impact.ts"),
      path.join(root, "src", "lib", "codegraph", "tar.ts"),
      "--outDir", out, "--rootDir", path.join(root, "src", "lib", "codegraph"),
      "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022",
      "--esModuleInterop", "--skipLibCheck", "--types", "node",
    ],
    { stdio: "pipe" },
  );
  const req = createRequire(import.meta.url);
  impact = req(path.join(out, "impact.js"));
  parse = req(path.join(out, "parse.js"));
  tar = req(path.join(out, "tar.js"));
});

after(() => rmSync(out, { recursive: true, force: true }));

/** A map from file texts. */
function graphOf(src, config = { aliases: {}, goModules: {} }) {
  const files = {};
  for (const [p, text] of Object.entries(src)) {
    const node = parse.parseFile(p, text);
    if (node) files[p] = node;
  }
  return { files, config };
}

const JS = {
  "src/a.ts": "export function foo() {\n  return 1;\n}\nexport function bar() {\n  return 2;\n}\n",
  "src/b.ts": 'import { foo } from "./a";\nexport const b = () => foo();\n',
  "src/c.ts": 'import { bar } from "@/a";\nbar();\n',
  "src/d.ts": 'import * as A from "./a";\nA.foo();\n',
  "src/e.ts": 'import { b } from "./b";\nb();\n',
  "src/old.ts": '// import { foo } from "./a";\n',
};
const ALIAS = { aliases: { "tsconfig.json": [{ root: "", prefix: "@/", targets: ["src/"] }] }, goModules: {} };

describe("parse", () => {
  test("JavaScript imports, names and default exports", () => {
    const n = parse.parseFile("x.ts", 'import React, { useState as s, type FC } from "react";\nexport { a } from "./a";\nconst m = require("./m");\nexport default function App() {}\n');
    assert.deepEqual(n.imports.find((i) => i.spec === "react").names, ["useState", "FC", "default"]);
    assert.deepEqual(n.imports.find((i) => i.spec === "./a"), { spec: "./a", names: ["a"], reexport: true });
    assert.ok(n.imports.some((i) => i.spec === "./m" && !i.names));
    assert.deepEqual(n.defs.find((d) => d.name === "App"), { name: "App", line: 4, kind: "function", default: true });
  });

  test("commented-out imports don't count", () => {
    assert.equal(parse.parseFile("src/old.ts", JS["src/old.ts"]).imports.length, 0);
  });

  test("Python, Go and tsconfig aliases", () => {
    const py = parse.parseFile("app/views.py", "from .models import (User,\n  Order)\nimport os, app.utils as u\n");
    assert.deepEqual(py.imports[0], { spec: ".models", names: ["User", "Order"] });
    assert.ok(py.imports.some((i) => i.spec === "app.utils"));
    const go = parse.parseFile("cmd/main.go", 'import (\n  "fmt"\n  api "example.com/x/internal/api"\n)\nfunc main() {}\n');
    assert.deepEqual(go.imports.map((i) => i.spec), ["fmt", "example.com/x/internal/api"]);
    assert.deepEqual(parse.tsconfigAliases("frontend/tsconfig.json", '{ // c\n "compilerOptions": { "paths": { "@/*": ["./src/*"] } },\n}'), [
      { root: "frontend/", prefix: "@/", targets: ["frontend/src/"] },
    ]);
  });

  test("vendored and generated files are left out", () => {
    assert.equal(parse.langOf("node_modules/x/index.js"), undefined);
    assert.equal(parse.langOf("types/global.d.ts"), undefined);
    assert.equal(parse.langOf("src/App.tsx"), "js");
  });
});

describe("impact", () => {
  test("a change to one function reaches only the files that use it", () => {
    const g = graphOf(JS, ALIAS);
    const r = impact.analyze(g, [{ filename: "src/a.ts", status: "modified", patch: "@@ -1,3 +1,3 @@\n export function foo() {\n-  return 1;\n+  return 3;\n }" }]);
    assert.deepEqual(r.changed[0].symbols, ["foo"]);
    assert.deepEqual(r.direct, [{ file: "src/b.ts", uses: ["foo"] }, { file: "src/d.ts", uses: ["foo"] }]);
    assert.deepEqual(r.indirect, [{ file: "src/e.ts", depth: 2, via: "src/b.ts" }]);
    assert.equal(r.totalFiles, 3);
    assert.equal(r.reach, "contained");
    assert.ok(r.edges.some(([from, to]) => from === "src/b.ts" && to === "src/a.ts"));
  });

  test("removing a function flags the files that still import it", () => {
    const g = graphOf(JS, ALIAS);
    const r = impact.analyze(g, [{ filename: "src/a.ts", status: "modified", patch: "@@ -4,3 +4,0 @@\n-export function bar() {\n-  return 2;\n-}" }]);
    assert.deepEqual(r.changed[0].removed, ["bar"]);
    assert.deepEqual(r.broken, [{ file: "src/c.ts", names: ["bar"], from: "src/a.ts" }]);
    assert.ok(impact.impactText(r).includes("src/c.ts (bar)"));
  });

  test("a deleted file breaks everyone who imports it, unless they changed too", () => {
    const g = graphOf(JS, ALIAS);
    const r = impact.analyze(g, [
      { filename: "src/b.ts", status: "removed" },
      { filename: "src/a.ts", status: "modified" },
    ]);
    assert.deepEqual(r.broken.map((b) => b.file), ["src/e.ts"]);
  });

  test("Python relative imports and Go packages", () => {
    const g = graphOf(
      {
        "app/models.py": "class User:\n    pass\n",
        "app/views.py": "from .models import User\n",
        "go.mod": "",
        "internal/api/api.go": "package api\nfunc Serve() {}\n",
        "cmd/main.go": 'package main\nimport "example.com/x/internal/api"\nfunc main() { api.Serve() }\n',
      },
      { aliases: {}, goModules: { "go.mod": "example.com/x" } },
    );
    const py = impact.analyze(g, [{ filename: "app/models.py", status: "modified", patch: "@@ -1,2 +1,2 @@\n class User:\n-    pass\n+    x = 1" }]);
    assert.deepEqual(py.direct, [{ file: "app/views.py", uses: ["User"] }]);
    const go = impact.analyze(g, [{ filename: "internal/api/api.go", status: "modified", patch: "@@ -2 +2 @@\n-func Serve() {}\n+func Serve() { log() }" }]);
    assert.deepEqual(go.direct.map((d) => d.file), ["cmd/main.go"]);
  });

  test("nothing depends on it: reach none, no text for the model", () => {
    const g = graphOf(JS, ALIAS);
    const r = impact.analyze(g, [{ filename: "src/e.ts", status: "modified", patch: "@@ -2 +2 @@\n-b();\n+b(); b();" }]);
    assert.equal(r.reach, "none");
    assert.equal(impact.impactText(r), "");
  });
});

describe("tar", () => {
  /** A ustar entry; `pax` adds a pax header carrying a long path first. */
  function entry(name, body, { type = "0", pax } = {}) {
    const blocks = [];
    if (pax) {
      const rec = (k, v) => {
        const line = ` ${k}=${v}\n`;
        let len = line.length + 1;
        while (String(len).length + line.length !== len) len = String(len).length + line.length;
        return `${len}${line}`;
      };
      blocks.push(...entry("PaxHeader", rec("path", pax), { type: "x" }));
    }
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 100), 0);
    h.write(body.length.toString(8).padStart(11, "0"), 124);
    h.write(type, 156);
    h.write("ustar", 257);
    blocks.push(h);
    const data = Buffer.from(body);
    blocks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
    return blocks;
  }

  test("keeps wanted files, follows pax long names, works in small chunks", () => {
    const long = `repo-sha/${"deep/".repeat(30)}x.ts`;
    const archive = Buffer.concat([
      ...entry("repo-sha/", "", { type: "5" }),
      ...entry("repo-sha/a.ts", "export const a = 1;\n"),
      ...entry("repo-sha/big.bin", "z".repeat(2000)),
      ...entry("ignored", "export const x = 2;\n", { pax: long }),
      Buffer.alloc(1024),
    ]);
    const got = {};
    const r = new tar.TarReader((p) => p.endsWith(".ts"), (p, d) => (got[p] = d.toString()));
    for (let i = 0; i < archive.length; i += 100) r.push(archive.subarray(i, i + 100));
    assert.deepEqual(Object.keys(got), ["repo-sha/a.ts", long]);
    assert.equal(got[long], "export const x = 2;\n");
    assert.ok(r.done);
  });
});
