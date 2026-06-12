import type {
  JSONResult,
} from "@interactive-os/json-document";

export interface DirtyStateSnapshot<T> {
  dirty: boolean;
  value: T;
  baseline: T;
}

export type DirtyStateComparator<T> = (current: T, baseline: T) => boolean;

export type DirtyStateListener<T> = (snapshot: DirtyStateSnapshot<T>) => void;

export interface CreateDirtyStateOptions<T> {
  equals?: DirtyStateComparator<T>;
}

export interface DirtyStateDiscardOptions {
  preserveHistory?: boolean;
}

export interface DirtyState<T> {
  current(): DirtyStateSnapshot<T>;
  markClean(): DirtyStateSnapshot<T>;
  isDirty(): boolean;
  discard(options?: DirtyStateDiscardOptions): JSONResult;
  subscribe(listener: DirtyStateListener<T>): () => void;
  dispose(): void;
}
