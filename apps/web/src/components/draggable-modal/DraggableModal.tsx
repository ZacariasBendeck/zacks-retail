import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

// Drop-in replacement for antd's <Modal> that lets the operator drag the dialog
// around by its header. Uses Modal's `modalRender` prop to wrap the rendered
// tree in a translatable div; drag is driven by native mouse events on
// .ant-modal-header, with document-level move/up listeners so the cursor
// can leave the header mid-drag without losing the grip.
//
// Position resets to 0,0 each time `open` flips true — matches operator
// intuition ("re-open == fresh").

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export function DraggableModal(props: ModalProps): React.ReactElement {
  const { modalRender: callerRender, open, ...rest } = props;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const posRef = useRef(pos);
  const dragRef = useRef<DragState | null>(null);
  posRef.current = pos;

  useEffect(() => {
    if (open) setPos({ x: 0, y: 0 });
  }, [open]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Only start a drag when the grab began inside the modal header. The close
    // button sits outside .ant-modal-header (in .ant-modal-close) so it's
    // naturally excluded; any interactive child inside the header bails out too.
    const header = target.closest('.ant-modal-header');
    if (!header) return;
    if (target.closest('button, a, input, select, textarea')) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
    };

    const onMove = (ev: MouseEvent) => {
      const s = dragRef.current;
      if (!s) return;
      setPos({
        x: s.originX + (ev.clientX - s.startX),
        y: s.originY + (ev.clientY - s.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, []);

  const render: ModalProps['modalRender'] = (node) => {
    const inner = callerRender ? callerRender(node) : node;
    return (
      <div
        className="zr-draggable-modal"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        onMouseDown={onMouseDown}
      >
        {inner}
      </div>
    );
  };

  return <Modal {...rest} open={open} modalRender={render} />;
}

export default DraggableModal;
