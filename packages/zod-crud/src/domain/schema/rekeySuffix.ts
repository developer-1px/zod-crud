import type { RekeyField } from "./rekey.js";
import { scalarText, walk, walkSingleFieldText } from "./rekeyTraversal.js";

const COPY_SUFFIX = "-copy";
const COPY_NESTED_SUFFIX = "-copy-";

interface SuffixRekeyField extends RekeyField {
  bases: Set<string>;
}

export function collectSuffixExistingValues(
  state: unknown,
  payload: unknown,
  fields: ReadonlyArray<string>,
  payloadEntries: Array<Record<string, unknown>>,
): RekeyField[] {
  if (fields.length === 1) {
    return collectSingleSuffixExistingValues(state, payload, fields[0]!, payloadEntries);
  }

  const suffixFields = fields.map((field): SuffixRekeyField => ({
    field,
    existing: new Set(),
    bases: new Set(),
  }));

  walk(payload, (entry) => {
    let hasRekeyValue = false;
    for (let index = 0; index < suffixFields.length; index += 1) {
      const { field, bases } = suffixFields[index]!;
      const current = scalarText(entry[field]);
      if (current === null) continue;
      bases.add(current);
      hasRekeyValue = true;
    }
    if (hasRekeyValue) payloadEntries.push(entry);
  });

  let hasBases = false;
  for (const field of suffixFields) {
    if (field.bases.size === 0) continue;
    hasBases = true;
  }
  if (!hasBases) return suffixFields;

  if (suffixFields.length === 1) {
    const suffixField = suffixFields[0]!;
    if (suffixField.bases.size === 1) {
      collectSingleSuffixField(state, suffixField);
      return suffixFields;
    }
    walk(state, (entry) => {
      const text = scalarText(entry[suffixField.field]);
      if (text === null) return;
      if (matchesSuffixCandidate(text, suffixField)) suffixField.existing.add(text);
    });
    return suffixFields;
  }

  walk(state, (entry) => {
    for (let index = 0; index < suffixFields.length; index += 1) {
      const suffixField = suffixFields[index]!;
      const text = scalarText(entry[suffixField.field]);
      if (text === null) continue;
      if (matchesSuffixCandidate(text, suffixField)) suffixField.existing.add(text);
    }
  });

  return suffixFields;
}

function collectSingleSuffixExistingValues(
  state: unknown,
  payload: unknown,
  field: string,
  payloadEntries: Array<Record<string, unknown>>,
): RekeyField[] {
  const suffixField: SuffixRekeyField = {
    field,
    existing: new Set(),
    bases: new Set(),
  };
  let hasDuplicateBase = false;

  walk(payload, (entry) => {
    const current = scalarText(entry[field]);
    if (current === null) return;
    payloadEntries.push(entry);
    if (suffixField.bases.has(current)) {
      hasDuplicateBase = true;
      return;
    }
    suffixField.bases.add(current);
  });

  if (suffixField.bases.size === 0) return [suffixField];
  if (suffixField.bases.size === 1) {
    collectSingleSuffixField(state, suffixField);
    return [suffixField];
  }

  if (!hasDuplicateBase && !collectExactSuffixFieldConflicts(state, suffixField)) {
    return [suffixField];
  }

  walk(state, (entry) => {
    const text = scalarText(entry[suffixField.field]);
    if (text === null) return;
    if (matchesSuffixCandidate(text, suffixField)) suffixField.existing.add(text);
  });
  return [suffixField];
}

function collectExactSuffixFieldConflicts(state: unknown, suffixField: SuffixRekeyField): boolean {
  let hasConflict = false;
  walkSingleFieldText(state, suffixField.field, (text) => {
    if (!suffixField.bases.has(text)) return;
    suffixField.existing.add(text);
    hasConflict = true;
  });
  return hasConflict;
}

function collectSingleSuffixField(state: unknown, suffixField: SuffixRekeyField): void {
  const base = suffixField.bases.values().next().value as string;
  const exact = `${base}-copy`;
  const nested = `${exact}-`;
  scanSingleSuffixField(state, suffixField.field, suffixField.existing, base, exact, nested);
}

function scanSingleSuffixField(
  value: unknown,
  field: string,
  existing: Set<string>,
  base: string,
  exact: string,
  nested: string,
): void {
  walkSingleFieldText(value, field, (text) => {
    if (text === base || text === exact || (text.length >= nested.length && text.startsWith(nested))) {
      existing.add(text);
    }
  });
}

function matchesSuffixCandidate(value: string, field: SuffixRekeyField): boolean {
  if (field.bases.has(value)) return true;

  if (
    value.endsWith(COPY_SUFFIX)
    && field.bases.has(value.slice(0, -COPY_SUFFIX.length))
  ) {
    return true;
  }

  let marker = value.indexOf(COPY_NESTED_SUFFIX);
  while (marker !== -1) {
    if (field.bases.has(value.slice(0, marker))) return true;
    marker = value.indexOf(COPY_NESTED_SUFFIX, marker + 1);
  }
  return false;
}
