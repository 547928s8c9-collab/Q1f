import { useEffect, useRef, useState, useCallback } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
  className?: string;
  "data-testid"?: string;
}

export function AnimatedNumber({
  value,
  duration = 600,
  formatter = (n) => n.toFixed(2),
  className,
  "data-testid": testId,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);

  const animate = useCallback(
    (from: number, to: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = performance.now();

      const step = (now: number) => {
        const elapsed = now - startRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(from + (to - from) * eased);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        }
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [duration]
  );

  useEffect(() => {
    if (prevRef.current !== value) {
      animate(prevRef.current, value);
      prevRef.current = value;
    }
  }, [value, animate]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <span className={className} data-testid={testId}>{formatter(display)}</span>;
}
