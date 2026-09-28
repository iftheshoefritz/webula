// The draggable id of a card in a card list panel (#913).
//
// A card in an open panel is also on the table, and both copies join `useDraggable`. dnd-kit keeps
// one registration per id: the copy that mounts last takes the id over, and its unmount deletes
// the registration outright. With one shared id, closing the panel left the card on the table
// with no registration, so its drag never started. The panel copy therefore takes its own id, and
// the drag handlers read the card id back out of it.
const PANEL_DRAG_PREFIX = 'panel:';

export function panelDraggableId(instanceId: string): string {
  return `${PANEL_DRAG_PREFIX}${instanceId}`;
}

// The card id a draggable id stands for: the id itself for a card on the table, and the id
// with the panel prefix removed for a card in a panel.
export function cardIdOfDraggable(draggableId: string | number): string {
  const id = String(draggableId);
  return id.startsWith(PANEL_DRAG_PREFIX) ? id.slice(PANEL_DRAG_PREFIX.length) : id;
}
