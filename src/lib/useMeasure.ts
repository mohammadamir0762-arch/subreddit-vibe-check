import { useEffect, useRef, useState } from 'react';

/**
 * Tracks a container's width so charts can be laid out in real pixels.
 *
 * The alternative — a fixed viewBox scaled with CSS — stretches label text along
 * with the geometry, so type ends up a different size in every chart. Measuring
 * instead keeps every axis label at the size it was designed at.
 */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
