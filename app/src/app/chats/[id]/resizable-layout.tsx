"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export default function ResizableLayout({
  main,
  sidebar,
}: {
  main: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(320); // px, restored from localStorage below
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // restore saved width on mount
  useEffect(() => {
    const saved = localStorage.getItem("daemon-sidebar-width");
    // Restoring a browser preference after hydration intentionally requires a
    // one-time state update; the server cannot read localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setSidebarWidth(Number(saved));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      const clamped = Math.min(Math.max(newWidth, 220), 500); // min 220px, max 500px
      setSidebarWidth(clamped);
    }

    function handleMouseUp() {
      setDragging(false);
      localStorage.setItem("daemon-sidebar-width", String(sidebarWidth));
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, sidebarWidth]);

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {main}
      </div>

      {/* drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 shrink-0 cursor-col-resize hover:bg-neutral-600 transition-colors ${
          dragging ? "bg-neutral-500" : "bg-transparent"
        }`}
      />

      <div
        style={{ width: sidebarWidth }}
        className="shrink-0 border-l border-neutral-800 flex flex-col overflow-hidden"
      >
        {sidebar}
      </div>
    </div>
  );
}
