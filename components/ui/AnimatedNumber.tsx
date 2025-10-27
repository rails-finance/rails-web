"use client";

import { useEffect, useRef } from "react";
import { useSpring, useMotionValue, useTransform, motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  formatFn?: (value: number) => string | number;
  decimals?: number;
  animateOnMount?: boolean;
}

export function AnimatedNumber({ value, formatFn, decimals = 2, animateOnMount = false }: AnimatedNumberProps) {
  const motionValue = useMotionValue(animateOnMount ? 0 : value);
  const springValue = useSpring(motionValue, {
    damping: 20,
    stiffness: 100,
  });

  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip animation on first render unless animateOnMount is true
    if (isFirstRender.current && !animateOnMount) {
      isFirstRender.current = false;
      motionValue.set(value);
      return;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
    }

    // Animate to new value
    motionValue.set(value);
  }, [value, motionValue, animateOnMount]);

  const display = useTransform(springValue, (latest) => {
    if (formatFn) {
      const result = formatFn(latest);
      return String(result);
    }
    // Default: show number with specified decimals (remove trailing zeros)
    return latest.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });
  });

  return <motion.span>{display}</motion.span>;
}
