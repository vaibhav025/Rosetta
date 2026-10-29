"use client";

import type { EditableField, LevelText } from "@/lib/types";
import { Editable } from "./editable";

type Props = {
  level: LevelText;
  levelLabel: string;
  fileCount: number;
  editable: boolean;
  onEdit: (field: EditableField, value: string) => void;
  /** Written for this reader from their profile. */
  note?: { name: string; text: string };
};

/** Solid reading surface: summary → analogy → what changes → files, at one reader's level. */
export function StoryCard({ level, levelLabel, fileCount, editable, onEdit, note }: Props) {
  return (
    <article className="flex h-full flex-col rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      {note && (
        <div className="mb-8 max-w-[66ch] rounded-sm bg-surface-2 px-4 py-3">
          <p className="t-small text-fg-3">For you, {note.name}</p>
          <p className="mt-1 t-body text-fg-1">{note.text}</p>
        </div>
      )}
      <div className="max-w-[66ch]">
        <Editable
          value={level.summary}
          editable={editable}
          label={`Summary for ${levelLabel}`}
          onCommit={(v) => onEdit("summary", v)}
          className="t-summary text-pretty text-fg-1"
        />
        <div className="relative mt-6 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-full before:bg-accent">
          <Editable
            value={level.analogy}
            editable={editable}
            label={`Analogy for ${levelLabel}`}
            onCommit={(v) => onEdit("analogy", v)}
            className="t-body text-fg-2"
          />
        </div>
        <h2 className="mt-6 t-heading text-fg-1">What changes</h2>
        <div className="mt-2">
          <Editable
            value={level.impact}
            editable={editable}
            label={`What changes for ${levelLabel}`}
            onCommit={(v) => onEdit("impact", v)}
            className="t-body text-fg-2"
          />
        </div>
      </div>
      <a
        href="#files"
        className="mt-auto self-start pt-6 t-small font-medium text-fg-2 underline decoration-(--ring-strong) underline-offset-4 transition-[color,text-decoration-color] duration-150 hover:text-fg-1 hover:decoration-current"
      >
        {fileCount === 1 ? "1 file changed" : `${fileCount} files changed`}
      </a>
    </article>
  );
}
