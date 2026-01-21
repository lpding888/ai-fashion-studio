"use client";

import * as React from 'react';
import { FormHistoryItem } from '@/hooks/useFormHistory';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface FormHistoryDropdownProps {
    historyItems: FormHistoryItem[];
    onLoad: (item: FormHistoryItem) => void | Promise<void>;
    onDelete: (id: string) => void;
    onClear: () => void;
}

export function FormHistoryDropdown({
    historyItems,
    onLoad,
    onDelete,
    onClear
}: FormHistoryDropdownProps) {
    if (historyItems.length === 0) {
        return null;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Clock className="h-4 w-4" />
                    最近配置 ({historyItems.length})
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
                <DropdownMenuLabel>历史配置</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {historyItems.map((item) => (
                    <DropdownMenuItem
                        key={item.id}
                        className="flex items-start justify-between py-3 cursor-pointer"
                        onSelect={(e) => {
                            e.preventDefault();
                        }}
                    >
                        <div
                            className="flex-1 space-y-1"
                            onClick={() => void onLoad(item)}
                        >
                            <div className="font-medium">
                                {item.name || item.requirements.substring(0, 30) + '...'}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                                <div>
                                    {formatDistanceToNow(item.timestamp, {
                                        addSuffix: true,
                                        locale: zhCN
                                    })}
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
                                        {item.resolution}
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
                                        {item.aspectRatio}
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
                                        {item.shotCount}张
                                    </span>
                                    {item.garmentImageCount && item.garmentImageCount > 0 && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                            {item.garmentImageCount}个服装图
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-2 flex-shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(item.id);
                            }}
                        >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="text-destructive"
                    onSelect={onClear}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    清空所有历史
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
