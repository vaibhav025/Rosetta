import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Document storage. Firestore when FIREBASE_* is set, otherwise a JSON file
 * in .data/ so the backend runs locally with no setup.
 */

export type Collection =
  | "orgs"
  | "users"
  | "invites"
  | "cards"
  | "explanations"
  | "notes"
  | "comments"
  | "tickets"
  | "resets"
  | "usage"
  | "notifications"
  | "checks"
  | "deleted"
  | "jobs";

interface Store {
  get<T>(collection: Collection, id: string): Promise<T | null>;
  set<T extends object>(collection: Collection, id: string, data: T): Promise<void>;
  remove(collection: Collection, id: string): Promise<void>;
  /** Every document where `field` equals `value` (one equality filter). */
  list<T>(collection: Collection, field: string, value: string): Promise<T[]>;
  /** Every document in a collection. Only for small ones, like orgs in the weekly job. */
  all<T>(collection: Collection): Promise<T[]>;
}

class FirestoreStore implements Store {
  private db: Promise<import("firebase-admin/firestore").Firestore>;

  constructor() {
    this.db = (async () => {
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const app =
        getApps()[0] ??
        initializeApp({
          credential: cert({
            projectId: env.firebaseProjectId,
            clientEmail: env.firebaseClientEmail,
            privateKey: env.firebasePrivateKey,
          }),
        });
      const db = getFirestore(app);
      // REST instead of gRPC: no long-lived channel to warm up or retry for ~20 s
      // when DNS or the network blips, and faster cold starts on serverless.
      db.settings({ ignoreUndefinedProperties: true, preferRest: true });
      return db;
    })();
  }

  /**
   * Firestore can't hold arrays inside arrays (our flowchart edges are
   * [from, to] pairs), so each document is stored as JSON in `_json`, with
   * its top-level text, number and boolean fields copied alongside for queries.
   */
  private encode(data: object) {
    const fields: Record<string, unknown> = { _json: JSON.stringify(data) };
    for (const [key, value] of Object.entries(data)) {
      if (["string", "number", "boolean"].includes(typeof value)) fields[key] = value;
    }
    return fields;
  }

  private decode<T>(raw: Record<string, unknown> | undefined): T | null {
    if (!raw) return null;
    return (typeof raw._json === "string" ? JSON.parse(raw._json) : raw) as T;
  }

  async get<T>(collection: Collection, id: string) {
    const snap = await (await this.db).collection(collection).doc(id).get();
    return snap.exists ? this.decode<T>(snap.data()) : null;
  }

  async set<T extends object>(collection: Collection, id: string, data: T) {
    await (await this.db).collection(collection).doc(id).set(this.encode(data));
  }

  async remove(collection: Collection, id: string) {
    await (await this.db).collection(collection).doc(id).delete();
  }

  async list<T>(collection: Collection, field: string, value: string) {
    const snap = await (await this.db).collection(collection).where(field, "==", value).get();
    return snap.docs.map((d) => this.decode<T>(d.data())!);
  }

  async all<T>(collection: Collection) {
    const snap = await (await this.db).collection(collection).get();
    return snap.docs.map((d) => this.decode<T>(d.data())!);
  }
}

class FileStore implements Store {
  private file = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "store.json");
  private data: Record<string, Record<string, unknown>> = {};
  /** The file's mtime when we last read or wrote it, to notice writes by another process. */
  private mtime = 0;
  /** Changes are waiting to be written. */
  private dirty = false;

  constructor() {
    // A write still waiting for its turn of the event loop isn't lost when the process ends.
    process.once("exit", () => {
      if (!this.dirty) return;
      this.dirty = false;
      try {
        this.flush();
      } catch {
        // Nothing more to do while exiting.
      }
    });
    if (!existsSync(this.file)) return;
    try {
      this.mtime = statSync(this.file).mtimeMs;
      this.data = JSON.parse(readFileSync(this.file, "utf8"));
    } catch (error) {
      // A damaged file is set aside rather than stopping every start.
      const aside = `${this.file}.corrupt-${Date.now()}`;
      try {
        renameSync(this.file, aside);
      } catch {
        // Couldn't move it: the next write replaces it.
      }
      console.error(`[rosetta] ${this.file} could not be read; moved it to ${aside} and started empty.`, error);
      this.data = {};
      this.mtime = 0;
    }
  }

  /** Picks up writes from another process (a second server, a script) when nothing of ours is pending. */
  private refresh() {
    if (this.dirty) return;
    try {
      const mtime = statSync(this.file).mtimeMs;
      if (mtime === this.mtime) return;
      this.data = JSON.parse(readFileSync(this.file, "utf8"));
      this.mtime = mtime;
    } catch {
      // Missing or unreadable: keep what's in memory.
    }
  }

  /** Writes a temp file and renames it over the store, so a crash never leaves half a file. */
  private flush() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const text = JSON.stringify(this.data, null, 2);
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    try {
      renameSync(tmp, this.file);
    } catch {
      // Windows can refuse to replace a file another program has open.
      writeFileSync(this.file, text);
    }
    this.mtime = statSync(this.file).mtimeMs;
  }

  /** Writes once per turn of the event loop, so deleting many documents in a row rewrites the file once. */
  private save() {
    if (this.dirty) return;
    this.dirty = true;
    setImmediate(() => {
      this.dirty = false;
      try {
        this.flush();
      } catch (error) {
        console.error("[rosetta] could not write the file store:", error);
      }
    });
  }

  async get<T>(collection: Collection, id: string) {
    this.refresh();
    const doc = this.data[collection]?.[id];
    return doc ? (structuredClone(doc) as T) : null;
  }

  async set<T extends object>(collection: Collection, id: string, data: T) {
    this.refresh();
    (this.data[collection] ??= {})[id] = JSON.parse(JSON.stringify(data));
    this.save();
  }

  async remove(collection: Collection, id: string) {
    this.refresh();
    if (!this.data[collection] || !(id in this.data[collection])) return;
    delete this.data[collection][id];
    this.save();
  }

  async list<T>(collection: Collection, field: string, value: string) {
    this.refresh();
    return Object.values(this.data[collection] ?? {})
      .filter((doc) => (doc as Record<string, unknown>)[field] === value)
      .map((doc) => structuredClone(doc) as T);
  }

  async all<T>(collection: Collection) {
    this.refresh();
    return Object.values(this.data[collection] ?? {}).map((doc) => structuredClone(doc) as T);
  }
}

const usingFirestore = Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);

const globalStore = globalThis as unknown as { __rosettaStore?: Store };
export const store: Store = (globalStore.__rosettaStore ??= usingFirestore ? new FirestoreStore() : new FileStore());
export const storeKind = usingFirestore ? "firestore" : "file";
