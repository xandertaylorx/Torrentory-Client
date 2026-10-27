import { useEffect, useRef } from "react";

export function DotShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !container || !context) return;

    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const theme = matchMedia("(prefers-color-scheme: dark)");
    const target = { x: -1000, y: -1000 };
    const mouse = { ...target };
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = false;
    let lastTime = 0;
    let elapsed = 0;

    function draw(now: number) {
      frame = 0;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.064) : 0;
      lastTime = now;
      if (!motion.matches) elapsed += dt;
      const easing = 1 - Math.exp(-14 * dt);
      mouse.x += (target.x - mouse.x) * easing;
      mouse.y += (target.y - mouse.y) * easing;
      context!.clearRect(0, 0, width, height);

      const base = theme.matches ? 245 : 17;
      const accent = theme.matches ? [0, 240, 255] : [0, 125, 145];
      const spacing = 22;
      const offsetX = (width % spacing) / 2;
      const offsetY = height % spacing;
      for (let row = 0, y = offsetY; y < height; row++, y += spacing) {
        for (let col = 0, x = offsetX; x < width; col++, x += spacing) {
          let py = y + (motion.matches ? 0 : Math.sin(col * 0.15 + row * 0.15 + elapsed * 1.5));
          let px = x;
          const distance = Math.hypot(px - mouse.x, py - mouse.y);
          const normalized = Math.min(distance / 180, 1);
          const proximity = motion.matches ? 0 : 1 - normalized * normalized * (3 - 2 * normalized);
          if (distance > 0) {
            px += (px - mouse.x) / distance * proximity * 8.4;
            py += (py - mouse.y) / distance * proximity * 8.4;
          }
          const [r, g, b] = accent.map(channel => Math.round(base + (channel - base) * proximity));
          context!.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.16 + proximity * 0.64})`;
          context!.beginPath();
          context!.arc(px, py, 1.25 * (1 + proximity * 1.2), 0, Math.PI * 2);
          context!.fill();
        }
      }
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
    }

    function start() {
      if (frame) cancelAnimationFrame(frame);
      lastTime = 0;
      frame = requestAnimationFrame(draw);
    }

    function resize() {
      width = container!.clientWidth;
      height = container!.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      start();
    }

    function move(event: PointerEvent) {
      if (event.pointerType === "touch" || motion.matches) return;
      const rect = canvas!.getBoundingClientRect();
      if (target.x === -1000) {
        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;
      }
      target.x = event.clientX - rect.left;
      target.y = event.clientY - rect.top;
    }

    function leave() {
      target.x = mouse.x = -1000;
      target.y = mouse.y = -1000;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else if (frame) { cancelAnimationFrame(frame); frame = 0; }
    });
    intersectionObserver.observe(container);
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerleave", leave);
    motion.addEventListener("change", start);
    theme.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerleave", leave);
      motion.removeEventListener("change", start);
      theme.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="dot-shader" />;
}
