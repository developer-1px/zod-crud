import type { JsonChange } from "./types.js";

export type ChangeListener = (changes: JsonChange[]) => void;

export type Subscriber = {
  subscribe: (listener: ChangeListener) => () => void;
  notify: (changes: JsonChange[]) => void;
};

export function createSubscriber(): Subscriber {
  const listeners = new Set<ChangeListener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(changes) {
      for (const listener of listeners) {
        listener(changes);
      }
    },
  };
}
