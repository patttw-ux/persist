import { useEffect, useState } from "react";

export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let frameId = 0;

    const step = (now: number) => {
      if (start === null) {
        start = now;
      }
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / duration);
      setValue(Math.round(target * ratio));
      if (ratio < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    setValue(0);
    frameId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return value;
}
