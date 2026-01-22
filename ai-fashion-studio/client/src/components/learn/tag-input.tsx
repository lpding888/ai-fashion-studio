"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TagInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  maxTags?: number;
  placeholder?: string;
  disabled?: boolean;
};

const DEFAULT_MAX_TAGS = 20;

function normalizeTags(tags: string[], maxTags: number) {
  const dedup = new Map<string, string>();
  for (const raw of tags) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, trimmed);
    if (dedup.size >= maxTags) break;
  }
  return Array.from(dedup.values());
}

function splitTags(input: string) {
  return input
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function TagInput({
  value,
  onChange,
  maxTags = DEFAULT_MAX_TAGS,
  placeholder = "输入标签，回车添加",
  disabled = false,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("");

  const commitDraft = React.useCallback(() => {
    const next = normalizeTags([...value, ...splitTags(draft)], maxTags);
    if (next.length !== value.length) {
      onChange(next);
    }
    setDraft("");
  }, [draft, maxTags, onChange, value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground">暂无标签</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || value.length >= maxTags}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={() => {
            if (draft.trim()) commitDraft();
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={commitDraft}
          disabled={disabled || !draft.trim()}
        >
          添加
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        已添加 {value.length}/{maxTags}
      </div>
    </div>
  );
}
