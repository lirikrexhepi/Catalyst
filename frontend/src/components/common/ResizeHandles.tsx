import React from 'react';
import { ResizeDirection } from './useFloatingWindow';

export interface ResizeHandlesProps {
  onResize: (event: React.MouseEvent, direction: ResizeDirection) => void;
}

const EDGES: Array<{ dir: ResizeDirection; className: string }> = [
  { dir: 'n', className: '-top-1.5 left-3 right-3 h-3 cursor-ns-resize' },
  { dir: 's', className: '-bottom-1.5 left-3 right-3 h-3 cursor-ns-resize' },
  { dir: 'w', className: 'top-3 bottom-3 -left-1.5 w-3 cursor-ew-resize' },
  { dir: 'e', className: 'top-3 bottom-3 -right-1.5 w-3 cursor-ew-resize' },
  { dir: 'nw', className: '-top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize' },
  { dir: 'ne', className: '-top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize' },
  { dir: 'sw', className: '-bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize' },
  { dir: 'se', className: '-bottom-1.5 -right-1.5 w-4 h-4 cursor-nwse-resize' },
];

/** The invisible edge and corner grab areas of a floating window. */
export const ResizeHandles: React.FC<ResizeHandlesProps> = ({ onResize }) => (
  <>
    {EDGES.map(({ dir, className }) => (
      <div
        key={dir}
        onMouseDown={(event) => onResize(event, dir)}
        className={`absolute z-40 ${className}`}
      />
    ))}
  </>
);
