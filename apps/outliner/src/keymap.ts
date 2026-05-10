// Keyboard SSOT (declarative). chord → command. mode 별 활성 여부 명시.
// Workflowy 모델 — select mode 와 edit mode 에서 chord 의미가 갈린다.

export type Mode = "select" | "edit";
export type Chord = string;

export type CommandId =
  | "insert-sibling"
  | "enter-edit"
  | "exit-edit"
  | "demote"
  | "promote"
  | "remove"
  | "remove-if-empty"
  | "select-all"
  | "focus-prev"
  | "focus-next"
  | "focus-parent"
  | "focus-first-child"
  | "focus-first"
  | "focus-last"
  | "extend-up"
  | "extend-down"
  | "move-up"
  | "move-down"
  | "copy"
  | "cut"
  | "paste-sibling"
  | "paste-child"
  | "undo"
  | "redo";

export interface KeyBinding {
  chord: Chord;
  command: CommandId;
  label: string;
  /** 어느 모드에서 활성인가. 비어있지 않은 배열. */
  modes: ReadonlyArray<Mode>;
}

// 정본 매핑. 새 chord 는 여기에만 추가. modes 가 어느 모드에서 활성인지 명시.
//   any 두 모드 = ["select", "edit"]
export const KEYMAP: ReadonlyArray<KeyBinding> = [
  // ── Mode 전환 ────────────────────────────────────────────────────────────
  { chord: "Enter",        command: "enter-edit",     label: "Edit",                modes: ["select"] },
  { chord: "Enter",        command: "insert-sibling", label: "Insert sibling",      modes: ["edit"] },
  { chord: "Escape",       command: "exit-edit",      label: "Exit edit mode",      modes: ["edit"] },

  // ── 구조 명령 (mode 무관) ──────────────────────────────────────────────
  { chord: "Tab",          command: "demote",         label: "Demote",              modes: ["select", "edit"] },
  { chord: "Shift+Tab",    command: "promote",        label: "Promote",             modes: ["select", "edit"] },

  // ── 제거 — select 는 즉시, edit 는 빈 텍스트일 때만 ────────────────────
  { chord: "Backspace",    command: "remove",         label: "Delete row",          modes: ["select"] },
  { chord: "Delete",       command: "remove",         label: "Delete row",          modes: ["select"] },
  { chord: "Backspace",    command: "remove-if-empty",label: "Delete row if empty", modes: ["edit"] },

  // ── Selection ─────────────────────────────────────────────────────────
  { chord: "Mod+a",        command: "select-all",     label: "Select all rows",     modes: ["select"] },

  // ── Row navigation — select 모드 전용 (edit 모드의 Arrow 는 caret) ───
  { chord: "ArrowUp",      command: "focus-prev",     label: "Focus previous row",  modes: ["select"] },
  { chord: "ArrowDown",    command: "focus-next",     label: "Focus next row",      modes: ["select"] },
  { chord: "ArrowLeft",    command: "focus-parent",   label: "Focus parent",        modes: ["select"] },
  { chord: "ArrowRight",   command: "focus-first-child", label: "Focus first child", modes: ["select"] },
  { chord: "Home",         command: "focus-first",    label: "Focus first row",     modes: ["select"] },
  { chord: "End",          command: "focus-last",     label: "Focus last row",      modes: ["select"] },
  { chord: "Shift+ArrowUp",   command: "extend-up",   label: "Extend selection up", modes: ["select"] },
  { chord: "Shift+ArrowDown", command: "extend-down", label: "Extend selection down", modes: ["select"] },
  { chord: "Mod+ArrowUp",     command: "move-up",     label: "Move row up",         modes: ["select", "edit"] },
  { chord: "Mod+ArrowDown",   command: "move-down",   label: "Move row down",       modes: ["select", "edit"] },

  // ── Clipboard (mode 무관) ─────────────────────────────────────────────
  { chord: "Mod+c",        command: "copy",           label: "Copy row(s)",         modes: ["select"] },
  { chord: "Mod+x",        command: "cut",            label: "Cut row(s)",          modes: ["select"] },
  { chord: "Mod+v",        command: "paste-sibling",  label: "Paste as sibling",    modes: ["select"] },
  { chord: "Mod+Shift+v",  command: "paste-child",    label: "Paste as child",      modes: ["select"] },

  // ── History (mode 무관) ───────────────────────────────────────────────
  { chord: "Mod+z",        command: "undo",           label: "Undo",                modes: ["select", "edit"] },
  { chord: "Mod+Shift+z",  command: "redo",           label: "Redo",                modes: ["select", "edit"] },
  { chord: "Mod+y",        command: "redo",           label: "Redo (Win)",          modes: ["select", "edit"] },
];

// DOM KeyboardEvent → chord 문자열 정규화.
// Mod = Cmd on macOS, Ctrl elsewhere. shift/alt 는 명시적.
export function eventToChord(e: KeyboardEvent | React.KeyboardEvent): Chord {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const meta = isMac ? e.metaKey : e.ctrlKey;
  const parts: string[] = [];
  if (meta) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  // 단일 문자는 lowercase, 특수키는 그대로
  let key = e.key;
  if (key.length === 1) key = key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

export function findCommand(chord: Chord, mode: Mode): CommandId | null {
  for (const b of KEYMAP) {
    if (b.chord === chord && b.modes.includes(mode)) return b.command;
  }
  return null;
}
