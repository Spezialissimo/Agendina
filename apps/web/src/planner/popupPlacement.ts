interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Size {
  width: number
  height: number
}

/**
 * Where a pop-up goes next to its button: on `side` of it, with its `start` (left or top) or
 * `end` (right or bottom) edge lined up with the button's.
 */
export interface Placement {
  side: 'below' | 'above' | 'right' | 'left'
  align: 'start' | 'end'
}

const GAP = 8

/**
 * Places a pop-up so that it stays on the screen: from a strip lying `across`, below or above
 * its button; from a `standing` strip, beside it. The usual place comes first, then the other
 * one if only that fits, else the side with more room.
 */
export function placePopup(
  button: Box,
  popup: Size,
  viewport: Size,
  strip: 'across' | 'standing',
): Placement {
  if (strip === 'across') {
    const below = viewport.height - button.bottom - GAP
    const above = button.top - GAP
    return {
      side: pick(popup.height, below, above, 'below', 'above'),
      // Lined up on the right edge, it reaches left of the button.
      align: pick(popup.width, button.right, viewport.width - button.left, 'end', 'start'),
    }
  }
  const right = viewport.width - button.right - GAP
  const left = button.left - GAP
  return {
    side: pick(popup.width, right, left, 'right', 'left'),
    // Lined up on the top edge, it reaches below the button.
    align: pick(popup.height, viewport.height - button.top, button.bottom, 'start', 'end'),
  }
}

function pick<T>(needed: number, usualRoom: number, otherRoom: number, usual: T, other: T): T {
  if (needed <= usualRoom) return usual
  if (needed <= otherRoom) return other
  return usualRoom >= otherRoom ? usual : other
}
