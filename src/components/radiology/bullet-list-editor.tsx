"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

interface BulletListEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

function splitIntoBullets(text: string): string[] {
  if (!text.trim()) return [""];

  // Split by newlines first
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length > 1) {
    // Strip common bullet prefixes from each line
    return lines.map((line) =>
      line.replace(/^[\s]*[-*•‣▪▶→›❯]+\s*/, "").replace(/^[\s]*[0-9]+[.)]\s*/, "").trim()
    );
  }

  // Single line - check for semicolons
  const single = lines[0] || text;
  if (single.includes(";") && single.split(";").length > 1) {
    return single.split(";").map((s) => s.trim());
  }

  // Check for colon-separated items like "Liver: ... Gallbladder: ..."
  // First, try splitting with space: "... Gallbladder:"
  let colonSplit = single.split(/(?<=[.:!?])\s+(?=[A-ZÄÖÜÀ-ÿ][a-z]*:)/);
  if (colonSplit.length === 1) {
    // No space - try without space requirement: "...Gallbladder:"
    colonSplit = single.split(/(?<=[.:!?])(?=[A-ZÄÖÜÀ-ÿ][a-z]*:)/);
  }
  if (colonSplit.length > 1) {
    return colonSplit.map((s) => s.trim());
  }

  // Fallback: try generic uppercase letter split with or without space
  const genericSplit = single.split(/(?<=[.:!?])\s*(?=[A-ZÄÖÜÀ-ÿ])/);
  if (genericSplit.length > 1 && genericSplit.every((s) => s.length > 5)) {
    return genericSplit.map((s) => s.trim());
  }

  return [single];
}

function joinBullets(bullets: string[]): string {
  return bullets.filter((b) => b.trim().length > 0).join("\n");
}

export function BulletListEditor({
  value,
  onChange,
  placeholder = "Type each finding on a new line...",
  label,
  rows = 2,
  disabled = false,
  className = "",
}: BulletListEditorProps) {
  const [bullets, setBullets] = useState<string[]>(() => {
    const initial = splitIntoBullets(value);
    return initial.length === 0 ? [""] : initial;
  });
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Sync external value changes
  useEffect(() => {
    const newBullets = splitIntoBullets(value);
    const currentNonEmpty = bullets.filter((b) => b !== "");
    if (JSON.stringify(newBullets) !== JSON.stringify(currentNonEmpty)) {
      setBullets(newBullets.length === 0 ? [""] : newBullets);
    }
  }, [value]);

  const emitChange = (newBullets: string[]) => {
    const filtered = newBullets.filter((b, idx) => b.trim().length > 0 || idx === newBullets.length - 1);
    if (filtered.length === 0) filtered.push("");
    setBullets(filtered);
    onChange(joinBullets(filtered));
  };

  const updateBullet = (index: number, text: string) => {
    const next = [...bullets];
    next[index] = text;
    emitChange(next);
  };

  const addBullet = () => {
    const next = [...bullets, ""];
    emitChange(next);
    setTimeout(() => {
      const newIndex = next.length - 1;
      setFocusedIndex(newIndex);
      inputRefs.current[newIndex]?.focus();
    }, 10);
  };

  const removeBullet = (index: number) => {
    if (bullets.length === 1) {
      updateBullet(index, "");
      return;
    }
    const next = bullets.filter((_, i) => i !== index);
    if (next.length === 0) next.push("");
    emitChange(next);
    if (index > 0) {
      setTimeout(() => {
        setFocusedIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }, 10);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addBullet();
    }
    if (e.key === "Backspace" && bullets[index] === "" && bullets.length > 1) {
      e.preventDefault();
      removeBullet(index);
    }
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      setFocusedIndex(index - 1);
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowDown" && index < bullets.length - 1) {
      e.preventDefault();
      setFocusedIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const pastedBullets = splitIntoBullets(pasted);

    if (pastedBullets.length > 1) {
      // Replace current bullet with first pasted bullet, then insert the rest
      const newBullets = [...bullets];
      newBullets[index] = pastedBullets[0] || "";
      const insertPosition = index + 1;
      newBullets.splice(insertPosition, 0, ...pastedBullets.slice(1));
      emitChange(newBullets);
      setTimeout(() => {
        const focusIdx = Math.min(insertPosition + pastedBullets.slice(1).length - 1, newBullets.length - 1);
        setFocusedIndex(focusIdx);
        inputRefs.current[focusIdx]?.focus();
      }, 10);
    } else {
      // Single bullet - just insert into current field
      const current = bullets[index];
      const target = e.target as HTMLTextAreaElement;
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      const newValue = current.slice(0, selectionStart) + pasted + current.slice(selectionEnd);
      updateBullet(index, newValue);
      setTimeout(() => {
        const targetEl = inputRefs.current[index];
        if (targetEl) {
          targetEl.selectionStart = selectionStart + pasted.length;
          targetEl.selectionEnd = selectionStart + pasted.length;
        }
      }, 10);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      )}
      <div className="space-y-2">
        {bullets.map((bullet, idx) => (
          <div key={`bullet-${idx}`} className="flex items-start gap-2">
            <div className="mt-2 flex-shrink-0">
              <span className="text-slate-400 text-sm">•</span>
            </div>
            <textarea
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              value={bullet}
              onChange={(e) => updateBullet(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={(e) => handlePaste(idx, e)}
              onFocus={() => setFocusedIndex(idx)}
              disabled={disabled}
              rows={Math.min(rows, bullet.split("\n").length + 1)}
              className="flex-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              placeholder={idx === bullets.length - 1 ? placeholder : ""}
            />
            <button
              type="button"
              onClick={() => removeBullet(idx)}
              disabled={disabled}
              className="mt-1 flex-shrink-0 rounded p-1 text-slate-400 hover:text-red-500 disabled:opacity-40 transition-colors"
              title="Remove bullet"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addBullet}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add bullet point
      </button>
      <p className="text-[10px] text-slate-400 mt-1">
        Press <kbd className="px-1 rounded bg-slate-100 text-slate-600">Enter</kbd> for new bullet. Paste multi-line text to auto-split.
      </p>
    </div>
  );
}