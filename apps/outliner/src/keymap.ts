// Keyboard SSOT (declarative). chord → command. ds 의 outlinerSpec.inputs 와 동일 모델.
// DOM 이벤트 → chord 정규화 → command 디스패치는 dispatcher.ts.

export type Chord = string;
export type CommandId =
  | "insert-sibling"
  | "demote"
  | "promote"
  | "remove"
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
}

// 정본 매핑. 새 chord 는 여기에만 추가.
export const KEYMAP: ReadonlyArray<KeyBinding> = [
  { chord: "Enter",        command: "insert-sibling", label: "Insert sibling" },
  { chord: "Tab",          command: "demote",         label: "Demote" },
  { chord: "Shift+Tab",    command: "promote",        label: "Promote" },
  { chord: "Backspace",    command: "remove",         label: "Delete (when empty)" },
  { chord: "Mod+a",        command: "select-all",     label: "Select all" },
  { chord: "ArrowUp",      command: "focus-prev",     label: "Focus previous row" },
  { chord: "ArrowDown",    command: "focus-next",     label: "Focus next row" },
  { chord: "ArrowLeft",    command: "focus-parent",   label: "Focus parent" },
  { chord: "ArrowRight",   command: "focus-first-child", label: "Focus first child" },
  { chord: "Home",         command: "focus-first",    label: "Focus first row" },
  { chord: "End",          command: "focus-last",     label: "Focus last row" },
  { chord: "Shift+ArrowUp",   command: "extend-up",      label: "Extend selection up" },
  { chord: "Shift+ArrowDown", command: "extend-down",    label: "Extend selection down" },
  { chord: "Mod+ArrowUp",     command: "move-up",        label: "Move row up" },
  { chord: "Mod+ArrowDown",   command: "move-down",      label: "Move row down" },
  { chord: "Mod+c",        command: "copy",           label: "Copy selection" },
  { chord: "Mod+x",        command: "cut",            label: "Cut selection" },
  { chord: "Mod+v",        command: "paste-sibling",  label: "Paste as sibling" },
  { chord: "Mod+Shift+v",  command: "paste-child",    label: "Paste as child" },
  { chord: "Mod+z",        command: "undo",           label: "Undo" },
  { chord: "Mod+Shift+z",  command: "redo",           label: "Redo" },
  { chord: "Mod+y",        command: "redo",           label: "Redo (Win)" },
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

export function findCommand(chord: Chord): CommandId | null {
  for (const b of KEYMAP) {
    if (b.chord === chord) return b.command;
  }
  return null;
}
