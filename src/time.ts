/**
 * Formats a duration as "m:ss" (or "h:mm:ss" when it is an hour or longer).
 * @param ms The duration in milliseconds
 * @param round How to turn the duration into whole seconds.
 *   Use 'ceil' for countdowns (so that "0:00" is displayed when it has actually ended) and 'floor' for elapsed time.
 */
export function formatDuration(ms: number, round: 'ceil' | 'floor' | 'round' = 'round'): string {
	const totalSeconds = Math.max(0, toSeconds(ms, round))

	const h = Math.floor(totalSeconds / 3600)
	const m = Math.floor((totalSeconds % 3600) / 60)
	const s = totalSeconds % 60

	if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
	return `${m}:${pad(s)}`
}
export function toSeconds(ms: number, round: 'ceil' | 'floor' | 'round' = 'round'): number {
	// The margin of a millisecond avoids "3.001 seconds" being rounded up to 4:
	if (round === 'ceil') return Math.ceil((ms - 1) / 1000)
	if (round === 'floor') return Math.floor((ms + 1) / 1000)
	return Math.round(ms / 1000)
}
function pad(value: number): string {
	return value < 10 ? `0${value}` : `${value}`
}
