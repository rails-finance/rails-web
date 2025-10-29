"use client";

import { motion, AnimatePresence } from "framer-motion";

interface FadeNumberProps {
  value: number;
  formatFn?: (value: number) => string | number;
  decimals?: number;
  animateOnMount?: boolean;
}

export function FadeNumber({ value, formatFn, decimals = 2, animateOnMount = false }: FadeNumberProps) {
  const formattedValue = formatFn
    ? String(formatFn(value))
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      });

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={formattedValue}
        initial={animateOnMount ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {formattedValue}
      </motion.span>
    </AnimatePresence>
  );
}
