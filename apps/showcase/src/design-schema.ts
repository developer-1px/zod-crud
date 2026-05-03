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

export const DesignFlexDirectionSchema = z.union([
  z.literal("row"),
  z.literal("column"),
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
export type DesignFlexDirection = z.infer<typeof DesignFlexDirectionSchema>;

export type UiFrameNode = DesignNodeBase & {
  kind: "frame";
  fill: string;
  children: UiNode[];
};

export type UiFlexNode = DesignNodeBase & {
  kind: "flex";
  direction: DesignFlexDirection;
  gap: number;
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

export type UiGroupNode = DesignNodeBase & {
  kind: "group";
  role: string;
  slots: Record<string, UiNode>;
  collections: Record<string, UiNode[]>;
};

export type UiNode =
  | UiGroupNode
  | UiFrameNode
  | UiFlexNode
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

export const GroupNodeSchema: z.ZodType<UiGroupNode> = z.lazy(() =>
  DesignNodeBaseSchema.extend({
    kind: z.literal("group"),
    role: z.string().min(1),
    slots: z.record(z.string(), DesignNodeSchema).default({}),
    collections: z.record(z.string(), z.array(DesignNodeSchema)).default({}),
  }),
);

export const FrameNodeSchema: z.ZodType<UiFrameNode> = z.lazy(() =>
  DesignNodeBaseSchema.extend({
    kind: z.literal("frame"),
    fill: z.string().min(1),
    children: z.array(DesignNodeSchema),
  }),
);

export const FlexNodeSchema: z.ZodType<UiFlexNode> = z.lazy(() =>
  DesignNodeBaseSchema.extend({
    kind: z.literal("flex"),
    direction: DesignFlexDirectionSchema,
    gap: z.number().min(0).max(64),
    children: z.array(DesignNodeSchema),
  }),
);

export const DesignNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    GroupNodeSchema,
    FrameNodeSchema,
    FlexNodeSchema,
    TextNodeSchema,
    RectNodeSchema,
    IconNodeSchema,
    ImageNodeSchema,
  ]),
);

export const initialDesignJson = {
  kind: "group",
  name: "ZodCrudBuilder",
  role: "builder",
  slots: {
    screen: {
      kind: "group",
      name: "MobileRecordScreen",
      role: "mobileScreen",
      slots: {
        toolbar: {
          kind: "group",
          name: "AppToolbar",
          role: "mobileToolbar",
          slots: {
            title: {
              kind: "group",
              name: "ToolbarTitleFlex",
              role: "toolbarTitleStack",
              slots: {
                eyebrow: { kind: "text", name: "ToolbarEyebrowText", text: "FieldOps", tone: "muted" },
                title: { kind: "text", name: "ToolbarTitleText", text: "Order intake", tone: "ink" },
              },
              collections: {},
            },
            actions: {
              kind: "group",
              name: "ToolbarActionsFlex",
              role: "toolbarActions",
              slots: {
                search: { kind: "icon", name: "SearchIcon", label: "Search", icon: "search", tone: "ink" },
                notifications: { kind: "icon", name: "NotificationIcon", label: "Notifications", icon: "bell", tone: "ink" },
              },
              collections: {},
            },
            syncStatus: { kind: "rect", name: "SyncStatus", label: "SyncStatus", fill: "teal", width: 104, height: 30 },
          },
          collections: {},
        },
        hero: {
          kind: "group",
          name: "HeroCard",
          role: "heroCard",
          slots: {
            image: {
              kind: "image",
              name: "MarketHeroImage",
              label: "MarketHeroImage",
              src: CONTENT_IMAGES.marketHero,
              alt: "Fresh produce crates for a wholesale order",
              aspect: "wide",
            },
            overlay: {
              kind: "group",
              name: "HeroOverlayFlex",
              role: "heroOverlay",
              slots: {
                field: { kind: "text", name: "HeroMediaFieldText", text: "media.hero.src", tone: "inverse" },
                title: { kind: "text", name: "HeroTitleText", text: "Fresh produce order", tone: "inverse" },
              },
              collections: {},
            },
          },
          collections: {},
        },
        schemaStatus: {
          kind: "group",
          name: "SchemaStatusCard",
          role: "schemaStatusCard",
          slots: {
            icon: { kind: "icon", name: "SchemaValidIcon", label: "Valid", icon: "check-circle", tone: "accent" },
            copy: {
              kind: "group",
              name: "SchemaCopyFlex",
              role: "schemaCopyStack",
              slots: {
                schema: { kind: "text", name: "SchemaNameText", text: "SalesOrderSchema", tone: "accent" },
                status: { kind: "text", name: "SnapshotStatusText", text: "Valid snapshot", tone: "ink" },
                detail: { kind: "text", name: "HydratedFieldsText", text: "8 fields hydrated by zod-crud", tone: "muted" },
              },
              collections: {},
            },
            badge: { kind: "rect", name: "SafeParseBadge", label: "safeParse", fill: "teal", width: 92, height: 28 },
          },
          collections: {},
        },
        crudMode: {
          kind: "group",
          name: "CrudModeTabs",
          role: "segmentedControl",
          slots: {},
          collections: {
            options: [
              { kind: "text", name: "CreateModeText", text: "Create", tone: "ink" },
              { kind: "text", name: "ReadModeText", text: "Read", tone: "muted" },
              { kind: "text", name: "UpdateModeText", text: "Update", tone: "muted" },
            ],
          },
        },
        customerField: {
          kind: "group",
          name: "CustomerNameField",
          role: "fieldCard",
          slots: {
            heading: {
              kind: "group",
              name: "CustomerHeadingFlex",
              role: "fieldHeading",
              slots: {
                label: { kind: "text", name: "CustomerLabelText", text: "Customer", tone: "ink" },
                path: { kind: "text", name: "CustomerFieldPathText", text: "customer.name", tone: "muted" },
              },
              collections: {},
            },
            input: {
              kind: "group",
              name: "CustomerInputFlex",
              role: "inputControl",
              slots: {
                value: { kind: "text", name: "CustomerValueText", text: "Acme Market", tone: "ink" },
                icon: { kind: "icon", name: "CustomerSelectIcon", label: "Open customer options", icon: "chevron-down", tone: "ink" },
              },
              collections: {},
            },
            schema: { kind: "text", name: "CustomerSchemaText", text: "z.string().min(2)", tone: "accent" },
          },
          collections: {},
        },
        statusField: {
          kind: "group",
          name: "OrderStatusField",
          role: "statusField",
          slots: {
            heading: {
              kind: "group",
              name: "StatusHeadingFlex",
              role: "fieldHeading",
              slots: {
                label: { kind: "text", name: "StatusLabelText", text: "Status", tone: "ink" },
                path: { kind: "text", name: "StatusFieldPathText", text: "status", tone: "muted" },
              },
              collections: {},
            },
            pills: {
              kind: "group",
              name: "StatusPillsFlex",
              role: "statusPills",
              slots: {},
              collections: {
                options: [
                  { kind: "text", name: "DraftStatusText", text: "Draft", tone: "ink" },
                  { kind: "text", name: "PaidStatusText", text: "Paid", tone: "ink" },
                  { kind: "text", name: "SentStatusText", text: "Sent", tone: "ink" },
                ],
              },
            },
          },
          collections: {},
        },
        lineItems: {
          kind: "group",
          name: "LineItemsList",
          role: "lineItemsPanel",
          slots: {
            heading: {
              kind: "group",
              name: "LineItemsHeadingFlex",
              role: "listHeading",
              slots: {
                copy: {
                  kind: "group",
                  name: "LineItemsHeadingCopyFlex",
                  role: "listHeadingCopy",
                  slots: {
                    title: { kind: "text", name: "LineItemsTitleText", text: "Line items", tone: "ink" },
                    path: { kind: "text", name: "LineItemsPathText", text: "lineItems[]", tone: "muted" },
                  },
                  collections: {},
                },
                addButton: { kind: "icon", name: "AddLineItemIcon", label: "Add line item", icon: "plus", tone: "ink" },
              },
              collections: {},
            },
          },
          collections: {
            items: [
              {
                kind: "group",
                name: "OrganicLineItemFlex",
                role: "lineItemRow",
                slots: {
                  image: {
                    kind: "image",
                    name: "OrganicBundleImage",
                    label: "OrganicBundleImage",
                    src: CONTENT_IMAGES.organicBundle,
                    alt: "Organic vegetables bundle",
                    aspect: "thumb",
                  },
                  copy: {
                    kind: "group",
                    name: "OrganicLineItemCopyFlex",
                    role: "lineItemCopy",
                    slots: {
                      title: { kind: "text", name: "OrganicBundleTitleText", text: "Organic bundle", tone: "ink" },
                      meta: { kind: "text", name: "OrganicBundleMetaText", text: "qty 4 - $128.00", tone: "muted" },
                    },
                    collections: {},
                  },
                  badge: { kind: "rect", name: "OrganicStatusBadge", label: "ok", fill: "blue", width: 44, height: 24 },
                },
                collections: {},
              },
              {
                kind: "group",
                name: "ColdChainLineItemFlex",
                role: "lineItemRow",
                slots: {
                  image: {
                    kind: "image",
                    name: "ColdChainImage",
                    label: "ColdChainImage",
                    src: CONTENT_IMAGES.coldChain,
                    alt: "Prepared cold chain food package",
                    aspect: "thumb",
                  },
                  copy: {
                    kind: "group",
                    name: "ColdChainLineItemCopyFlex",
                    role: "lineItemCopy",
                    slots: {
                      title: { kind: "text", name: "ColdChainTitleText", text: "Cold chain fee", tone: "ink" },
                      meta: { kind: "text", name: "ColdChainMetaText", text: "qty 1 - $18.00", tone: "muted" },
                    },
                    collections: {},
                  },
                  badge: { kind: "rect", name: "ColdChainStatusBadge", label: "new", fill: "blue", width: 44, height: 24 },
                },
                collections: {},
              },
            ],
          },
        },
        saveButton: {
          kind: "group",
          name: "SaveButton",
          role: "primaryAction",
          slots: {
            label: { kind: "text", name: "SaveButtonText", text: "Save record", tone: "inverse" },
            icon: { kind: "icon", name: "SaveButtonIcon", label: "Save", icon: "send", tone: "inverse" },
          },
          collections: {},
        },
        bottomNav: {
          kind: "group",
          name: "BottomNavFlex",
          role: "bottomNav",
          slots: {
            layout: { kind: "icon", name: "LayoutTabIcon", label: "Design tab", icon: "layout-template", tone: "accent" },
            data: { kind: "icon", name: "DatabaseTabIcon", label: "Data tab", icon: "database", tone: "ink" },
            history: { kind: "icon", name: "HistoryTabIcon", label: "History tab", icon: "history", tone: "ink" },
          },
          collections: {},
        },
      },
      collections: {},
    },
    propertyPanel: {
      kind: "group",
      name: "PropertyPanel",
      role: "propertyPanel",
      slots: {
        selectedText: { kind: "text", name: "SelectedComponentText", text: "selected component", tone: "ink" },
        bindingControl: { kind: "rect", name: "CrudFieldBindingControl", label: "CRUD field binding", fill: "violet", width: 188, height: 42 },
      },
      collections: {},
    },
  },
  collections: {},
};

export const SalesOrderStatusSchema = z.union([
  z.literal("draft"),
  z.literal("paid"),
  z.literal("sent"),
]);

export const LineItemSchema = z.object({
  title: z.string().min(1),
  quantity: z.number().int().positive(),
  image: z.string().url(),
  status: z.union([z.literal("ok"), z.literal("new")]),
});

export const SalesOrderSchema = z.object({
  title: z.string().min(1),
  status: SalesOrderStatusSchema,
  customer: z.object({
    name: z.string().min(2),
  }),
  media: z.object({
    hero: z.object({
      src: z.string().url(),
      alt: z.string().min(1),
    }),
  }),
  lineItems: z.array(LineItemSchema).min(1),
});

export type SalesOrder = z.infer<typeof SalesOrderSchema>;

export const BindingExprSchema = z.object({
  path: z.string().min(1),
});

export const FieldControlSchema = z.union([
  z.literal("text"),
  z.literal("number"),
  z.literal("textarea"),
  z.literal("select"),
  z.literal("checkbox"),
  z.literal("image"),
  z.literal("date"),
]);

export const ViewNodeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("view"),
    title: z.string().min(1).optional(),
    children: z.array(z.string().min(1)),
  }),
  z.object({
    type: z.literal("section"),
    title: z.string().min(1).optional(),
    variant: z.union([
      z.literal("plain"),
      z.literal("hero"),
      z.literal("toolbar"),
    ]).default("plain"),
    children: z.array(z.string().min(1)),
  }),
  z.object({
    type: z.literal("field"),
    label: z.string().min(1),
    value: BindingExprSchema,
    control: FieldControlSchema.default("text"),
    help: z.string().min(1).optional(),
    options: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    type: z.literal("action"),
    label: z.string().min(1),
    action: z.string().min(1),
    variant: z.union([
      z.literal("primary"),
      z.literal("secondary"),
      z.literal("danger"),
    ]).default("secondary"),
  }),
  z.object({
    type: z.literal("show"),
    when: BindingExprSchema,
    child: z.string().min(1),
  }),
  z.object({
    type: z.literal("each"),
    label: z.string().min(1).optional(),
    items: BindingExprSchema,
    item: z.string().min(1),
    empty: z.string().min(1).optional(),
  }),
]);

export const OrderViewDocSchema = z.object({
  rootId: z.string().min(1),
  nodes: z.record(z.string(), ViewNodeSchema),
}).superRefine((doc, ctx) => {
  if (doc.nodes[doc.rootId] === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["rootId"],
      message: `Missing root node "${doc.rootId}".`,
    });
  }

  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    const childIds =
      "children" in node ? node.children :
      node.type === "show" ? [node.child] :
      node.type === "each" ? [node.item, node.empty].filter((id): id is string => id !== undefined) :
      [];

    for (const childId of childIds) {
      if (doc.nodes[childId] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", nodeId],
          message: `Node "${nodeId}" references missing child "${childId}".`,
        });
      }
    }
  }
});

export type BindingExpr = z.infer<typeof BindingExprSchema>;
export type ViewNode = z.infer<typeof ViewNodeSchema>;
export type OrderViewDoc = z.infer<typeof OrderViewDocSchema>;

export const initialSalesOrderData: SalesOrder = {
  title: "Fresh produce order",
  status: "draft",
  customer: {
    name: "Acme Market",
  },
  media: {
    hero: {
      src: CONTENT_IMAGES.marketHero,
      alt: "Fresh produce crates for a wholesale order",
    },
  },
  lineItems: [
    {
      title: "Organic bundle",
      quantity: 4,
      image: CONTENT_IMAGES.organicBundle,
      status: "ok",
    },
    {
      title: "Cold chain fee",
      quantity: 1,
      image: CONTENT_IMAGES.coldChain,
      status: "new",
    },
  ],
};

export const orderViewDoc: OrderViewDoc = {
  rootId: "orderView",
  nodes: {
    orderView: {
      type: "view",
      title: "Order intake",
      children: ["hero", "fields", "items", "actions"],
    },
    hero: {
      type: "section",
      title: "Media",
      variant: "hero",
      children: ["heroImage", "heroTitle"],
    },
    heroImage: {
      type: "field",
      label: "Hero image",
      value: { path: "/media/hero/src" },
      control: "image",
      help: "Validated by z.string().url() on the entity schema.",
    },
    heroTitle: {
      type: "field",
      label: "Title",
      value: { path: "/title" },
      control: "text",
    },
    fields: {
      type: "section",
      title: "Record fields",
      children: ["customerName", "status"],
    },
    customerName: {
      type: "field",
      label: "Customer",
      value: { path: "/customer/name" },
      control: "text",
    },
    status: {
      type: "field",
      label: "Status",
      value: { path: "/status" },
      control: "select",
      options: ["draft", "paid", "sent"],
    },
    items: {
      type: "each",
      label: "Line items",
      items: { path: "/lineItems" },
      item: "lineItemFields",
    },
    lineItemFields: {
      type: "section",
      children: ["itemImage", "itemTitle", "itemQuantity"],
    },
    itemImage: {
      type: "field",
      label: "Image",
      value: { path: "image" },
      control: "image",
    },
    itemTitle: {
      type: "field",
      label: "Title",
      value: { path: "title" },
      control: "text",
    },
    itemQuantity: {
      type: "field",
      label: "Quantity",
      value: { path: "quantity" },
      control: "number",
    },
    actions: {
      type: "section",
      variant: "toolbar",
      children: ["save"],
    },
    save: {
      type: "action",
      label: "Save record",
      action: "submit",
      variant: "primary",
    },
  },
};

export const SALES_ORDER_SCHEMA_CODE = `const SalesOrderSchema = z.object({
  title: z.string().min(1),
  status: z.enum(["draft", "paid", "sent"]),
  customer: z.object({
    name: z.string().min(2),
  }),
  media: z.object({
    hero: z.object({
      src: z.string().url(),
      alt: z.string().min(1),
    }),
  }),
  lineItems: z.array(LineItemSchema).min(1),
});`;

export const VIEW_DOC_SCHEMA_CODE = `type ViewDoc = {
  rootId: string;
  nodes: Record<string, ViewNode>;
};

type ViewNode =
  | View
  | Section
  | Field
  | Action
  | Show
  | Each;`;
