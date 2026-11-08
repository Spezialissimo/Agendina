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
    readonly pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? ''
    }
  }
  // Testing Library creates events through jsdom's window, not Node's globalThis.
  Object.assign(window, { PointerEvent })
}

// jsdom does not implement pointer capture.
if (!('setPointerCapture' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'setPointerCapture', { value: () => undefined })
}

// CodeMirror measures text with Range geometry, which jsdom does not implement.
for (const method of ['getClientRects', 'getBoundingClientRect'] as const) {
  if (!(method in Range.prototype)) {
    Object.defineProperty(Range.prototype, method, {
      value: method === 'getClientRects' ? () => [] : () => new DOMRect(),
    })
  }
}
