export function PanelTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      {detail === undefined ? null : <span>{detail}</span>}
    </div>
  );
}
