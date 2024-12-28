'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, Database } from 'lucide-react';
import type { Node } from '@/library/powersync/NodeService';
interface TreeNodeData extends Node {
  children: TreeNodeData[];
}

interface TreeNodeProps {
  node: TreeNodeData;
  level: number;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
  onMove?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onBulkAdd: (nodeId: string) => void;
  readOnly?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (nodeId: string) => void;
}

export const TreeNode = ({
  node,
  level,
  onAddChild,
  onDelete,
  onMove,
  onBulkAdd,
  readOnly = false,
  isExpanded = true,
  onToggleExpand
}: TreeNodeProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const payload = JSON.parse(node.payload ?? '{}');
  const hasChildren = node.children.length > 0;
  const isRoot = level === 0;

  const handleDragStart = (e: React.DragEvent) => {
    if (readOnly) return;
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    // Prevent dropping at root level
    if (level === 0 && !isRoot) {
      setDragOverPosition(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;

    // For root level nodes, only allow 'inside' position
    if (level === 1) {
      setDragOverPosition('inside');
      return;
    }

    // Determine drop position based on mouse location
    if (y < rect.height * 0.25) {
      setDragOverPosition('before');
    } else if (y > rect.height * 0.75) {
      setDragOverPosition('after');
    } else {
      setDragOverPosition('inside');
    }
  };

  const handleDragLeave = () => {
    setDragOverPosition(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const sourceId = e.dataTransfer.getData('text/plain');
    if (sourceId === node.id) return; // Prevent dropping on self

    // Prevent dropping at root level
    if (level === 0 && !isRoot) return;

    // For level 1 nodes, force 'inside' position to prevent root-level siblings
    if (level === 1 && dragOverPosition !== 'inside') return;

    if (onMove && dragOverPosition) {
      onMove(sourceId, node.id, dragOverPosition);
    }

    setDragOverPosition(null);
  };

  const getDropIndicatorStyle = () => {
    if (!dragOverPosition) return '';

    switch (dragOverPosition) {
      case 'before':
        return 'before:absolute before:left-0 before:right-0 before:top-0 before:h-0.5 before:bg-blue-500';
      case 'after':
        return 'after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-blue-500';
      case 'inside':
        return 'bg-blue-50';
      default:
        return '';
    }
  };

  const nodeName = level === 1 ? 'ROOT' : payload.name ?? `Unnamed Node ${node.id}`;

  return (
    <div className="select-none w-full h-full">
      <div
        className={[
          'hover:bg-gray-50',
          'rounded',
          'transition-colors',
          'w-full',
          'h-full',
          'flex',
          'items-center',
          !isRoot ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          'relative',
          node._is_pending ? 'bg-yellow-100' : '',
          getDropIndicatorStyle(),
        ].join(' ')}
        onClick={() => hasChildren && onToggleExpand?.(node.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={!readOnly && !isRoot}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center min-h-[40px] px-2">
          <div style={{ width: `${level * 1.5}rem` }} className="flex-shrink-0" />
          {!readOnly && !isRoot && (
            <div
              className="w-6 flex-shrink-0 flex items-center cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div className="w-6 flex-shrink-0 flex items-center">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )
            ) : null}
          </div>
          <div className="flex-1 grow truncate">
            <div className="font-medium text-gray-900 truncate">
              {nodeName}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {node.id}
            </div>
          </div>
          {isHovered && !readOnly && (
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2 bg-white/80 backdrop-blur-sm py-1 px-2 rounded"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => onAddChild(node.id)}
                title="Add child node"
              >
                <Plus className="w-4 h-4 text-gray-500" />
              </button>
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => onBulkAdd(node.id)}
                title="Bulk add subtree"
              >
                <Database className="w-4 h-4 text-gray-500" />
              </button>
              <button
                className="p-1 hover:bg-gray-100 rounded"
                onClick={() => onDelete(node.id)}
                title="Delete node"
                disabled={readOnly}
              >
                <Trash2 className={`w-4 h-4 ${readOnly ? "text-gray-300" : "text-gray-500"}`} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
