import { describe, expect, it } from 'vitest'
import { placePopup } from './popupPlacement.ts'

const viewport = { width: 1200, height: 800 }
const month = { width: 300, height: 320 }
/** The button the month pops up from, 32px square, with its top left corner at (x, y). */
const button = (x: number, y: number) => ({ left: x, top: y, right: x + 32, bottom: y + 32 })

describe('placePopup', () => {
  describe('from a strip lying across', () => {
    it('opens below, right edges aligned, when there is room', () => {
      expect(placePopup(button(900, 20), month, viewport, 'across')).toEqual({
        side: 'below',
        align: 'end',
      })
    })

    it('opens above from a strip at the bottom of the screen', () => {
      expect(placePopup(button(900, 760), month, viewport, 'across')).toEqual({
        side: 'above',
        align: 'end',
      })
    })

    it('aligns left edges when right ones would leave the screen on the left', () => {
      expect(placePopup(button(100, 20), month, viewport, 'across')).toEqual({
        side: 'below',
        align: 'start',
      })
    })

    it('opens on the side with more room when neither has enough', () => {
      const low = { width: 1200, height: 500 }
      expect(placePopup(button(900, 300), month, low, 'across').side).toBe('above')
      expect(placePopup(button(900, 150), month, low, 'across').side).toBe('below')
    })
  })

  describe('from a standing strip', () => {
    it('opens on the right, top edges aligned, when there is room', () => {
      expect(placePopup(button(20, 100), month, viewport, 'standing')).toEqual({
        side: 'right',
        align: 'start',
      })
    })

    it('opens on the left from a strip at the right of the screen', () => {
      expect(placePopup(button(1150, 100), month, viewport, 'standing')).toEqual({
        side: 'left',
        align: 'start',
      })
    })

    it('aligns bottom edges when top ones would leave the screen at the bottom', () => {
      expect(placePopup(button(20, 700), month, viewport, 'standing')).toEqual({
        side: 'right',
        align: 'end',
      })
    })
  })
})
