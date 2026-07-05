export default function Placeholder({
  code,
  title,
  note,
}: {
  code: string;
  title: string;
  note: string;
}) {
  return (
    <div className="placeholder">
      <div className="placeholder-glyph">{code}</div>
      <h1 className="placeholder-title">{title}</h1>
      <p className="placeholder-note">{note}</p>
    </div>
  );
}
