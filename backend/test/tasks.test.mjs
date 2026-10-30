/**
 * Tasks: the board, who sees and moves what, and linking changes to tasks.
 * Task keys in commit messages are unit-tested from src/lib/task-keys.ts; the
 * rest runs against an isolated server with the sample team.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { startServer } from "./server.mjs";

const root = path.resolve(import.meta.dirname, "..");

describe("task keys in commit messages", () => {
  let out;
  let k;
  before(() => {
    out = mkdtempSync(path.join(root, ".test-build-"));
    execFileSync(
      process.execPath,
      [path.join(root, "node_modules", "typescript", "bin", "tsc"), path.join(root, "src", "lib", "task-keys.ts"), "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"],
      { stdio: "pipe" },
    );
    k = createRequire(import.meta.url)(path.join(out, "task-keys.js"));
  });
  after(() => rmSync(out, { recursive: true, force: true }));

  test("finds every key once, upper case, and the ones it closes", () => {
    const r = k.keysIn("ROS-12: rotate servers\n\nAlso fixes ROS-3, ros-4 and ROS-5. Mentions ROS-12 again and UTF-8.");
    assert.deepEqual(r.keys, ["ROS-12", "ROS-3", "ROS-4", "ROS-5", "UTF-8"]);
    assert.deepEqual(r.closes, ["ROS-3", "ROS-4", "ROS-5"]);
    assert.deepEqual(k.keysIn("Closes: #PAY-9").closes, ["PAY-9"]);
    assert.deepEqual(k.keysIn("no keys here").keys, []);
  });

  test("prefixes from a workspace name", () => {
    assert.equal(k.defaultPrefix("Rosetta"), "ROS");
    assert.equal(k.defaultPrefix("Data Jugaad"), "DJ");
    assert.equal(k.defaultPrefix("!!!"), "TSK");
    assert.equal(k.normalizeKey(" ros-12 "), "ROS-12");
    assert.equal(k.normalizeKey("ROS 12"), null);
  });
});

describe("tasks API", () => {
  let server;
  let req;
  const T = {};
  const ids = {};

  before(async () => {
    server = await startServer();
    req = server.req;
    const owner = await req("POST", "/api/auth/signup", { name: "Kavya Rao", email: "kavya@rosetta.test", password: "pass-word-1", role: "cmo", orgName: "Rosetta", acceptTerms: true });
    T.cmo = owner.data.token;
    const seed = (await req("POST", "/api/demo/seed", undefined, T.cmo)).data;
    for (const name of ["Neha", "Arjun", "Rahul"]) {
      const l = seed.logins.find((x) => x.name.startsWith(name));
      T[name.toLowerCase()] = (await req("POST", "/api/auth/login", { email: l.email, password: seed.password })).data.token;
    }
    const team = (await req("GET", "/api/team", undefined, T.cmo)).data;
    for (const m of team.members) ids[m.name.split(" ")[0].toLowerCase()] = m.id;
  });
  after(() => server?.stop());

  const board = async (who, q = "") => (await req("GET", `/api/tasks${q}`, undefined, T[who])).data;
  const create = (who, body) => req("POST", "/api/tasks", body, T[who]);

  test("keys come from the workspace name and count up", async () => {
    const a = await create("neha", { title: "Spread load across 3 servers", assigneeId: ids.arjun, priority: "high" });
    assert.equal(a.status, 201);
    assert.equal(a.data.task.key, "ROS-1");
    assert.equal(a.data.task.status, "todo");
    assert.equal(a.data.task.assignee.id, ids.arjun);
    const b = await create("arjun", { title: "Write the retry docs" });
    assert.equal(b.data.task.key, "ROS-2");
    assert.equal(b.data.task.assignee.id, ids.arjun, "an engineer's task is theirs");
    assert.equal((await board("cmo")).prefix, "ROS");
  });

  test("who sees what", async () => {
    assert.deepEqual((await board("arjun")).tasks.map((t) => t.key).sort(), ["ROS-1", "ROS-2"]);
    assert.equal((await board("rahul")).tasks.length, 0, "another engineer sees none of Arjun's");
    assert.equal((await board("neha")).tasks.length, 2, "his manager sees both");
    const cmo = (await board("cmo")).tasks.find((t) => t.key === "ROS-1");
    assert.deepEqual(cmo.can, { edit: false, move: false, assign: false, delete: false }, "the CMO reads, unless they made it");
    assert.equal((await req("GET", "/api/tasks/ROS-1", undefined, T.rahul)).status, 404);
  });

  test("engineers move their own tasks; leads assign", async () => {
    const moved = await req("PATCH", "/api/tasks/ROS-1", { status: "in_review", order: 5 }, T.arjun);
    assert.equal(moved.status, 200);
    assert.equal(moved.data.task.status, "in_review");
    assert.equal(moved.data.task.movedBy, "person");
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { assigneeId: ids.rahul }, T.arjun)).status, 403);
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { title: "x" }, T.cmo)).status, 403);
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { assigneeId: null, priority: "urgent", status: "todo" }, T.neha)).status, 200);
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { assigneeId: ids.arjun }, T.neha)).data.task.assignee.id, ids.arjun);
    assert.equal((await create("arjun", { title: "Not mine", assigneeId: ids.rahul })).status, 403);
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { status: "nope" }, T.neha)).status, 400);
  });

  test("linking a change by hand moves the task and explains it at each level", async () => {
    const card = (await req("GET", "/api/feed", undefined, T.arjun)).data.items[0];
    const asArjun = (await req("GET", `/api/cards/${card.id}`, undefined, T.arjun)).data;
    assert.equal(asArjun.viewer.canLinkTasks, true);
    assert.deepEqual(asArjun.tasks, []);
    assert.equal((await req("POST", `/api/cards/${card.id}/tasks`, { key: "ROS-999" }, T.arjun)).status, 404);
    assert.equal((await req("POST", `/api/cards/${card.id}/tasks`, { key: "ROS-1" }, T.rahul)).status, 404, "not his change");

    const linked = await req("POST", `/api/cards/${card.id}/tasks`, { key: "ros-1" }, T.arjun);
    assert.equal(linked.status, 200);
    assert.deepEqual(linked.data.tasks.map((t) => [t.key, t.status]), [["ROS-1", "in_progress"]]);

    const task = (await req("GET", "/api/tasks/ROS-1", undefined, T.neha)).data.task;
    assert.equal(task.status, "in_progress");
    assert.equal(task.movedBy, "rosetta");
    assert.equal(task.commits.length, 1);
    assert.doesNotMatch(task.commits[0].summary, /pickNextServer|servers\[/, "the manager reads it in plain words");
    assert.equal(task.progress.summary, task.commits[0].summary);
    const eng = (await req("GET", "/api/tasks/ROS-1", undefined, T.arjun)).data.task;
    assert.match(eng.commits[0].summary, /pickNextServer/, "the engineer in code terms");

    const notes = (await req("GET", "/api/notifications", undefined, T.neha)).data.items;
    assert.ok(notes.some((n) => n.kind === "task" && n.href === "/app/tasks/ROS-1"), "his manager hears Rosetta moved it");

    const unlinked = await req("DELETE", `/api/cards/${card.id}/tasks`, { key: "ROS-1" }, T.arjun);
    assert.deepEqual(unlinked.data.tasks, []);
    assert.equal((await req("GET", "/api/tasks/ROS-1", undefined, T.neha)).data.task.status, "in_progress", "the task keeps its column");
    await req("POST", `/api/cards/${card.id}/tasks`, { key: "ROS-1" }, T.arjun);
  });

  test("clients see only shared tasks, read-only", async () => {
    const add = await req("POST", "/api/team/members", { name: "Cara Client", email: "cara@rosetta.test", role: "client" }, T.neha);
    const joined = (await req("POST", "/api/auth/join", { code: add.data.inviteCode, password: "pass-word-1", acceptTerms: true })).data;
    T.client = joined.token;
    assert.equal((await board("client")).tasks.length, 0);
    assert.equal((await board("client")).canCreate, false);
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { sharedWithClient: true }, T.arjun)).status, 403, "sharing is for leads");
    await req("PATCH", "/api/tasks/ROS-1", { sharedWithClient: true }, T.neha);
    const seen = (await board("client")).tasks;
    assert.deepEqual(seen.map((t) => t.key), ["ROS-1"]);
    const linked = (await req("GET", "/api/tasks/ROS-1", undefined, T.neha)).data.task.commits[0];
    assert.equal(seen[0].commitCount, linked.status === "approved" ? 1 : 0, "a client sees linked work only once it's reviewed");
    assert.equal((await req("PATCH", "/api/tasks/ROS-1", { status: "done" }, T.client)).status, 403);
    assert.equal((await create("client", { title: "x" })).status, 403);
  });

  test("filters, deleting and the prefix", async () => {
    assert.deepEqual((await board("neha", "?q=retry")).tasks.map((t) => t.key), ["ROS-2"]);
    assert.deepEqual((await board("neha", "?priority=urgent")).tasks.map((t) => t.key), ["ROS-1"]);
    assert.equal((await req("DELETE", "/api/tasks/ROS-1", undefined, T.arjun)).status, 403, "made by his manager");
    const card = (await req("GET", "/api/feed", undefined, T.arjun)).data.items[0];
    assert.equal((await req("DELETE", "/api/tasks/ROS-1", undefined, T.neha)).status, 200);
    assert.deepEqual((await req("GET", `/api/cards/${card.id}`, undefined, T.arjun)).data.tasks, [], "the change forgets it");

    assert.equal((await req("PATCH", "/api/org", { taskPrefix: "x" }, T.cmo)).status, 400);
    assert.equal((await req("PATCH", "/api/org", { taskPrefix: "web" }, T.cmo)).data.org.taskPrefix, "WEB");
    assert.equal((await create("neha", { title: "New prefix" })).data.task.key, "WEB-3");
    assert.equal((await req("GET", "/api/tasks/ROS-2", undefined, T.arjun)).status, 200, "older keys still work");
  });
});
