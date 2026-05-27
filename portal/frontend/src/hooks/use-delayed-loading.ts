import { useEffect, useRef, useState } from "react";

const MIN_DISPLAY_MS = 600;

export function useDelayedLoading(loading: boolean): boolean {
  const [show, setShow] = useState(true);
  const shownAt = useRef<number>(Date.now());

  useEffect(() => {
    if (loading) {
      shownAt.current = Date.now();
      setShow(true);
      return;
    }
    // Data is ready — keep skeleton visible for the remaining minimum time
    const elapsed = Date.now() - shownAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const timer = setTimeout(() => setShow(false), remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  return show;
}
