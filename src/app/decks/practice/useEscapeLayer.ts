import { useEffect, useEffectEvent } from 'react';

// Escape closes the top layer of the practice table and only that one (#1467): the game menu, a
// panel, a popup, the open hand. Each open layer joins a stack while `active`, the newest on top,
// and one `keydown` listener on the window calls the handler of the top layer. A layer that must
// ignore Escape for a while, such as a card list panel during a drag, stays in the stack and
// does nothing in its handler, so Escape does not reach the layer below either.
const layers: (() => void)[] = [];

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  layers[layers.length - 1]?.();
}

export function useEscapeLayer(onEscape: () => void, active = true) {
  const handle = useEffectEvent(() => onEscape());

  useEffect(() => {
    if (!active) return;
    const layer = () => handle();
    layers.push(layer);
    if (layers.length === 1) window.addEventListener('keydown', handleKeyDown);
    return () => {
      const index = layers.lastIndexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) window.removeEventListener('keydown', handleKeyDown);
    };
  }, [active]);
}
