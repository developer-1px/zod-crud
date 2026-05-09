import type { MenuItem } from "./menu-item-schema.js";

export const initialMenu: MenuItem = {
  label: "Root",
  url: "/",
  visible: true,
  children: [
    {
      label: "Dashboard",
      url: "/dashboard",
      visible: true,
      children: [],
    },
    {
      label: "Settings",
      url: "/settings",
      visible: true,
      children: [
        {
          label: "Members",
          url: "/settings/members",
          visible: true,
          children: [],
        },
      ],
    },
  ],
};
