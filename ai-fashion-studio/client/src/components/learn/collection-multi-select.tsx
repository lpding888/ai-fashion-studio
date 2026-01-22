"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { PresetCollection } from "@/lib/preset-collections";

type CollectionMultiSelectProps = {
  items: PresetCollection[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function CollectionMultiSelect({
  items,
  selectedIds,
  onChange,
  disabled = false,
}: CollectionMultiSelectProps) {
  const toggle = (id: string) => {
    const selected = new Set(selectedIds);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    onChange(Array.from(selected));
  };

  if (!items.length) {
    return <div className="text-xs text-muted-foreground">暂无收藏夹</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = selectedIds.includes(item.id);
        return (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => toggle(item.id)}
            disabled={disabled}
          >
            {item.name}
          </Button>
        );
      })}
    </div>
  );
}
