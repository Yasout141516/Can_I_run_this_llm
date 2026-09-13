/** The engine's reason for a verdict. Renders nothing when there is none. */
export function WhyNote({ note }: { note: string | undefined }) {
  if (!note) return null;
  return (
    <p className="why">
      <b>Why</b> <span>{note}</span>
    </p>
  );
}
