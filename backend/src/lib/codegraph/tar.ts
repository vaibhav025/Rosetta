/**
 * Reads a tar stream (GitHub's repository tarball, after gunzip) one entry at
 * a time and keeps only the files asked for, so a big repository is never in
 * memory whole. Handles ustar names with a prefix, pax headers (long paths)
 * and GNU long names; everything else (folders, links) is skipped.
 */

type Body = { kind: "file" | "pax" | "gnu" | "skip"; path: string; left: number; pad: number; parts: Buffer[] };

const text = (h: Buffer, from: number, to: number) => {
  const s = h.toString("utf8", from, to);
  const end = s.indexOf("\0");
  return end >= 0 ? s.slice(0, end) : s;
};

export class TarReader {
  private buf: Buffer = Buffer.alloc(0);
  private body: Body | null = null;
  /** A long path from a pax or GNU entry, for the next file. */
  private longName: string | null = null;
  done = false;

  constructor(
    /** Whether to keep a file of this size; skipped ones are never buffered. */
    private want: (path: string, size: number) => boolean,
    private onFile: (path: string, data: Buffer) => void,
  ) {}

  push(chunk: Buffer) {
    if (this.done) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (!this.done && this.step());
  }

  /** Moves on by one header or one body; false when it needs more bytes. */
  private step(): boolean {
    const b = this.body;
    if (b) {
      if (b.left > 0) {
        if (!this.buf.length) return false;
        const n = Math.min(b.left, this.buf.length);
        if (b.kind !== "skip") b.parts.push(this.buf.subarray(0, n));
        this.buf = this.buf.subarray(n);
        b.left -= n;
        if (b.left > 0) return false;
      }
      if (b.pad > 0) {
        const n = Math.min(b.pad, this.buf.length);
        this.buf = this.buf.subarray(n);
        b.pad -= n;
        if (b.pad > 0) return false;
      }
      this.body = null;
      this.finish(b);
      return true;
    }

    if (this.buf.length < 512) return false;
    const h = this.buf.subarray(0, 512);
    this.buf = this.buf.subarray(512);
    // An all-zero block marks the end of the archive.
    if (h.every((x) => x === 0)) {
      this.done = true;
      return false;
    }
    const size = parseInt(text(h, 124, 136).trim() || "0", 8) || 0;
    const type = h[156] === 0 ? "0" : String.fromCharCode(h[156]);
    const ustar = h.toString("latin1", 257, 262) === "ustar";
    const prefix = ustar ? text(h, 345, 500) : "";
    const name = text(h, 0, 100);
    let kind: Body["kind"] = "skip";
    let path = prefix ? `${prefix}/${name}` : name;
    if (type === "x") kind = "pax";
    else if (type === "L") kind = "gnu";
    else if (type === "g") kind = "skip";
    else {
      if (this.longName !== null) path = this.longName;
      this.longName = null;
      if ((type === "0" || type === "7") && this.want(path, size)) kind = "file";
    }
    this.body = { kind, path, left: size, pad: (512 - (size % 512)) % 512, parts: [] };
    return true;
  }

  private finish(b: Body) {
    if (b.kind === "skip") return;
    const data = Buffer.concat(b.parts);
    if (b.kind === "file") this.onFile(b.path, data);
    else if (b.kind === "pax") {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString("utf8"));
      if (m) this.longName = m[1];
    } else this.longName = text(data, 0, data.length);
  }
}
