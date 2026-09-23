/**
 * Facehash — deterministic face avatar from an Ethereum address.
 * Rounded square with colored background + eyes only (no mouth, no letter).
 * Eyes blink occasionally.
 */
"use client";

import { useState, useEffect } from "react";

interface FacehashProps {
  address: string;
  size?: number;
  isBot?: boolean;
}

// Hash the full address so every character contributes to the visual.
// Uses FNV-1a to produce a 32-bit hash, then extracts pseudo-nibbles.
function hashAddress(addr: string): number[] {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 2; i < addr.length; i++) {
    h ^= addr.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  h = h >>> 0; // unsigned
  // Run a second round with reversed input for more bits
  let h2 = 0x811c9dc5;
  for (let i = addr.length - 1; i >= 2; i--) {
    h2 ^= addr.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  h2 = h2 >>> 0;
  // Extract 8 nibbles (4 from each hash)
  return [
    (h >>> 28) & 0xf,
    (h >>> 24) & 0xf,
    (h >>> 20) & 0xf,
    (h >>> 16) & 0xf,
    (h2 >>> 28) & 0xf,
    (h2 >>> 24) & 0xf,
    (h2 >>> 20) & 0xf,
    (h2 >>> 16) & 0xf,
  ];
}

export function Facehash({ address, size = 20, isBot }: FacehashProps) {
  const a = (address || "0x0000000000000000000000000000000000000000").toLowerCase();
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    function scheduleBlink() {
      const delay = 2000 + Math.random() * 4000;
      timeout = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 150);
      }, delay);
    }
    scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  const n = hashAddress(a);
  const hue = (n[0] * 16 + n[1]) * 1.41;
  const sat = 45 + n[2] * 2.5;
  const lum = 35 + n[3] * 1.5;
  const bg = `hsl(${hue}, ${sat}%, ${lum}%)`;

  const eyeVariant = n[4] % 6;
  const eyeY = 9 + (n[5] % 3);

  const leftX = 6.5;
  const rightX = 13.5;

  const eyeColor = lum > 45 ? "#1e293b" : "#e2e8f0";

  if (blinking) {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 block">
        <rect
          x={isBot ? 0.5 : 0}
          y={isBot ? 0.5 : 0}
          width={isBot ? 19 : 20}
          height={isBot ? 19 : 20}
          rx="4.4"
          ry="4.4"
          fill={bg}
          stroke={isBot ? "currentColor" : "none"}
          strokeWidth={isBot ? 1 : 0}
          className={isBot ? "text-foreground" : ""}
        />
        <line
          x1={leftX - 1.6}
          y1={eyeY}
          x2={leftX + 1.6}
          y2={eyeY}
          stroke={eyeColor}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <line
          x1={rightX - 1.6}
          y1={eyeY}
          x2={rightX + 1.6}
          y2={eyeY}
          stroke={eyeColor}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  function renderEyes() {
    switch (eyeVariant) {
      case 0:
        return (
          <>
            <circle cx={leftX} cy={eyeY} r="1.8" fill={eyeColor} />
            <circle cx={rightX} cy={eyeY} r="1.8" fill={eyeColor} />
          </>
        );
      case 1:
        return (
          <>
            <circle cx={leftX} cy={eyeY} r="1.2" fill={eyeColor} />
            <circle cx={rightX} cy={eyeY} r="1.2" fill={eyeColor} />
          </>
        );
      case 2:
        return (
          <>
            <line
              x1={leftX - 1.8}
              y1={eyeY}
              x2={leftX + 1.8}
              y2={eyeY}
              stroke={eyeColor}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <line
              x1={rightX - 1.8}
              y1={eyeY}
              x2={rightX + 1.8}
              y2={eyeY}
              stroke={eyeColor}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </>
        );
      case 3:
        return (
          <>
            <circle cx={leftX} cy={eyeY} r="2.2" fill={eyeColor} />
            <circle cx={leftX} cy={eyeY} r="0.9" fill={bg} />
            <circle cx={rightX} cy={eyeY} r="2.2" fill={eyeColor} />
            <circle cx={rightX} cy={eyeY} r="0.9" fill={bg} />
          </>
        );
      case 4:
        return (
          <>
            <path d={`M${leftX - 1.8} ${eyeY} Q${leftX} ${eyeY - 2.5} ${leftX + 1.8} ${eyeY}`} fill={eyeColor} />
            <path d={`M${rightX - 1.8} ${eyeY} Q${rightX} ${eyeY - 2.5} ${rightX + 1.8} ${eyeY}`} fill={eyeColor} />
          </>
        );
      case 5:
        return (
          <>
            <ellipse cx={leftX} cy={eyeY} rx="1.2" ry="2" fill={eyeColor} />
            <ellipse cx={rightX} cy={eyeY} rx="1.2" ry="2" fill={eyeColor} />
          </>
        );
      default:
        return null;
    }
  }

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 block">
      <rect
        x={isBot ? 0.5 : 0}
        y={isBot ? 0.5 : 0}
        width={isBot ? 19 : 20}
        height={isBot ? 19 : 20}
        rx="4.4"
        ry="4.4"
        fill={bg}
        stroke={isBot ? "currentColor" : "none"}
        strokeWidth={isBot ? 1 : 0}
        className={isBot ? "text-foreground" : ""}
      />
      {renderEyes()}
    </svg>
  );
}
