export function Badge({ source }: { source: "measured" | "estimated" }) {
  const measured = source === "measured";
  return (
    <span
      className={`badge ${source}`}
      title={
        measured
          ? "Size read from a published file"
          : "Size computed from parameters × bits-per-weight"
      }
    >
      {measured ? "Measured" : "Estimated"}
    </span>
  );
}
