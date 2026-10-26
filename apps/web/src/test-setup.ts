import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom has no PointerEvent; without it, pointer events in tests carry no coordinates.
if (!('PointerEvent' in window)) {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  // Testing Library creates events through jsdom's window, not Node's globalThis.
  Object.assign(window, { PointerEvent })
}

// jsdom does not implement pointer capture.
if (!('setPointerCapture' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'setPointerCapture', { value: () => undefined })
}
