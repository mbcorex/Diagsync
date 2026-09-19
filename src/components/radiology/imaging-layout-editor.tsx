// src/components/radiology/imaging-layout-editor.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// A4 at 96dpi. These must stay in step with report-rendering.ts, which uses the
// same numbers for the .page element.
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;

// Every coordinate below is a percentage of the PAGE WIDTH - y and h included.
// One axis for all four keeps positions stable however tall the report grows
// and however this canvas is scaled to fit the panel. renderImagingLayers() in
// report-rendering.ts reads them the same way and pins each image to the sheet.
const DEFAULT_ASPECT = 0.75;
const MIN_TILE_WIDTH = 2;
// Images may hang off the sheet a little, but must stay grabbable.
const MIN_X = -20;
const MAX_X = 100;

export interface ImagingLayoutFile {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
}

export interface ImagingLayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** height is still a guess from the default aspect; corrected once the image loads */
  auto?: boolean;
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function createImagingLayoutItem(fileId: string, index: number): ImagingLayoutItem {
  const w = 40;
  // Drop it below the letterhead and patient block, stepped so a second image
  // does not land exactly on the first.
  return { id: fileId, x: 30, y: 30 + index * 5, w, h: w * DEFAULT_ASPECT, auto: true };
}

export function normalizeImagingLayout(raw: unknown): ImagingLayoutItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ImagingLayoutItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = String((entry as any).id ?? "").trim();
    if (!id) continue;
    const w = clamp(toNumber((entry as any).w, 40), MIN_TILE_WIDTH, 100);
    const h = toNumber((entry as any).h, 0);
    items.push({
      id,
      x: clamp(toNumber((entry as any).x, 0), MIN_X, MAX_X),
      y: Math.max(0, toNumber((entry as any).y, 0)),
      w,
      h: h > 0 ? h : w * DEFAULT_ASPECT,
      auto: (entry as any).auto === true || !(h > 0),
    });
  }
  return items;
}

type DragState = {
  index: number;
  mode: "move" | "resize";
  start: { x: number; y: number };
  origin: ImagingLayoutItem;
};

type Props = {
  taskId: string;
  imagingFiles: ImagingLayoutFile[];
  getLayout: () => unknown;
  onChange: (layout: ImagingLayoutItem[]) => void;
  /** persists the draft so the server-rendered preview reflects what is on screen */
  onRequestSave?: () => Promise<unknown> | unknown;
};

export function ImagingLayoutEditor({ taskId, imagingFiles, getLayout, onChange, onRequestSave }: Props) {
  const [layout, setLayout] = useState<ImagingLayoutItem[]>(() => normalizeImagingLayout(getLayout()));
  const [scale, setScale] = useState(1);
  const [frameHeight, setFrameHeight] = useState(PAGE_HEIGHT_PX);
  const [region, setRegion] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});

  const layoutRef = useRef(layout);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const saveRef = useRef(onRequestSave);
  const changeRef = useRef(onChange);

  const fileSignature = imagingFiles.map((file) => file.id).join(",");

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Keep callbacks in refs so debounced work always runs against the latest
  // parent state rather than the closure it was scheduled from.
  useEffect(() => {
    saveRef.current = onRequestSave;
    changeRef.current = onChange;
  });

  useEffect(() => {
    setLayout(normalizeImagingLayout(getLayout()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, fileSignature]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Fit the A4 sheet to whatever width the panel gets.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setScale(Math.min(1, (el.clientWidth || PAGE_WIDTH_PX) / PAGE_WIDTH_PX));
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const refreshPreview = useCallback(async () => {
    setPreviewState("loading");
    try {
      await saveRef.current?.();
    } catch {
      // Fall through: the preview then shows the last saved state, which is
      // still more useful than a blank canvas.
    }
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    void refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) {
        setPreviewState("error");
        return;
      }
      const docHeight = Math.max(
        doc.documentElement?.scrollHeight ?? 0,
        doc.body?.scrollHeight ?? 0,
        PAGE_HEIGHT_PX
      );
      setFrameHeight(docHeight);
      // Anchor to the sheet itself: images are pinned to .page, not to any
      // block inside the content column.
      const node = doc.querySelector(".page");
      if (!node) {
        setRegion(null);
        setPreviewState("ready");
        return;
      }
      const rect = node.getBoundingClientRect();
      setRegion({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      setPreviewState("ready");
    } catch {
      setPreviewState("error");
    }
  }, []);

  function handleFrameLoad() {
    measure();
    // The frame grows to the document height after the first measure; take a
    // second reading once that has settled.
    window.setTimeout(measure, 80);
  }

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      void refreshPreview();
    }, 500);
  }, [refreshPreview]);

  const commit = useCallback(
    (next: ImagingLayoutItem[], refresh = true) => {
      changeRef.current(next);
      if (refresh) scheduleRefresh();
    },
    [scheduleRefresh]
  );

  const canvasWidth = (region?.width ?? PAGE_WIDTH_PX) * scale;
  const canvasHeight = (region?.height ?? frameHeight) * scale;
  const canvasTop = (region?.top ?? 0) * scale;
  const canvasLeft = (region?.left ?? 0) * scale;
  const toPx = (value: number) => (value / 100) * canvasWidth;

  function pctFromClient(clientX: number, clientY: number) {
    const el = canvasRef.current;
    if (!el || canvasWidth <= 0) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    // Both axes divide by width: y is measured in width-percent units too.
    return {
      x: ((clientX - rect.left) / canvasWidth) * 100,
      y: ((clientY - rect.top) / canvasWidth) * 100,
    };
  }

  function startDrag(event: React.PointerEvent, index: number, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    const item = layoutRef.current[index];
    if (!item) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // pointer capture is a nicety, dragging still works without it
    }
    dragRef.current = {
      index,
      mode,
      start: pctFromClient(event.clientX, event.clientY),
      origin: { ...item },
    };
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const current = pctFromClient(event.clientX, event.clientY);
    const dx = current.x - drag.start.x;
    const dy = current.y - drag.start.y;

    setLayout((prev) =>
      prev.map((item, index) => {
        if (index !== drag.index) return item;
        if (drag.mode === "move") {
          return {
            ...item,
            x: clamp(drag.origin.x + dx, MIN_X, MAX_X),
            y: Math.max(0, drag.origin.y + dy),
          };
        }
        const width = clamp(drag.origin.w + dx, MIN_TILE_WIDTH, MAX_X);
        const originAspect = drag.origin.w > 0 ? drag.origin.h / drag.origin.w : 0;
        const aspect = aspects[item.id] ?? (originAspect > 0 ? originAspect : DEFAULT_ASPECT);
        return { ...item, w: width, h: width * aspect, auto: false };
      })
    );
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (!dragRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    commit(layoutRef.current);
  }

  function handleTileLoad(fileId: string, image: HTMLImageElement) {
    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) return;
    const aspect = naturalHeight / naturalWidth;
    setAspects((prev) => (prev[fileId] === aspect ? prev : { ...prev, [fileId]: aspect }));

    const current = layoutRef.current;
    if (!current.some((item) => item.id === fileId && item.auto)) return;
    const next = current.map((item) =>
      item.id === fileId && item.auto ? { ...item, h: item.w * aspect, auto: false } : item
    );
    setLayout(next);
    commit(next);
  }

  function removeItem(index: number) {
    const next = layoutRef.current.filter((_, i) => i !== index);
    setLayout(next);
    commit(next);
  }

  const previewSrc = `/api/radiology/tasks/${encodeURIComponent(taskId)}/preview?layoutEditor=1&v=${nonce}`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          Drag anywhere on the sheet, resize from the bottom-right corner. This is the real report
          page, so what you see here is what prints.
        </p>
        <button
          type="button"
          onClick={() => void refreshPreview()}
          className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          {previewState === "loading" ? "Refreshing..." : "Refresh preview"}
        </button>
      </div>

      {previewState === "error" ? (
        <p className="mb-2 text-[11px] text-amber-600">
          Live page preview unavailable - positioning against a blank sheet instead.
        </p>
      ) : null}

      <div ref={wrapRef} className="overflow-hidden rounded border border-slate-200 bg-slate-100 p-2">
        <div
          className="relative mx-auto bg-white shadow-sm"
          style={{ width: PAGE_WIDTH_PX * scale, height: frameHeight * scale }}
        >
          <iframe
            ref={frameRef}
            src={previewSrc}
            title="Report preview"
            onLoad={handleFrameLoad}
            style={{
              width: PAGE_WIDTH_PX,
              height: frameHeight,
              border: "0",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "none",
            }}
          />

          <div
            ref={canvasRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute"
            style={{
              top: canvasTop,
              left: canvasLeft,
              width: canvasWidth,
              height: canvasHeight,
              background: region ? "transparent" : "rgba(241,245,249,0.9)",
              touchAction: "none",
            }}
          >
            {layout.map((item, index) => {
              const file = imagingFiles.find((entry) => entry.id === item.id);
              if (!file) return null;
              return (
                <div
                  key={`${item.id}-${index}`}
                  onPointerDown={(event) => startDrag(event, index, "move")}
                  style={{
                    position: "absolute",
                    left: toPx(item.x),
                    top: toPx(item.y),
                    width: toPx(item.w),
                    height: toPx(item.h),
                    cursor: "move",
                    border: "1px solid #94a3b8",
                    borderRadius: 4,
                    overflow: "hidden",
                    background: "white",
                    touchAction: "none",
                  }}
                >
                  <img
                    src={file.fileUrl}
                    alt={file.fileName}
                    onLoad={(event) => handleTileLoad(item.id, event.currentTarget)}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                  <div
                    onPointerDown={(event) => startDrag(event, index, "resize")}
                    title="Resize"
                    style={{
                      position: "absolute",
                      right: 3,
                      bottom: 3,
                      width: 12,
                      height: 12,
                      background: "rgba(15,23,42,0.65)",
                      cursor: "nwse-resize",
                      borderRadius: 2,
                      touchAction: "none",
                    }}
                  />
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeItem(index);
                    }}
                    className="absolute right-1 top-1 rounded bg-white/90 px-1 text-xs leading-4 text-red-600"
                    title="Remove from layout"
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        Positions are saved with the draft. Click Save Draft to keep them.
      </p>
    </div>
  );
}
