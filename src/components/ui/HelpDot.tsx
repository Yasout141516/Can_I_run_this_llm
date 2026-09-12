export function HelpDot({ label }: { label: string }) {
  return (
    <span className="help" role="img" aria-label={label} title={label}>
      ?
    </span>
  );
}
