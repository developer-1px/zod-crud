import "antd/dist/reset.css";
import "./styles.css";

import {
  Alert,
  Button,
  ConfigProvider,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Layout,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
  type TableColumnsType,
  type TreeDataNode,
} from "antd";
import { StrictMode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createJsonCrud,
  type JsonDoc,
  type JsonNode,
  type JsonValue,
  type NodeId,
  type OperationResult,
} from "zod-crud";

import {
  DesignNodeSchema,
  SALES_ORDER_SCHEMA_CODE,
  SalesOrderSchema,
  initialDesignJson,
  initialSalesOrderData,
  orderViewDoc,
  type SalesOrder,
} from "./design-schema.js";

const { Header } = Layout;
const { Text, Title } = Typography;

type Mode = "design" | "data";

type ComponentBinding = {
  component: string;
  field: string;
  schema: string;
  operation: string;
  state: string;
  validation: string;
};

type NodeRow = {
  id: NodeId;
  label: string;
  type: JsonNode["type"];
  key: string;
  parent: string;
  childrenCount: number;
  value: string;
};

const BINDINGS: Record<string, ComponentBinding> = {
  ZodCrudBuilder: {
    component: "Builder document",
    field: "$root",
    schema: "DesignNodeSchema",
    operation: "snapshot / deserialize",
    state: "valid",
    validation: "The whole document is committed only after the Zod schema accepts it.",
  },
  MobileRecordScreen: {
    component: "Mobile preview",
    field: "salesOrder",
    schema: "SalesOrderSchema",
    operation: "read / update",
    state: "bound",
    validation: "The preview reads from the same validated order document as the form.",
  },
  HeroCard: {
    component: "Hero",
    field: "media.hero",
    schema: "z.object({ src: z.string().url(), alt: z.string() })",
    operation: "read / update",
    state: "bound",
    validation: "Media fields stay URL-safe through zod-crud updates.",
  },
  CustomerNameField: {
    component: "Customer field",
    field: "customer.name",
    schema: "z.string().min(2)",
    operation: "update",
    state: "editable",
    validation: "Invalid customer names are rejected before commit.",
  },
  OrderStatusField: {
    component: "Status field",
    field: "status",
    schema: 'z.enum(["draft", "paid", "sent"])',
    operation: "update",
    state: "editable",
    validation: "Only schema-defined status values can be committed.",
  },
  LineItemsList: {
    component: "Line items",
    field: "lineItems[]",
    schema: "z.array(LineItemSchema).min(1)",
    operation: "create / update / delete",
    state: "editable",
    validation: "Each line item is validated as part of the full order document.",
  },
  SaveButton: {
    component: "Submit",
    field: "$commit",
    schema: "SalesOrderSchema.safeParse",
    operation: "serialize",
    state: "ready",
    validation: "The button represents committing the current valid snapshot.",
  },
};

const NODE_KIND_OPTIONS = [
  { label: "Text node", value: "text" },
  { label: "Rect node", value: "rect" },
];

function makeDesignEditor() {
  return createJsonCrud(DesignNodeSchema, initialDesignJson);
}

function makeOrderEditor() {
  return createJsonCrud(SalesOrderSchema, initialSalesOrderData);
}

function App() {
  const designEditorRef = useRef(makeDesignEditor());
  const orderEditorRef = useRef(makeOrderEditor());
  const [mode, setMode] = useState<Mode>("design");
  const [designVersion, setDesignVersion] = useState(0);
  const [orderVersion, setOrderVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<NodeId>(designEditorRef.current.snapshot().rootId);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([
    designEditorRef.current.snapshot().rootId,
  ]);
  const [lastResult, setLastResult] = useState<OperationResult | null>({ ok: true });

  const designDoc = useMemo(() => designEditorRef.current.snapshot(), [designVersion]);
  const selectedNode = designDoc.nodes[selectedId] ?? designDoc.nodes[designDoc.rootId];
  const selectedName = selectedNode === undefined ? "" : primitiveField(designDoc, selectedNode.id, "name") ?? "";
  const selectedBinding = bindingFor(designDoc, selectedNode);
  const treeData = useMemo(() => [toTreeNode(designDoc, designDoc.rootId)], [designDoc]);
  const tableRows = useMemo(() => toNodeRows(designDoc), [designDoc]);
  const order = useMemo(() => orderEditorRef.current.toJson(), [orderVersion]);
  const orderDoc = useMemo(() => orderEditorRef.current.snapshot(), [orderVersion]);

  const canUndo = designEditorRef.current.canUndo();
  const canRedo = designEditorRef.current.canRedo();
  const canDelete = selectedId !== designDoc.rootId;
  const canCreate = findInsertionArray(designDoc, selectedId) !== null;
  const canUpdate = selectedNode?.type === "string";
  const canPaste = designEditorRef.current.canPaste(selectedId).ok;

  function refreshDesign() {
    const nextDoc = designEditorRef.current.snapshot();

    setDesignVersion((current) => current + 1);
    setSelectedId((current) => nextDoc.nodes[current] === undefined ? nextDoc.rootId : current);
  }

  function refreshOrder() {
    setOrderVersion((current) => current + 1);
  }

  function selectDesignNode(nodeId: NodeId) {
    if (designDoc.nodes[nodeId] === undefined) {
      return;
    }

    setSelectedId(nodeId);
    setExpandedKeys((current) => uniqueKeys([...current, ...ancestorIds(designDoc, nodeId)]));
  }

  function selectByName(name: string) {
    const nodeId = findNodeByName(designDoc, name);

    if (nodeId !== null) {
      selectDesignNode(nodeId);
    }
  }

  function commitDesign(operation: () => OperationResult | boolean) {
    const result = operation();
    const normalized: OperationResult = typeof result === "boolean"
      ? result ? { ok: true } : { ok: false, reason: "Operation did not change the document." }
      : result;

    setLastResult(normalized);
    refreshDesign();
  }

  function createNode(kind: "text" | "rect") {
    const parentId = findInsertionArray(designDoc, selectedId);

    if (parentId === null) {
      setLastResult({ ok: false, reason: "Select a collection array before creating a child." });
      return;
    }

    const parent = designDoc.nodes[parentId];
    const index = parent?.children.length ?? 0;
    const value: JsonValue = kind === "text"
      ? { kind: "text", name: `Text${index + 1}`, text: `Text ${index + 1}`, tone: "ink" }
      : { kind: "rect", name: `Box${index + 1}`, label: `Box ${index + 1}`, fill: "surface", width: 120, height: 44 };

    commitDesign(() => designEditorRef.current.create(parentId, index, value));
  }

  function updateSelectedString(value = `Edited ${new Date().toLocaleTimeString()}`) {
    if (selectedNode?.type !== "string") {
      setLastResult({ ok: false, reason: "Select a string node to update it." });
      return;
    }

    commitDesign(() => designEditorRef.current.update(selectedNode.id, value));
  }

  function copySelected() {
    designEditorRef.current.copy(selectedId);
    setLastResult({ ok: true });
  }

  function resetDesign() {
    designEditorRef.current = makeDesignEditor();
    const rootId = designEditorRef.current.snapshot().rootId;

    setSelectedId(rootId);
    setExpandedKeys([rootId]);
    setLastResult({ ok: true });
    refreshDesign();
  }

  function updateOrder(path: string, value: JsonValue) {
    const nodeId = nodeAtPointer(orderDoc, path);

    if (nodeId === null) {
      setLastResult({ ok: false, reason: `No order node exists at ${path}.` });
      return;
    }

    const result = orderEditorRef.current.update(nodeId, value);

    setLastResult(result);

    if (result.ok) {
      refreshOrder();
    }
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 4,
          colorPrimary: "#1f2937",
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        },
      }}
    >
      <Layout className="app-shell">
        <Header className="app-header">
          <div className="brand">
            <Text strong>zod-crud</Text>
            <Text type="secondary">validated JSON CRUD</Text>
          </div>
          <Tabs
            activeKey={mode}
            onChange={(value) => setMode(value as Mode)}
            items={[
              { key: "design", label: "Design" },
              { key: "data", label: "Data" },
            ]}
          />
          <Space wrap>
            <Button size="small" disabled={!canUndo} onClick={() => commitDesign(() => designEditorRef.current.undo())}>Undo</Button>
            <Button size="small" disabled={!canRedo} onClick={() => commitDesign(() => designEditorRef.current.redo())}>Redo</Button>
            <Button size="small" onClick={resetDesign}>Reset</Button>
          </Space>
        </Header>

        {mode === "design" ? (
          <DesignMode
            doc={designDoc}
            treeData={treeData}
            tableRows={tableRows}
            selectedId={selectedId}
            selectedNode={selectedNode}
            selectedName={selectedName}
            selectedBinding={selectedBinding}
            expandedKeys={expandedKeys}
            lastResult={lastResult}
            order={order}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            canPaste={canPaste}
            onExpand={setExpandedKeys}
            onSelect={selectDesignNode}
            onSelectName={selectByName}
            onCreate={createNode}
            onUpdate={updateSelectedString}
            onCopy={copySelected}
            onCut={() => commitDesign(() => designEditorRef.current.cut(selectedId))}
            onPaste={() => commitDesign(() => designEditorRef.current.paste(selectedId))}
            onDelete={() => commitDesign(() => designEditorRef.current.delete(selectedId))}
          />
        ) : (
          <DataMode
            order={order}
            orderDoc={orderDoc}
            lastResult={lastResult}
            selectedName={selectedName}
            onSelectName={selectByName}
            onUpdateOrder={updateOrder}
          />
        )}
      </Layout>
    </ConfigProvider>
  );
}

function DesignMode({
  doc,
  treeData,
  tableRows,
  selectedId,
  selectedNode,
  selectedName,
  selectedBinding,
  expandedKeys,
  lastResult,
  order,
  canCreate,
  canUpdate,
  canDelete,
  canPaste,
  onExpand,
  onSelect,
  onSelectName,
  onCreate,
  onUpdate,
  onCopy,
  onCut,
  onPaste,
  onDelete,
}: {
  doc: JsonDoc;
  treeData: TreeDataNode[];
  tableRows: NodeRow[];
  selectedId: NodeId;
  selectedNode: JsonNode | undefined;
  selectedName: string;
  selectedBinding: ComponentBinding;
  expandedKeys: React.Key[];
  lastResult: OperationResult | null;
  order: SalesOrder;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canPaste: boolean;
  onExpand: (keys: React.Key[]) => void;
  onSelect: (nodeId: NodeId) => void;
  onSelectName: (name: string) => void;
  onCreate: (kind: "text" | "rect") => void;
  onUpdate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
}) {
  return (
    <main className="workbench">
      <aside className="side-panel">
        <PanelHeader title="Layers" detail={`${Object.keys(doc.nodes).length} nodes`} />
        <Tree
          blockNode
          showLine
          treeData={treeData}
          selectedKeys={[selectedId]}
          expandedKeys={expandedKeys}
          onExpand={(keys) => onExpand(keys)}
          onSelect={(keys) => {
            const [key] = keys;

            if (typeof key === "string") {
              onSelect(key);
            }
          }}
        />
      </aside>

      <section className="preview-column">
        <div className="command-bar">
          <Space wrap>
            <Select
              size="small"
              defaultValue="text"
              options={NODE_KIND_OPTIONS}
              popupMatchSelectWidth={false}
              onSelect={(value) => onCreate(value as "text" | "rect")}
              disabled={!canCreate}
            />
            <Button size="small" disabled={!canUpdate} onClick={onUpdate}>Update</Button>
            <Button size="small" onClick={onCopy}>Copy</Button>
            <Button size="small" disabled={!canDelete} onClick={onCut}>Cut</Button>
            <Button size="small" disabled={!canPaste} onClick={onPaste}>Paste</Button>
            <Button size="small" danger disabled={!canDelete} onClick={onDelete}>Delete</Button>
          </Space>
          <ResultTag result={lastResult} />
        </div>
        <MobilePreview order={order} selectedName={selectedName} onSelectName={onSelectName} />
      </section>

      <aside className="right-panel">
        <PanelHeader title="Inspector" detail={selectedId} />
        <InspectorForm
          node={selectedNode}
          binding={selectedBinding}
          path={selectedNode === undefined ? "/" : pathString(doc, selectedNode.id)}
        />
        <NodeTable rows={tableRows} selectedId={selectedId} onSelect={onSelect} />
      </aside>
    </main>
  );
}

function DataMode({
  order,
  orderDoc,
  selectedName,
  lastResult,
  onSelectName,
  onUpdateOrder,
}: {
  order: SalesOrder;
  orderDoc: JsonDoc;
  selectedName: string;
  lastResult: OperationResult | null;
  onSelectName: (name: string) => void;
  onUpdateOrder: (path: string, value: JsonValue) => void;
}) {
  return (
    <main className="data-layout">
      <section className="data-main">
        <div className="data-summary">
          <Descriptions
            size="small"
            column={3}
            items={[
              { key: "entity", label: "Entity", children: <Tag color="green">valid</Tag> },
              { key: "nodes", label: "Order nodes", children: Object.keys(orderDoc.nodes).length },
              { key: "view", label: "UI blocks", children: Object.keys(orderViewDoc.nodes).length },
            ]}
          />
          <ResultTag result={lastResult} />
        </div>
        <div className="data-grid">
          <section className="mobile-section">
            <PanelHeader title="Preview" detail="same entity document" />
            <MobilePreview order={order} selectedName={selectedName} onSelectName={onSelectName} />
          </section>
          <section className="entity-section">
            <PanelHeader title="Entity Form" detail="zod-crud update()" />
            <OrderForm order={order} onUpdate={onUpdateOrder} />
          </section>
        </div>
      </section>
      <aside className="schema-panel">
        <PanelHeader title="Schema / UI Data" detail="source of truth" />
        <Typography.Paragraph className="code-title">SalesOrderSchema</Typography.Paragraph>
        <pre className="code-block">{SALES_ORDER_SCHEMA_CODE}</pre>
        <Typography.Paragraph className="code-title">UI bindings</Typography.Paragraph>
        <Table
          size="small"
          pagination={false}
          childrenColumnName="nestedChildren"
          rowKey="id"
          columns={[
            { title: "block", dataIndex: "id" },
            { title: "type", dataIndex: "type" },
            { title: "path", dataIndex: "path" },
          ]}
          dataSource={viewBindingRows()}
        />
      </aside>
    </main>
  );
}

function PanelHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel-header">
      <Text strong>{title}</Text>
      {detail === undefined ? null : <Text type="secondary">{detail}</Text>}
    </div>
  );
}

function ResultTag({ result }: { result: OperationResult | null }) {
  if (result === null) {
    return null;
  }

  return result.ok ? (
    <Tag color="green">valid commit</Tag>
  ) : (
    <Tag color="red">{result.reason}</Tag>
  );
}

function InspectorForm({
  node,
  binding,
  path,
}: {
  node: JsonNode | undefined;
  binding: ComponentBinding;
  path: string;
}) {
  return (
    <Form className="inspector-form" layout="vertical" size="small">
      <Form.Item label="Component">
        <Input value={binding.component} readOnly />
      </Form.Item>
      <Form.Item label="Node id">
        <Input value={node?.id ?? "none"} readOnly />
      </Form.Item>
      <Form.Item label="Node type">
        <Input value={node?.type ?? "none"} readOnly />
      </Form.Item>
      <Form.Item label="Path">
        <Input value={path} readOnly />
      </Form.Item>
      <Form.Item label="CRUD field">
        <Input value={binding.field} readOnly />
      </Form.Item>
      <Form.Item label="Operation">
        <Input value={binding.operation} readOnly />
      </Form.Item>
      <Form.Item label="Zod schema">
        <Input value={binding.schema} readOnly />
      </Form.Item>
      <Form.Item label="State">
        <Input value={binding.state} readOnly />
      </Form.Item>
      <Form.Item className="span-all" label="Validation">
        <Input.TextArea value={binding.validation} readOnly autoSize />
      </Form.Item>
    </Form>
  );
}

function NodeTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: NodeRow[];
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
}) {
  const columns: TableColumnsType<NodeRow> = [
    { title: "id", dataIndex: "id", width: 74, fixed: "left" },
    { title: "label", dataIndex: "label", ellipsis: true },
    { title: "type", dataIndex: "type", width: 92 },
    { title: "key", dataIndex: "key", ellipsis: true },
    { title: "children", dataIndex: "childrenCount", width: 86 },
    { title: "value", dataIndex: "value", ellipsis: true },
  ];

  return (
    <Table
      className="node-table"
      size="small"
      rowKey="id"
      columns={columns}
      dataSource={rows}
      childrenColumnName="nestedChildren"
      pagination={false}
      scroll={{ x: 720, y: 420 }}
      rowClassName={(row) => row.id === selectedId ? "selected-row" : ""}
      onRow={(row) => ({
        onClick: () => onSelect(row.id),
      })}
    />
  );
}

function OrderForm({
  order,
  onUpdate,
}: {
  order: SalesOrder;
  onUpdate: (path: string, value: JsonValue) => void;
}) {
  const lineItemColumns: TableColumnsType<SalesOrder["lineItems"][number] & { index: number }> = [
    {
      title: "Title",
      dataIndex: "title",
      render: (_value, item) => (
        <Input value={item.title} onChange={(event) => onUpdate(`/lineItems/${item.index}/title`, event.target.value)} />
      ),
    },
    {
      title: "Quantity",
      dataIndex: "quantity",
      width: 120,
      render: (_value, item) => (
        <InputNumber min={1} value={item.quantity} onChange={(value) => onUpdate(`/lineItems/${item.index}/quantity`, Number(value ?? 1))} />
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 130,
      render: (_value, item) => (
        <Select
          value={item.status}
          options={["ok", "new"].map((value) => ({ label: value, value }))}
          onChange={(value) => onUpdate(`/lineItems/${item.index}/status`, value)}
        />
      ),
    },
    {
      title: "Image URL",
      dataIndex: "image",
      render: (_value, item) => (
        <Input value={item.image} onChange={(event) => onUpdate(`/lineItems/${item.index}/image`, event.target.value)} />
      ),
    },
  ];

  return (
    <Form className="order-form" layout="vertical" size="middle">
      <Form.Item label="Title">
        <Input value={order.title} onChange={(event) => onUpdate("/title", event.target.value)} />
      </Form.Item>
      <Form.Item label="Customer">
        <Input value={order.customer.name} onChange={(event) => onUpdate("/customer/name", event.target.value)} />
      </Form.Item>
      <Form.Item label="Status">
        <Select
          value={order.status}
          options={["draft", "paid", "sent"].map((value) => ({ label: value, value }))}
          onChange={(value) => onUpdate("/status", value)}
        />
      </Form.Item>
      <Form.Item label="Hero image URL">
        <Input value={order.media.hero.src} onChange={(event) => onUpdate("/media/hero/src", event.target.value)} />
      </Form.Item>
      <Form.Item label="Hero alt">
        <Input value={order.media.hero.alt} onChange={(event) => onUpdate("/media/hero/alt", event.target.value)} />
      </Form.Item>

      <Title className="span-all" level={5}>Line items</Title>
      <div className="span-all">
        <Table
          size="small"
          pagination={false}
          rowKey="index"
          childrenColumnName="nestedChildren"
          columns={lineItemColumns}
          dataSource={order.lineItems.map((item, index) => ({ ...item, index }))}
          scroll={{ x: 780 }}
        />
      </div>
    </Form>
  );
}

function MobilePreview({
  order,
  selectedName,
  onSelectName,
}: {
  order: SalesOrder;
  selectedName: string;
  onSelectName: (name: string) => void;
}) {
  return (
    <div className="phone">
      <div className="phone-screen">
        <div className="statusbar">
          <Text strong>9:41</Text>
          <Text>LTE</Text>
        </div>
        <SelectablePreview name="AppToolbar" selectedName={selectedName} onSelectName={onSelectName} className="mobile-toolbar">
          <div>
            <Text type="secondary">FieldOps</Text>
            <Title level={3}>Order intake</Title>
          </div>
          <Space>
            <Button size="small">Search</Button>
            <Button size="small">Alerts</Button>
          </Space>
        </SelectablePreview>

        <SelectablePreview name="HeroCard" selectedName={selectedName} onSelectName={onSelectName} className="hero-preview">
          <img src={order.media.hero.src} alt={order.media.hero.alt} />
          <div className="hero-copy">
            <Text>{order.media.hero.alt}</Text>
            <Title level={4}>{order.title}</Title>
          </div>
        </SelectablePreview>

        <SelectablePreview name="SchemaStatusCard" selectedName={selectedName} onSelectName={onSelectName} className="schema-status">
          <div>
            <Text type="secondary">SalesOrderSchema</Text>
            <Title level={5}>Valid snapshot</Title>
          </div>
          <Tag color="green">safeParse</Tag>
        </SelectablePreview>

        <SelectablePreview name="CustomerNameField" selectedName={selectedName} onSelectName={onSelectName} className="preview-field">
          <Text strong>Customer</Text>
          <Input value={order.customer.name} readOnly />
          <Text type="secondary">z.string().min(2)</Text>
        </SelectablePreview>

        <SelectablePreview name="OrderStatusField" selectedName={selectedName} onSelectName={onSelectName} className="preview-field">
          <Text strong>Status</Text>
          <Select value={order.status} options={["draft", "paid", "sent"].map((value) => ({ label: value, value }))} />
        </SelectablePreview>

        <SelectablePreview name="LineItemsList" selectedName={selectedName} onSelectName={onSelectName} className="preview-list">
          <div className="list-heading">
            <Text strong>Line items</Text>
            <Button size="small">Add</Button>
          </div>
          {order.lineItems.map((item) => (
            <div className="preview-line-item" key={item.title}>
              <img src={item.image} alt={item.title} />
              <div>
                <Text strong>{item.title}</Text>
                <Text type="secondary">qty {item.quantity}</Text>
              </div>
              <Tag>{item.status}</Tag>
            </div>
          ))}
        </SelectablePreview>

        <SelectablePreview name="SaveButton" selectedName={selectedName} onSelectName={onSelectName}>
          <Button block type="primary">Save record</Button>
        </SelectablePreview>
      </div>
    </div>
  );
}

function SelectablePreview({
  name,
  selectedName,
  onSelectName,
  className,
  children,
}: {
  name: string;
  selectedName: string;
  onSelectName: (name: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`preview-hit ${className ?? ""} ${selectedName === name ? "selected" : ""}`}
      onClick={() => onSelectName(name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectName(name);
        }
      }}
    >
      {children}
    </div>
  );
}

function bindingFor(doc: JsonDoc, node: JsonNode | undefined): ComponentBinding {
  const name = node === undefined ? undefined : primitiveField(doc, node.id, "name");

  if (name !== undefined && BINDINGS[name] !== undefined) {
    return BINDINGS[name];
  }

  return {
    component: name ?? "Node",
    field: node === undefined ? "none" : pathString(doc, node.id),
    schema: node?.type ?? "unknown",
    operation: "read",
    state: "selected",
    validation: "This node is part of the current schema-valid zod-crud document.",
  };
}

function toTreeNode(doc: JsonDoc, nodeId: NodeId): TreeDataNode {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return { key: nodeId, title: nodeId };
  }

  return {
    key: node.id,
    title: `${nodeLabel(doc, node)} · ${node.type}`,
    children: node.children.map((childId) => toTreeNode(doc, childId)),
  };
}

function toNodeRows(doc: JsonDoc): NodeRow[] {
  return Object.values(doc.nodes).map((node) => ({
    id: node.id,
    label: nodeLabel(doc, node),
    type: node.type,
    key: node.key === null ? "root" : String(node.key),
    parent: node.parentId ?? "-",
    childrenCount: node.children.length,
    value: node.value === undefined ? "" : String(node.value),
  }));
}

function nodeLabel(doc: JsonDoc, node: JsonNode) {
  if (node.type === "object") {
    return primitiveField(doc, node.id, "name") ?? primitiveField(doc, node.id, "role") ?? String(node.key ?? node.id);
  }

  if (node.type === "array") {
    return `${String(node.key ?? "array")}[]`;
  }

  return `${String(node.key ?? "value")}: ${String(node.value)}`;
}

function primitiveField(doc: JsonDoc, nodeId: NodeId, key: string): string | undefined {
  const child = childByKey(doc, nodeId, key);

  if (child?.type === "string" && typeof child.value === "string") {
    return child.value;
  }

  return undefined;
}

function childByKey(doc: JsonDoc, nodeId: NodeId, key: string | number): JsonNode | undefined {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return undefined;
  }

  const childId = node.children.find((id) => doc.nodes[id]?.key === key);
  return childId === undefined ? undefined : doc.nodes[childId];
}

function pathString(doc: JsonDoc, nodeId: NodeId) {
  const segments: Array<string | number> = [];
  let current = doc.nodes[nodeId];

  while (current !== undefined && current.parentId !== null) {
    if (current.key !== null) {
      segments.unshift(current.key);
    }

    current = doc.nodes[current.parentId];
  }

  return `/${segments.map(String).join("/")}`;
}

function ancestorIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const ids: NodeId[] = [];
  let current = doc.nodes[nodeId];

  while (current?.parentId !== null && current?.parentId !== undefined) {
    ids.push(current.parentId);
    current = doc.nodes[current.parentId];
  }

  return ids;
}

function uniqueKeys(keys: React.Key[]) {
  return Array.from(new Set(keys));
}

function findNodeByName(doc: JsonDoc, name: string): NodeId | null {
  for (const node of Object.values(doc.nodes)) {
    if (node.type === "object" && primitiveField(doc, node.id, "name") === name) {
      return node.id;
    }
  }

  return null;
}

function findInsertionArray(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  if (node.type === "array") {
    return node.id;
  }

  for (const childId of node.children) {
    const child = doc.nodes[childId];

    if (child?.type === "array") {
      return child.id;
    }

    if (child?.type === "object" && child.key === "collections") {
      for (const collectionId of child.children) {
        const collection = doc.nodes[collectionId];

        if (collection?.type === "array") {
          return collection.id;
        }
      }
    }
  }

  return null;
}

function nodeAtPointer(doc: JsonDoc, path: string): NodeId | null {
  const segments = path.split("/").filter(Boolean);
  let currentId = doc.rootId;

  for (const rawSegment of segments) {
    const current = doc.nodes[currentId];
    const key = current?.type === "array" ? Number(rawSegment) : rawSegment;
    const child = childByKey(doc, currentId, key);

    if (child === undefined) {
      return null;
    }

    currentId = child.id;
  }

  return currentId;
}

function viewBindingRows() {
  return Object.entries(orderViewDoc.nodes).map(([id, node]) => ({
    id,
    type: node.type,
    path: node.type === "field" ? node.value.path : node.type === "each" ? node.items.path : "-",
  }));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
