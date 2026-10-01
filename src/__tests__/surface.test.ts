import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AttentionLevel, type KeyDisplay } from '../protocol.js'
import { getKeyHeader, getKeyInfo, getKeyStyle, parseColor, renderKeyDisplay } from '../surface.js'

describe('Button panel', () => {
	test('parseColor', () => {
		assert.deepEqual(parseColor('#ff8000'), { r: 255, g: 128, b: 0 })
		assert.deepEqual(parseColor('#f00'), { r: 255, g: 0, b: 0 })
		assert.deepEqual(parseColor('nonsense'), { r: 0, g: 0, b: 0 })
	})
	test('an idle key', () => {
		const display: KeyDisplay = {
			attentionLevel: AttentionLevel.NEUTRAL,
			header: { long: 'Play Intro', short: '▶Intro' },
			info: { long: '0:00:10' },
		}
		assert.equal(getKeyHeader(display), '▶Intro')
		assert.equal(getKeyInfo(display), '0:00:10')

		const style = getKeyStyle(display)
		assert.equal(style.text, '▶Intro\n0:00:10')
		assert.deepEqual(style.bgcolor, { r: 0, g: 0, b: 0 })
		assert.deepEqual(style.color, { r: 255, g: 255, b: 255 })
		assert.equal(style.borderWidth, 3)
	})
	test('a key that needs attention', () => {
		const style = getKeyStyle({ attentionLevel: AttentionLevel.ALERT, header: { long: 'Stop' } })
		// Yellow background, so the text is black:
		assert.deepEqual(style.bgcolor, { r: 255, g: 255, b: 51 })
		assert.deepEqual(style.color, { r: 0, g: 0, b: 0 })
		assert.deepEqual(style.borderColor, { r: 255, g: 0, b: 0 })
		assert.equal(style.borderWidth, 7)
	})
	test('a key in a button area', () => {
		const area = { areaInDefinition: false, color: '#004000', areaLabel: 'Area 1', keyLabel: '2', areaId: 'a' }

		const idle = getKeyStyle({ attentionLevel: AttentionLevel.IGNORE, area })
		assert.deepEqual(idle.bgcolor, { r: 0, g: 64, b: 0 })
		assert.equal(idle.text, '')
		assert.equal(idle.borderWidth, 4)

		// While the area is being defined, the keys display their place in the area:
		const defining = getKeyStyle({ attentionLevel: AttentionLevel.NEUTRAL, intercept: 'areaDefine', area })
		assert.equal(defining.text, 'Area 1\n2')
		assert.equal(defining.borderWidth, 0)
	})
	test('renders a border image', () => {
		const display: KeyDisplay = { attentionLevel: AttentionLevel.NOTIFY, header: { long: 'Stop Intro' } }

		const withoutImage = renderKeyDisplay(display, undefined)
		assert.equal(withoutImage.text, 'Stop Intro')
		assert.equal(withoutImage.bgcolor, 0x000000)
		assert.equal(withoutImage.color, 0xffffff)
		assert.equal(withoutImage.imageBuffer, undefined)

		const result = renderKeyDisplay(display, { width: 72, height: 58 })
		assert.deepEqual(result.imageBufferPosition, { x: 0, y: 0, width: 72, height: 58 })
		assert.deepEqual(result.imageBufferEncoding, { pixelFormat: 'RGBA' })
		const buffer = Buffer.from(result.imageBuffer!, 'base64')
		assert.equal(buffer.length, 72 * 58 * 4)
		// The corner is yellow, the middle is transparent:
		assert.deepEqual([...buffer.subarray(0, 4)], [255, 255, 0, 255])
		const middle = (29 * 72 + 36) * 4
		assert.deepEqual([...buffer.subarray(middle, middle + 4)], [0, 0, 0, 0])

		// Nothing is known about the key, the button is left as it is:
		assert.deepEqual(renderKeyDisplay(undefined, { width: 72, height: 72 }), {})
	})
})
