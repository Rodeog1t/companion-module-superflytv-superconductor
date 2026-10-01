import type { DropdownChoice } from '@companion-module/base'
import { getGroupLive, getGroupName, getPartLive, getPartName, type GroupRef, type PartRef } from './state.js'
import { formatDuration, toSeconds } from './time.js'

/******************************************************************************
 *
 * The pieces of information about parts and groups that can be displayed
 * on buttons, via the "info" feedbacks and via the variables.
 *
 *****************************************************************************/

export type PartField =
	| 'name'
	| 'status'
	| 'time'
	| 'time_left'
	| 'time_left_seconds'
	| 'elapsed'
	| 'elapsed_seconds'
	| 'duration'
	| 'duration_seconds'
	| 'countdown'
	| 'position'
	| 'group'

export const PART_FIELD_CHOICES: DropdownChoice<PartField>[] = [
	{ id: 'name', label: 'Name' },
	{ id: 'status', label: 'Status (playing, paused or stopped)' },
	{ id: 'time', label: 'Time left when playing, otherwise the duration' },
	{ id: 'time_left', label: 'Time left' },
	{ id: 'time_left_seconds', label: 'Time left, in seconds' },
	{ id: 'elapsed', label: 'Elapsed time' },
	{ id: 'elapsed_seconds', label: 'Elapsed time, in seconds' },
	{ id: 'duration', label: 'Duration' },
	{ id: 'duration_seconds', label: 'Duration, in seconds' },
	{ id: 'countdown', label: 'Time until it starts playing (when queued)' },
	{ id: 'position', label: 'Position in the group' },
	{ id: 'group', label: 'Name of the group' },
]

export type GroupField =
	| 'name'
	| 'status'
	| 'current_part'
	| 'next_part'
	| 'time_left'
	| 'time_left_seconds'
	| 'group_time_left'
	| 'countdown'
	| 'on_air_count'

export const GROUP_FIELD_CHOICES: DropdownChoice<GroupField>[] = [
	{ id: 'name', label: 'Name' },
	{ id: 'status', label: 'Status (playing, paused or stopped)' },
	{ id: 'current_part', label: 'Name of the part that is playing' },
	{ id: 'next_part', label: 'Name of the next part' },
	{ id: 'time_left', label: 'Time left of the part that is playing' },
	{ id: 'time_left_seconds', label: 'Time left of the part that is playing, in seconds' },
	{ id: 'group_time_left', label: 'Time left until the group stops playing' },
	{ id: 'countdown', label: 'Time until the group starts playing (when scheduled)' },
	{ id: 'on_air_count', label: 'Number of parts that are playing' },
]

/** The symbol used for things that never end */
const INFINITE = '∞'

/**
 * Returns a piece of information about a part. Returns an empty string when there is nothing to display.
 * @param now The current time, in the clock of SuperConductor
 */
export function getPartInfo(ref: PartRef | undefined, field: PartField, now: number): string | number {
	if (!ref) return ''
	const { group, part } = ref

	switch (field) {
		case 'name':
			return getPartName(part)
		case 'group':
			return getGroupName(group)
		case 'position':
			return ref.index + 1
		case 'duration':
			return formatPartDuration(part.duration)
		case 'duration_seconds':
			return part.duration === null ? '' : toSeconds(part.duration)
	}

	const live = getPartLive(group, part, now)
	switch (field) {
		case 'status':
			return live.status
		case 'time':
			if (live.status === 'stopped') return formatPartDuration(part.duration)
			return formatTimeLeft(live.timeLeft, live.infinite)
		case 'time_left':
			return formatTimeLeft(live.timeLeft, live.infinite)
		case 'time_left_seconds':
			return live.timeLeft === null ? '' : toSeconds(live.timeLeft, 'ceil')
		case 'elapsed':
			return live.elapsed === null ? '' : formatDuration(live.elapsed, 'floor')
		case 'elapsed_seconds':
			return live.elapsed === null ? '' : toSeconds(live.elapsed, 'floor')
		case 'countdown':
			return live.countdown === null ? '' : formatDuration(live.countdown, 'ceil')
		default:
			return ''
	}
}
/**
 * Returns a piece of information about a group. Returns an empty string when there is nothing to display.
 * @param now The current time, in the clock of SuperConductor
 */
export function getGroupInfo(ref: GroupRef | undefined, field: GroupField, now: number): string | number {
	if (!ref) return ''
	const { group } = ref

	if (field === 'name') return getGroupName(group)

	const live = getGroupLive(group, now)
	switch (field) {
		case 'status':
			return live.status
		case 'current_part':
			return live.currentPart ? getPartName(live.currentPart) : ''
		case 'next_part':
			return live.nextPart ? getPartName(live.nextPart) : ''
		case 'time_left':
			return formatTimeLeft(live.timeLeft, live.infinite)
		case 'time_left_seconds':
			return live.timeLeft === null ? '' : toSeconds(live.timeLeft, 'ceil')
		case 'group_time_left':
			return live.groupTimeLeft === null ? '' : formatDuration(live.groupTimeLeft, 'ceil')
		case 'countdown':
			return live.countdown === null ? '' : formatDuration(live.countdown, 'ceil')
		case 'on_air_count':
			return live.onAirCount
		default:
			return ''
	}
}

function formatTimeLeft(timeLeft: number | null, infinite: boolean): string {
	if (timeLeft !== null) return formatDuration(timeLeft, 'ceil')
	return infinite ? INFINITE : ''
}
function formatPartDuration(duration: number | null): string {
	if (duration === null) return INFINITE
	if (!duration) return ''
	return formatDuration(duration)
}
