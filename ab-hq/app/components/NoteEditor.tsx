"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Mention from "@tiptap/extension-mention";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { PluginKey } from "@tiptap/pm/state";
import type { NoteDoc, NotesPageData } from "@/lib/queries";
import {
  startNoteImageUpload,
  type NotePatch,
  type NoteTargetType,
} from "@/app/(app)/note-actions";
import ConfirmButton from "./ConfirmButton";

interface MentionItem {
  id: string;
  label: string;
  type: NoteTargetType;
  sub?: string;
}

interface TagMentionItem {
  name: string;
  label: string;
  sub?: string;
}

// A second mention node type for #tags — must have its own name so it can
// coexist with the @ entity mention.
const TagMention = Mention.extend({ name: "tagMention" });

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
  allTags,
  onPatch,
  onDelete,
  onAddLink,
  onRemoveLink,
  onAddTag,
  onRemoveTag,
}: {
  note: NoteDoc;
  matters: NotesPageData["matters"];
  people: NotesPageData["people"];
  tasks: NotesPageData["tasks"];
  allTags: NotesPageData["allTags"];
  onPatch: (patch: NotePatch) => void;
  onDelete: () => void;
  onAddLink: (type: NoteTargetType, id: string) => void;
  onRemoveLink: (linkId: string) => void;
  onAddTag: (name: string) => void;
  onRemoveTag: (noteTagId: string) => void;
}) {
  const [linkType, setLinkType] = useState<NoteTargetType>("matter");
  const [linkTarget, setLinkTarget] = useState("");
  const [tagInput, setTagInput] = useState("");

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
  const tagPool = useRef<string[]>([]);
  useEffect(() => {
    tagPool.current = allTags.map((t) => t.name);
  }, [allTags]);
  const onAddTagRef = useRef(onAddTag);
  onAddTagRef.current = onAddTag;

  // Images: upload each file straight to storage, then insert it. With a drop
  // position the first image lands there; the rest follow the selection.
  const editorRef = useRef<Editor | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [imgError, setImgError] = useState<string | null>(null);

  async function insertImages(files: File[], pos?: number) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setImgError(null);
    setUploading((n) => n + images.length);
    for (const file of images) {
      try {
        const r = await startNoteImageUpload(file.type);
        if (!r.ok || !r.uploadUrl || !r.src) throw new Error(r.error);
        const put = await fetch(r.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type },
          body: file,
        });
        if (!put.ok) {
          throw new Error(put.status === 413 ? "That image is over 25 MB." : "Image upload failed. Try again.");
        }
        // A trailing paragraph puts the cursor below the image; otherwise the
        // image stays selected and the next keystroke replaces it.
        const node = [{ type: "image", attrs: { src: r.src } }, { type: "paragraph" }];
        const chain = editorRef.current?.chain().focus();
        if (pos != null) {
          chain?.insertContentAt(pos, node).run();
          pos = undefined;
        } else {
          chain?.insertContent(node).run();
        }
      } catch (e) {
        setImgError(e instanceof Error && e.message ? e.message : "Image upload failed. Try again.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

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
      Image.configure({
        HTMLAttributes: { class: "note-img" },
        resize: {
          enabled: true,
          directions: ["bottom-right", "bottom-left"],
          minWidth: 80,
          alwaysPreserveAspectRatio: true,
        },
      }),
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
      TagMention.configure({
        HTMLAttributes: { class: "tag-mention" },
        suggestion: {
          char: "#",
          pluginKey: new PluginKey("tagSuggestion"),
          items: ({ query }: { query: string }) => {
            const clean = query.trim().toLowerCase().replace(/\s+/g, "-");
            const hits: TagMentionItem[] = tagPool.current
              .filter((n) => n.includes(clean))
              .slice(0, 7)
              .map((n) => ({ name: n, label: `#${n}`, sub: "tag" }));
            if (clean && !tagPool.current.includes(clean)) {
              hits.push({ name: clean, label: `+ create #${clean}`, sub: "new" });
            }
            return hits;
          },
          render: mentionDropdown,
          command: ({ editor, range, props }) => {
            const item = props as unknown as TagMentionItem;
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: "tagMention", attrs: { id: item.name, label: item.name } },
                { type: "text", text: " " },
              ])
              .run();
            onAddTagRef.current(item.name);
          },
        },
      }),
    ],
    content: (note.bodyJson as object | null) ?? "",
    onUpdate: ({ editor }) => {
      // ProseMirror builds node attrs as null-prototype objects, which the
      // server-action encoder drops: images lost their src, mentions their
      // ids, task items their checked state. A JSON round-trip makes them
      // plain objects.
      onPatch({
        bodyJson: JSON.parse(JSON.stringify(editor.getJSON())),
        bodyText: editor.getText(),
      });
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const dt = event.clipboardData;
        const files = Array.from(dt?.files ?? []).filter((f) => f.type.startsWith("image/"));
        // Text riding along (Word, a web page selection) means a rich paste;
        // leave that to the default handler so the words aren't lost.
        if (!files.length || dt?.getData("text/plain")) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(files, pos);
        return true;
      },
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
          className={`note-pin note-flag-inbox${note.status === "Inbox" ? " is-on" : ""}`}
          title={note.status === "Inbox" ? "Mark processed" : "Flag as needs-processing"}
          onClick={() => onPatch({ status: note.status === "Inbox" ? "Active" : "Inbox" })}
        >
          INBOX
        </button>
        <button
          type="button"
          className={`note-pin note-flag-archive${note.status === "Archived" ? " is-on" : ""}`}
          title={note.status === "Archived" ? "Unarchive" : "Archive (hidden from All)"}
          onClick={() => onPatch({ status: note.status === "Archived" ? "Active" : "Archived" })}
        >
          {note.status === "Archived" ? "ARCHIVED" : "ARCHIVE"}
        </button>
        <button
          type="button"
          className={`note-pin${note.pinned ? " is-on" : ""}`}
          title={note.pinned ? "Unpin" : "Pin to top"}
          onClick={() => onPatch({ pinned: !note.pinned })}
        >
          {note.pinned ? "★ PINNED" : "☆ PIN"}
        </button>
        <ConfirmButton
          className="note-delete"
          label="Delete"
          confirmLabel="Delete forever?"
          title="Delete note (archiving is usually better)"
          onConfirm={onDelete}
        />
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
        {note.tags.map((t) => (
          <span key={t.noteTagId} className="note-chip nc-tag">
            #{t.name}
            <button
              type="button"
              className="note-chip-x"
              title="Remove tag"
              onClick={() => onRemoveTag(t.noteTagId)}
            >
              ✕
            </button>
          </span>
        ))}
        <span className="note-link-add">
          <input
            type="text"
            className="dw-select note-tag-input"
            placeholder="#tag…"
            list="tag-options"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagInput.trim()) {
                onAddTag(tagInput);
                setTagInput("");
              }
            }}
          />
          <datalist id="tag-options">
            {allTags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
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
          <span className="ed-sep" />
          <button
            type="button"
            className="ed-btn"
            title="Insert an image (or just paste or drop one)"
            onMouseDown={(ev) => {
              ev.preventDefault();
              fileInput.current?.click();
            }}
          >
            ▣ Image
          </button>
          <input
            ref={fileInput}
            id="note-image-file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              void insertImages(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {uploading > 0 && <span className="ed-status">Uploading image…</span>}
          {imgError && <span className="ed-status is-err">{imgError}</span>}
        </div>
      )}

      <EditorContent editor={editor} className="note-body" />
    </div>
  );
}

// ---- lightweight mention dropdown (no external positioning lib) ----
// Shared by @ (cases/people) and # (tags); items just need label + sub.
type DropdownItem = { label: string; sub?: string };
type SuggestionProps = {
  items: DropdownItem[];
  command: (item: DropdownItem) => void;
  clientRect?: (() => DOMRect | null) | null;
};

// Typed loosely: tiptap's SuggestionOptions generics differ per mention
// type, but the renderer only touches label/sub/command.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mentionDropdown(): any {
  let el: HTMLDivElement | null = null;
  let currentItems: DropdownItem[] = [];
  let selected = 0;
  let currentCommand: ((item: DropdownItem) => void) | null = null;

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
