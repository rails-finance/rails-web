interface ArcProps {
  type: "top" | "bottom";
}

export function Arc({ type }: ArcProps) {
  const d = type === "top" ? "M 220 200 A 180 180 0 0 1 580 200" : "M 220 200 A 180 180 0 0 0 580 200";

  return <path className={`svg-stroke ${type}-arc`} d={d} fill="none" stroke="#45556C" strokeWidth="20" />;
}
