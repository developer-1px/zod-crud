import * as z from "zod";

export type MenuItem = {
  label: string;
  url: string;
  visible: boolean;
  children: MenuItem[];
};

export const MenuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.object({
    label: z.string().min(1),
    url: z.string().startsWith("/"),
    visible: z.boolean(),
    children: z.array(MenuItemSchema),
  }),
);
