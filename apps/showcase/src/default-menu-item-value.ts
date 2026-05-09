export function defaultMenuItemValue(_parentPath: unknown, index: number) {
  return {
    label: `Item ${index}`,
    url: `/item-${index}`,
    visible: true,
    children: [],
  };
}
