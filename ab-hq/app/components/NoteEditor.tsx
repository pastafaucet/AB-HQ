"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import type { NoteDoc, NotesPageData } from "@/lib/queries";
import type { NotePatch, NoteTargetType } from "@/app/(app)/note-actions";

interface MentionItem {
  id: string;
  label: string;
  type: NoteTargetType;
  sub?: string;
}

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function fmtNoteDate(iso: string): string {
  const d = new Date(iso);
  return `${DOW[d.getDay()]} · ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function NoteEditor({
  note,
  matters,
  people,
  tasks,
  onPatch,
  onDelete,
  onAddLink,
  onRemoveLink,
}: {
  note: NoteDoc;
  matters: NotesPageData["matters"];
  people: NotesPageData["people"];
  tasks: NotesPageData["tasks"];
  onPatch: (patch: NotePatch) => void;
  onDelete: () => void;
  onAddLink: (type: NoteTargetType, id: string) => void;
  onRemoveLink: (linkId: string) => void;
}) {
  const [linkType, setLinkType] = useState<NoteTargetType>("matter");
  const [linkTarget, setLinkTarget] = useState("");

  // Mention data must be reachable from the (non-React) suggestion plugin.
  const mentionPool = useRef<MentionItem[]>([]);
  useEffect(() => {
    mentionPool.current = [
      ...matters.map((m) => ({
        id: m.id,
        label: m.name,
        type: "matter" as const,
        sub: m.closed ? "closed case" : "case",
      })),
      ...people.map((p) => ({
        id: p.id,
        label: p.name,
        type: "person" as const,
        sub: p.org ?? "person",
      })),
    ];
  }, [matters, people]);
  const onAddLinkRef = useRef(onAddLink);
  onAddLinkRef.current = onAddLink;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Details.configure({ persist: true, HTMLAttributes: { class: "note-toggle" } }),
      DetailsSummary,
      DetailsContent,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Write… (@ to link a case or person)" }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase();
            return mentionPool.current
              .filter((i) => i.label.toLowerCase().includes(q))
              .slice(0, 7);
          },
          render: mentionDropdown,
          command: ({ editor, range, props }) => {
            const item = props as unknown as MentionItem;
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "mention",
                  attrs: { id: `${item.type}:${item.id}`, label: item.label },
                },
                { type: "text", text: " " },
              ])
              .run();
            onAddLinkRef.current(item.type, item.id);
          },
        },
      }),
    ],
    content: (note.bodyJson as object | null) ?? "",
    onUpdate: ({ editor }) => {
      onPatch({ bodyJson: editor.getJSON(), bodyText: editor.getText() });
    },
  });

  function btn(
    label: string,
    action: (e: Editor) => void,
    isActive?: (e: Editor) => boolean,
    title?: string
  ) {
    if (!editor) return null;
    return (
      <button
        type="button"
        className={`ed-btn${isActive?.(editor) ? " is-on" : ""}`}
        title={title}
        onMouseDown={(ev) => {
          ev.preventDefault();
          action(editor);
        }}
      >
        {label}
      </button>
    );
  }

  function submitLink() {
    if (!linkTarget) return;
    onAddLink(linkType, linkTarget);
    setLinkTarget("");
  }

  const linkOptions =
    linkType === "matter" ? matters.map((m) => ({ id: m.id, label: m.closed ? `${m.name} (closed)` : m.name }))
    : linkType === "person" ? people.map((p) => ({ id: p.id, label: p.org ? `${p.name} — ${p.org}` : p.name }))
    : tasks.map((t) => ({ id: t.id, label: t.title }));

  return (
    <div className="note-editor">
      <div className="note-ed-head">
        <span className="note-date">{fmtNoteDate(note.createdAt)}</span>
        <span className="head-spacer" />
        <button
          type="button"
          className={`note-pin${note.pinned ? " is-on" : ""}`}
          title={note.pinned ? "Unpin" : "Pin to top"}
          onClick={() => onPatch({ pinned: !note.pinned })}
        >
          {note.pinned ? "★ PINNED" : "☆ PIN"}
        </button>
        <button type="button" className="note-delete" title="Delete note" onClick={onDelete}>
          Delete
        </button>
      </div>

      <input
        className="note-title-input"
        placeholder="Untitled note…"
        value={note.title ?? ""}
        onChange={(e) => onPatch({ title: e.target.value || null })}
      />

      <div className="note-links">
        {note.links.map((l) => (
          <span key={l.linkId} className={`note-chip nc-${l.type}`}>
            {l.label}
            <button
              type="button"
              className="note-chip-x"
              title="Unlink"
              onClick={() => onRemoveLink(l.linkId)}
            >
              ✕
            </button>
          </span>
        ))}
        <span className="note-link-add">
          <select
            className="dw-select"
            value={linkType}
            onChange={(e) => {
              setLinkType(e.target.value as NoteTargetType);
              setLinkTarget("");
            }}
          >
            <option value="matter">Case</option>
            <option value="person">Person</option>
            <option value="task">Task</option>
          </select>
          <select
            className="dw-select note-link-target"
            value={linkTarget}
            onChange={(e) => setLinkTarget(e.target.value)}
          >
            <option value="">Link to…</option>
            {linkOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="ed-btn" onClick={submitLink}>
            + Link
          </button>
        </span>
      </div>

      {editor && (
        <div className="note-toolbar">
          {btn("B", (e) => e.chain().focus().toggleBold().run(), (e) => e.isActive("bold"), "Bold (⌘B)")}
          {btn("I", (e) => e.chain().focus().toggleItalic().run(), (e) => e.isActive("italic"), "Italic (⌘I)")}
          {btn("U", (e) => e.chain().focus().toggleUnderline().run(), (e) => e.isActive("underline"), "Underline (⌘U)")}
          {btn("S", (e) => e.chain().focus().toggleStrike().run(), (e) => e.isActive("strike"), "Strikethrough")}
          <span className="ed-sep" />
          {btn("H1", (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), (e) => e.isActive("heading", { level: 1 }))}
          {btn("H2", (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), (e) => e.isActive("heading", { level: 2 }))}
          {btn("H3", (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), (e) => e.isActive("heading", { level: 3 }))}
          <span className="ed-sep" />
          {btn("• List", (e) => e.chain().focus().toggleBulletList().run(), (e) => e.isActive("bulletList"))}
          {btn("1. List", (e) => e.chain().focus().toggleOrderedList().run(), (e) => e.isActive("orderedList"))}
          {btn("☑ Tasks", (e) => e.chain().focus().toggleTaskList().run(), (e) => e.isActive("taskList"))}
          <span className="ed-sep" />
          {btn("❝ Quote", (e) => e.chain().focus().toggleBlockquote().run(), (e) => e.isActive("blockquote"))}
          {btn("▸ Toggle", (e) => e.chain().focus().setDetails().run(), (e) => e.isActive("details"), "Collapsible section")}
          {btn("―", (e) => e.chain().focus().setHorizontalRule().run(), undefined, "Divider")}
        </div>
      )}

      <EditorContent editor={editor} className="note-body" />
    </div>
  );
}

// ---- lightweight mention dropdown (no external positioning lib) ----
type SuggestionProps = {
  items: MentionItem[];
  command: (item: MentionItem) => void;
  clientRect?: (() => DOMRect | null) | null;
};

function mentionDropdown() {
  let el: HTMLDivElement | null = null;
  let currentItems: MentionItem[] = [];
  let selected = 0;
  let currentCommand: ((item: MentionItem) => void) | null = null;

  function renderItems() {
    if (!el) return;
    el.innerHTML = "";
    currentItems.forEach((item, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `mention-item${i === selected ? " is-sel" : ""}`;
      row.innerHTML = `<span class="mi-label"></span><span class="mi-sub"></span>`;
      (row.children[0] as HTMLElement).textContent = item.label;
      (row.children[1] as HTMLElement).textContent = item.sub ?? "";
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        currentCommand?.(item);
      });
      el!.appendChild(row);
    });
    if (currentItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mention-empty";
      empty.textContent = "No matches";
      el.appendChild(empty);
    }
  }

  function position(rect: DOMRect | null | undefined) {
    if (!el || !rect) return;
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom + 6}px`;
  }

  return {
    onStart: (props: SuggestionProps) => {
      el = document.createElement("div");
      el.className = "mention-dropdown";
      document.body.appendChild(el);
      currentItems = props.items;
      currentCommand = props.command;
      selected = 0;
      renderItems();
      position(props.clientRect?.());
    },
    onUpdate: (props: SuggestionProps) => {
      currentItems = props.items;
      currentCommand = props.command;
      if (selected >= currentItems.length) selected = 0;
      renderItems();
      position(props.clientRect?.());
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowDown") {
        selected = (selected + 1) % Math.max(1, currentItems.length);
        renderItems();
        return true;
      }
      if (event.key === "ArrowUp") {
        selected = (selected - 1 + Math.max(1, currentItems.length)) % Math.max(1, currentItems.length);
        renderItems();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (currentItems[selected]) currentCommand?.(currentItems[selected]);
        return true;
      }
      if (event.key === "Escape") {
        el?.remove();
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}
