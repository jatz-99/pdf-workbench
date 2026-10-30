const MIN_SELECTION = 0.002; // fraction of the page

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Selections are stored as fractions (0-1) of the page, so they stay valid
// when the page is zoomed or the window is resized.
export function selectionRect(selection) {
  if (!selection) return null;
  return {
    x: Math.min(selection.startX, selection.currentX),
    y: Math.min(selection.startY, selection.currentY),
    width: Math.abs(selection.currentX - selection.startX),
    height: Math.abs(selection.currentY - selection.startY),
  };
}

export function isUsableRect(rect) {
  return !!rect && rect.width > MIN_SELECTION && rect.height > MIN_SELECTION;
}
