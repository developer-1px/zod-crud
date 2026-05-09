export function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        ...("issues" in item ? { issues: (item as { issues: unknown }).issues } : {}),
      };
    }

    return item;
  }, 2);
}
