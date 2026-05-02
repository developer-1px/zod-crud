import * as z from "zod";

export const CONTENT_IMAGES = {
  marketHero: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=720&q=80",
  organicBundle: "https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=240&q=80",
  coldChain: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=240&q=80",
} as const;

export const DesignToneSchema = z.union([
  z.literal("ink"),
  z.literal("accent"),
  z.literal("danger"),
  z.literal("muted"),
  z.literal("inverse"),
]);

export const DesignFillSchema = z.union([
  z.literal("teal"),
  z.literal("amber"),
  z.literal("violet"),
  z.literal("blue"),
  z.literal("surface"),
]);

export const DesignIconNameSchema = z.union([
  z.literal("search"),
  z.literal("bell"),
  z.literal("check-circle"),
  z.literal("chevron-down"),
  z.literal("plus"),
  z.literal("send"),
  z.literal("layout-template"),
  z.literal("database"),
  z.literal("history"),
]);

export const DesignImageAspectSchema = z.union([
  z.literal("wide"),
  z.literal("thumb"),
]);

export const DesignOperationSchema = z.union([
  z.literal("create"),
  z.literal("read"),
  z.literal("update"),
  z.literal("delete"),
  z.literal("copy"),
  z.literal("paste"),
  z.literal("reorder"),
  z.literal("serialize"),
  z.literal("validate"),
]);

export const DesignInteractionSchema = z.object({
  selectable: z.boolean().nullable().default(null),
  copyable: z.boolean().nullable().default(null),
  pasteTarget: z.boolean().nullable().default(null),
  reorderable: z.boolean().nullable().default(null),
  locked: z.boolean().nullable().default(null),
});

export const DesignBindingSchema = z.object({
  field: z.string().min(1),
  schema: z.string().min(1),
  operations: z.array(DesignOperationSchema).min(1),
  state: z.string().min(1).nullable().default(null),
});

export const DesignNodeBaseSchema = z.object({
  name: z.string().min(1),
});

export type DesignNodeBase = z.infer<typeof DesignNodeBaseSchema>;
export type DesignTone = z.infer<typeof DesignToneSchema>;
export type DesignFill = z.infer<typeof DesignFillSchema>;
export type DesignIconName = z.infer<typeof DesignIconNameSchema>;
export type DesignImageAspect = z.infer<typeof DesignImageAspectSchema>;

export type UiFrameNode = DesignNodeBase & {
  kind: "frame";
  fill: string;
  children: UiNode[];
};

export type UiTextNode = DesignNodeBase & {
  kind: "text";
  text: string;
  tone: DesignTone;
};

export type UiRectNode = DesignNodeBase & {
  kind: "rect";
  label: string;
  fill: DesignFill;
  width: number;
  height: number;
};

export type UiIconNode = DesignNodeBase & {
  kind: "icon";
  label: string;
  icon: DesignIconName;
  tone: DesignTone;
};

export type UiImageNode = DesignNodeBase & {
  kind: "image";
  label: string;
  src: string;
  alt: string;
  aspect: DesignImageAspect;
};

export type UiNode =
  | UiFrameNode
  | UiTextNode
  | UiRectNode
  | UiIconNode
  | UiImageNode;

export const TextNodeSchema: z.ZodType<UiTextNode> = DesignNodeBaseSchema.extend({
  kind: z.literal("text"),
  text: z.string(),
  tone: DesignToneSchema,
});

export const RectNodeSchema: z.ZodType<UiRectNode> = DesignNodeBaseSchema.extend({
  kind: z.literal("rect"),
  label: z.string().min(1),
  fill: DesignFillSchema,
  width: z.number().min(40).max(420),
  height: z.number().min(24).max(180),
});

export const IconNodeSchema: z.ZodType<UiIconNode> = DesignNodeBaseSchema.extend({
  kind: z.literal("icon"),
  label: z.string().min(1),
  icon: DesignIconNameSchema,
  tone: DesignToneSchema,
});

export const ImageNodeSchema: z.ZodType<UiImageNode> = DesignNodeBaseSchema.extend({
  kind: z.literal("image"),
  label: z.string().min(1),
  src: z.string().url(),
  alt: z.string().min(1),
  aspect: DesignImageAspectSchema,
});

export const FrameNodeSchema: z.ZodType<UiFrameNode> = z.lazy(() =>
  DesignNodeBaseSchema.extend({
    kind: z.literal("frame"),
    fill: z.string().min(1),
    children: z.array(DesignNodeSchema),
  }),
);

export const DesignNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    FrameNodeSchema,
    TextNodeSchema,
    RectNodeSchema,
    IconNodeSchema,
    ImageNodeSchema,
  ]),
);

export const initialDesignJson = {
  kind: "frame",
  name: "ZodCrudBuilder",
  fill: "#eef2f7",
  children: [
    {
      kind: "frame",
      name: "MobileRecordScreen",
      fill: "#f9fbff",
      children: [
        {
          kind: "frame",
          name: "AppToolbar",
          fill: "#ffffff",
          children: [
            { kind: "text", name: "ToolbarTitleText", text: "Orders", tone: "ink" },
            { kind: "icon", name: "SearchIcon", label: "Search", icon: "search", tone: "ink" },
            { kind: "icon", name: "NotificationIcon", label: "Notifications", icon: "bell", tone: "ink" },
            { kind: "rect", name: "SyncStatus", label: "SyncStatus", fill: "teal", width: 104, height: 30 },
          ],
        },
        {
          kind: "image",
          name: "MarketHeroImage",
          label: "MarketHeroImage",
          src: CONTENT_IMAGES.marketHero,
          alt: "Fresh produce crates for a wholesale order",
          aspect: "wide",
        },
        {
          kind: "frame",
          name: "SchemaStatusCard",
          fill: "#eaf8f2",
          children: [
            { kind: "icon", name: "SchemaValidIcon", label: "Valid", icon: "check-circle", tone: "accent" },
            { kind: "text", name: "SchemaNameText", text: "SalesOrderSchema", tone: "accent" },
            { kind: "text", name: "SnapshotStatusText", text: "Valid snapshot", tone: "ink" },
            { kind: "rect", name: "SafeParseBadge", label: "safeParse", fill: "teal", width: 92, height: 28 },
          ],
        },
        {
          kind: "frame",
          name: "CustomerNameField",
          fill: "#ffffff",
          children: [
            { kind: "text", name: "CustomerLabelText", text: "Customer", tone: "ink" },
            { kind: "text", name: "CustomerFieldPathText", text: "customer.name", tone: "muted" },
            { kind: "text", name: "CustomerValueText", text: "Acme Market", tone: "ink" },
            { kind: "icon", name: "CustomerSelectIcon", label: "Open customer options", icon: "chevron-down", tone: "ink" },
            { kind: "text", name: "CustomerSchemaText", text: "z.string().min(2)", tone: "accent" },
          ],
        },
        {
          kind: "frame",
          name: "OrderStatusField",
          fill: "#ffffff",
          children: [
            { kind: "text", name: "StatusLabelText", text: "Status", tone: "ink" },
            { kind: "text", name: "StatusFieldPathText", text: "status", tone: "muted" },
            { kind: "text", name: "DraftStatusText", text: "Draft", tone: "ink" },
            { kind: "text", name: "PaidStatusText", text: "Paid", tone: "ink" },
            { kind: "text", name: "SentStatusText", text: "Sent", tone: "ink" },
          ],
        },
        {
          kind: "frame",
          name: "LineItemsList",
          fill: "#ffffff",
          children: [
            { kind: "text", name: "LineItemsTitleText", text: "Line items", tone: "ink" },
            { kind: "text", name: "LineItemsPathText", text: "lineItems[]", tone: "muted" },
            { kind: "icon", name: "AddLineItemIcon", label: "Add line item", icon: "plus", tone: "ink" },
            {
              kind: "image",
              name: "OrganicBundleImage",
              label: "OrganicBundleImage",
              src: CONTENT_IMAGES.organicBundle,
              alt: "Organic vegetables bundle",
              aspect: "thumb",
            },
            { kind: "text", name: "OrganicBundleTitleText", text: "Organic bundle", tone: "ink" },
            { kind: "text", name: "OrganicBundleMetaText", text: "qty 4 - $128.00", tone: "muted" },
            { kind: "rect", name: "OrganicStatusBadge", label: "ok", fill: "blue", width: 44, height: 24 },
            {
              kind: "image",
              name: "ColdChainImage",
              label: "ColdChainImage",
              src: CONTENT_IMAGES.coldChain,
              alt: "Prepared cold chain food package",
              aspect: "thumb",
            },
            { kind: "text", name: "ColdChainTitleText", text: "Cold chain fee", tone: "ink" },
            { kind: "text", name: "ColdChainMetaText", text: "qty 1 - $18.00", tone: "muted" },
            { kind: "rect", name: "ColdChainStatusBadge", label: "new", fill: "blue", width: 44, height: 24 },
            { kind: "rect", name: "LineItemsRepeater", label: "Repeater", fill: "violet", width: 220, height: 76 },
          ],
        },
        { kind: "rect", name: "SaveButton", label: "SaveButton", fill: "teal", width: 260, height: 48 },
        { kind: "text", name: "SaveButtonText", text: "Save record", tone: "inverse" },
        { kind: "icon", name: "SaveButtonIcon", label: "Save", icon: "send", tone: "inverse" },
        { kind: "icon", name: "LayoutTabIcon", label: "Design tab", icon: "layout-template", tone: "accent" },
        { kind: "icon", name: "DatabaseTabIcon", label: "Data tab", icon: "database", tone: "ink" },
        { kind: "icon", name: "HistoryTabIcon", label: "History tab", icon: "history", tone: "ink" },
      ],
    },
    {
      kind: "frame",
      name: "PropertyPanel",
      fill: "#ffffff",
      children: [
        { kind: "text", name: "SelectedComponentText", text: "selected component", tone: "ink" },
        { kind: "rect", name: "CrudFieldBindingControl", label: "CRUD field binding", fill: "violet", width: 188, height: 42 },
      ],
    },
  ],
};
