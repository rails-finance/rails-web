interface ArrowProps {
  direction?: "in" | "out";
}

export function Arrow({ direction }: ArrowProps) {
  if (!direction) {
    return null;
  }
  // "in" = money going into protocol (arrow on left pointing right)
  // "out" = money coming from protocol (arrow on right pointing right)
  const points =
    direction === "in"
      ? "220 170, 140 170, 140 110, 30 200, 140 290, 140 230, 220 230" // Left arrow pointing right (into protocol)
      : "580 170, 660 170, 660 110, 770 200, 660 290, 660 230, 580 230"; // Right arrow pointing right (out to user)

  return <polygon points={points} fill="#45556C" />;
}
