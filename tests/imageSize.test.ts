import { describe, expect, it } from 'vitest'
import { resolveImageSize } from '../src/imageSize'

describe('image display dimensions', () => {
  it.each([
    { name: 'large landscape default', image: {}, natural: [1600, 800], expected: [200, 100] },
    { name: 'large portrait default', image: {}, natural: [800, 1600], expected: [200, 400] },
    { name: 'small source without enlargement', image: {}, natural: [80, 40], expected: [80, 40] },
    { name: 'width only', image: { width: 120 }, natural: [2048, 1647], expected: [120, 96.50390625] },
    { name: 'height only', image: { height: 75 }, natural: [800, 400], expected: [150, 75] },
    { name: 'explicit dimensions', image: { width: 100, height: 60 }, natural: [800, 400], expected: [100, 60] },
    { name: 'explicit width above automatic limit', image: { width: 500 }, natural: [800, 400], expected: [500, 250] },
    { name: 'explicit height above automatic limit', image: { height: 300 }, natural: [800, 400], expected: [600, 300] }
  ])('$name', ({ image, natural, expected }) => {
    const before = { ...image }
    const size = resolveImageSize(image, natural[0], natural[1])
    expect(size.width).toBeCloseTo(expected[0])
    expect(size.height).toBeCloseTo(expected[1])
    expect(image).toEqual(before)
  })
})
