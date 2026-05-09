import { defaultMenuItemValue } from "./default-menu-item-value.js";
import { defineEntity } from "./entity-definition.js";
import { initialMenu } from "./initial-menu.js";
import { MenuItemSchema } from "./menu-item-schema.js";

export const menuTreeEntity = defineEntity({
  id: "menu-tree",
  label: "Menu tree",
  schemaName: "MenuItemSchema",
  schema: MenuItemSchema,
  initialValue: initialMenu,
  childKeys: ["children"],
  defaultValue: defaultMenuItemValue,
});
