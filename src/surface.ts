import { combineRgb, type CompanionAdvancedFeedbackResult } from '@companion-module/base'
import { AttentionLevel, type KeyDisplay } from './protocol.js'

/******************************************************************************
 *
 * The virtual button panel: SuperConductor decides what the keys do and what
 * they display (exactly as it does for a Stream Deck connected to it).
 * This file turns what SuperConductor wants to display into a Companion button.
 *
 *****************************************************************************/

interface Rgb {
	r: number
	g: number
	b: number
}
export interface KeyStyle {
	text: string
	color: Rgb
	bgcolor: Rgb
	/** Width of the border, in pixels on a 72 pixel button. 0 means no border */
	borderWidth: number
	borderColor: Rgb
}

/** Holds what SuperConductor wants to display on the keys */
export class SurfaceKeys {
	private displays = new Map<number, KeyDisplay>()

	set(key: number, display: KeyDisplay): void {
		this.displays.set(key, display)
	}
	get(key: number): KeyDisplay | undefined {
		return this.displays.get(key)
	}
	clear(): void {
		this.displays.clear()
	}
}

export function getKeyHeader(display: KeyDisplay | undefined): string {
	if (!display) return ''
	if (display.intercept) return display.area?.areaLabel ?? ''
	return display.header?.short || display.header?.long || ''
}
export function getKeyInfo(display: KeyDisplay | undefined): string {
	if (!display) return ''
	if (display.intercept) return display.area?.keyLabel ?? ''
	const lines: string[] = []
	const info = display.info?.short || display.info?.long
	if (info) lines.push(info)
	if (display.info?.analogValue) lines.push(display.info.analogValue)
	return lines.join('\n')
}

/** Decides how a key should look. This mimics how SuperConductor draws the keys of a Stream Deck. */
export function getKeyStyle(display: KeyDisplay): KeyStyle {
	const black = { r: 0, g: 0, b: 0 }
	const text = [getKeyHeader(display), getKeyInfo(display)].filter((line) => line.length > 0).join('\n')

	if (display.intercept) {
		// Normal functionality is intercepted, a button area is being defined in SuperConductor
		return {
			text,
			color: display.area?.areaInDefinition ? parseColor('#fff') : parseColor('#bbb'),
			bgcolor: display.area ? parseColor(display.area.color) : black,
			borderWidth: 0,
			borderColor: black,
		}
	}

	let bgcolor = black
	let borderWidth = 0
	let borderColor = parseColor('#666')

	switch (display.attentionLevel) {
		case AttentionLevel.IGNORE:
			break
		case AttentionLevel.NEUTRAL:
			borderWidth = 3
			break
		case AttentionLevel.INFO:
			borderWidth = 3
			borderColor = parseColor('#bbb')
			break
		case AttentionLevel.NOTIFY:
			borderWidth = 4
			borderColor = parseColor('#ff0')
			break
		case AttentionLevel.ALERT:
			borderWidth = 7
			borderColor = parseColor('#f00')
			bgcolor = parseColor('#ff3')
			break
	}
	if (display.area) {
		bgcolor = parseColor(display.area.color)
		if (display.attentionLevel <= AttentionLevel.NEUTRAL) borderWidth = 4
	}

	// Pick a text color that is readable on the background:
	const brightness = (bgcolor.r * 299 + bgcolor.g * 587 + bgcolor.b * 114) / 1000
	const dampen = display.attentionLevel === AttentionLevel.IGNORE
	let color: Rgb
	if (brightness < 127) color = dampen ? parseColor('#999') : parseColor('#fff')
	else color = dampen ? parseColor('#333') : black

	return { text, color, bgcolor, borderWidth, borderColor }
}

/**
 * Returns the result of the "Button panel: Key display" feedback.
 * @param image The size of the image to draw the border on. No border is drawn if not set.
 */
export function renderKeyDisplay(
	display: KeyDisplay | undefined,
	image: { width: number; height: number } | undefined,
): CompanionAdvancedFeedbackResult {
	// SuperConductor hasn't told us anything about this key, leave the button as it is:
	if (!display) return {}

	const style = getKeyStyle(display)
	const result: CompanionAdvancedFeedbackResult = {
		text: style.text,
		size: 'auto',
		color: combineRgb(style.color.r, style.color.g, style.color.b),
		bgcolor: combineRgb(style.bgcolor.r, style.bgcolor.g, style.bgcolor.b),
	}

	if (image && style.borderWidth > 0 && image.width > 0 && image.height > 0) {
		const scale = Math.min(image.width, image.height) / 72
		const borderWidth = Math.max(1, Math.round(style.borderWidth * scale))

		result.imageBuffer = getBorderImage(image.width, image.height, borderWidth, style.borderColor)
		result.imageBufferEncoding = { pixelFormat: 'RGBA' }
		result.imageBufferPosition = { x: 0, y: 0, width: image.width, height: image.height }
	}
	return result
}

const borderImageCache = new Map<string, string>()
const BORDER_IMAGE_CACHE_MAX_SIZE = 32
/** Returns a base64 encoded image which is transparent, apart from a border */
function getBorderImage(width: number, height: number, borderWidth: number, color: Rgb): string {
	const cacheKey = `${width}x${height}|${borderWidth}|${color.r},${color.g},${color.b}`
	const cached = borderImageCache.get(cacheKey)
	if (cached) return cached

	const buffer = Buffer.alloc(width * height * 4) // Is zero-filled, ie fully transparent
	for (let y = 0; y < height; y++) {
		const isHorizontalBorder = y < borderWidth || y >= height - borderWidth
		for (let x = 0; x < width; x++) {
			if (isHorizontalBorder || x < borderWidth || x >= width - borderWidth) {
				const offset = (y * width + x) * 4
				buffer[offset] = color.r
				buffer[offset + 1] = color.g
				buffer[offset + 2] = color.b
				buffer[offset + 3] = 255
			}
		}
	}
	const image = buffer.toString('base64')

	if (borderImageCache.size >= BORDER_IMAGE_CACHE_MAX_SIZE) borderImageCache.clear()
	borderImageCache.set(cacheKey, image)
	return image
}

/** Parses colors like "#ff0000" and "#f00" */
export function parseColor(str: string): Rgb {
	const long = str.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
	if (long) return { r: parseInt(long[1], 16), g: parseInt(long[2], 16), b: parseInt(long[3], 16) }

	const short = str.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i)
	if (short) {
		return {
			r: parseInt(short[1] + short[1], 16),
			g: parseInt(short[2] + short[2], 16),
			b: parseInt(short[3] + short[3], 16),
		}
	}
	return { r: 0, g: 0, b: 0 }
}
