import type { CompanionGroup, CompanionPart, CompanionRundown, CompanionState } from './protocol.js'
import { toSeconds } from './time.js'

/** Separates the rundown, group and part in a reference, like "myRundown|||myGroup|||myPart" */
export const REF_SEPARATOR = '|||'

export interface GroupRef {
	rundown: CompanionRundown
	group: CompanionGroup
}
export interface PartRef extends GroupRef {
	part: CompanionPart
	/** Position of the part in its group, 0 is the first */
	index: number
}

export type PartMode = 'id' | 'index' | 'current' | 'next'
/** How a part is pointed out in an action or a feedback */
export interface PartTarget {
	mode: PartMode
	/** A reference to a part, used when mode is 'id' */
	part?: unknown
	/** A reference to a group, used for the other modes */
	group?: unknown
	/** The position in the group (1 is the first part), used when mode is 'index' */
	index?: unknown
}

export type PlayStatus = 'playing' | 'paused' | 'stopped'

export interface PartLive {
	status: PlayStatus
	/** Time since the part started [ms], null when it is not on air */
	elapsed: number | null
	/** Time until the part ends [ms], null when it is not on air or when it never ends */
	timeLeft: number | null
	/** True when the part is on air and has no end */
	infinite: boolean
	/** Time until the part starts playing [ms], null if it isn't queued to play */
	countdown: number | null
	/** True if the part is the one that "Play next" would play */
	isNext: boolean
}
export interface GroupLive {
	status: PlayStatus
	/** The part that is on air (the first of them, if there are several) */
	currentPart: CompanionPart | null
	nextPart: CompanionPart | null
	/** Number of parts on air */
	onAirCount: number
	/** Time until the current part ends [ms], null when nothing is on air or when it never ends */
	timeLeft: number | null
	/** True when the current part has no end */
	infinite: boolean
	/** Time until the content of the group ends [ms], null when not known */
	groupTimeLeft: number | null
	/** Time until the group is scheduled to start [ms], null if not scheduled */
	countdown: number | null
}

/** Holds the state received from SuperConductor, and answers questions about it. */
export class StateStore {
	private state: CompanionState = { rundowns: [] }

	setState(state: CompanionState): void {
		this.state = state
	}
	getState(): CompanionState {
		return this.state
	}
	clear(): void {
		this.state = { rundowns: [] }
	}

	/** Returns all groups */
	getGroups(): GroupRef[] {
		const groups: GroupRef[] = []
		for (const rundown of this.state.rundowns) {
			for (const group of rundown.groups) groups.push({ rundown, group })
		}
		return groups
	}
	/** Returns all parts */
	getParts(): PartRef[] {
		const parts: PartRef[] = []
		for (const { rundown, group } of this.getGroups()) {
			group.parts.forEach((part, index) => parts.push({ rundown, group, part, index }))
		}
		return parts
	}

	/**
	 * Finds a group from a reference.
	 * A reference is "rundown|||group" or just "group", where each of them is an id or a name.
	 */
	resolveGroup(ref: unknown): GroupRef | undefined {
		const segments = splitRef(ref)
		if (segments.length === 0 || segments.length > 2) return undefined
		const groupSegment = segments[segments.length - 1]
		const rundownSegment = segments.length === 2 ? segments[0] : undefined

		const candidates = this.getGroups().filter((g) => matchesRundown(g.rundown, rundownSegment))

		return (
			candidates.find((g) => g.group.id === groupSegment) ??
			candidates.find((g) => equalsIgnoreCase(g.group.name, groupSegment))
		)
	}
	/**
	 * Finds a part from a reference.
	 * A reference is "rundown|||group|||part", "group|||part" or just "part", where each of them is an id or a name.
	 */
	resolvePartRef(ref: unknown): PartRef | undefined {
		const segments = splitRef(ref)
		if (segments.length === 0 || segments.length > 3) return undefined
		const partSegment = segments[segments.length - 1]
		const groupSegment = segments.length >= 2 ? segments[segments.length - 2] : undefined
		const rundownSegment = segments.length === 3 ? segments[0] : undefined

		const candidates = this.getParts().filter(
			(p) => matchesRundown(p.rundown, rundownSegment) && matchesGroup(p.group, groupSegment),
		)

		return (
			candidates.find((p) => p.part.id === partSegment) ??
			candidates.find((p) => equalsIgnoreCase(p.part.name, partSegment)) ??
			candidates.find((p) => equalsIgnoreCase(p.part.label, partSegment))
		)
	}
	/** Finds the part that an action or a feedback points at */
	resolvePart(target: PartTarget): PartRef | undefined {
		if (target.mode === 'id') return this.resolvePartRef(target.part)

		const groupRef = this.resolveGroup(target.group)
		if (!groupRef) return undefined
		const { group } = groupRef

		let index: number
		if (target.mode === 'index') {
			index = Math.floor(Number(target.index)) - 1
		} else if (target.mode === 'current') {
			index = group.parts.findIndex((part) => group.playout.playheads[part.id])
		} else if (target.mode === 'next') {
			index = group.parts.findIndex((part) => part.id === group.playout.nextPartId)
		} else {
			return undefined
		}

		const part = group.parts[index]
		if (!part) return undefined
		return { ...groupRef, part, index }
	}

	/** If there are several rundowns, their names are needed to tell things apart */
	private get showRundownNames(): boolean {
		return this.state.rundowns.length > 1
	}
	getGroupLabel(ref: GroupRef): string {
		const names: string[] = []
		if (this.showRundownNames) names.push(ref.rundown.name)
		names.push(getGroupName(ref.group))
		return names.join(' / ')
	}
	getPartLabel(ref: PartRef): string {
		const names: string[] = []
		if (this.showRundownNames) names.push(ref.rundown.name)
		// A transparent group only has one part, and is not visible in SuperConductor:
		if (!ref.group.transparent) names.push(ref.group.name)
		names.push(getPartName(ref.part))
		return names.join(' / ')
	}
}

export function getGroupReference(ref: GroupRef): string {
	return [ref.rundown.id, ref.group.id].join(REF_SEPARATOR)
}
export function getPartReference(ref: PartRef): string {
	return [ref.rundown.id, ref.group.id, ref.part.id].join(REF_SEPARATOR)
}
/** The name to display for a part */
export function getPartName(part: CompanionPart): string {
	return part.label || part.name
}
/** The name to display for a group */
export function getGroupName(group: CompanionGroup): string {
	// A transparent group is not visible in SuperConductor, it is known by its only part:
	if (group.transparent && group.parts.length > 0) return getPartName(group.parts[0])
	return group.name
}
/** True when the group is played out using a schedule, and that schedule is enabled */
export function isScheduleActive(group: CompanionGroup): boolean {
	return group.scheduled && group.scheduleActive
}

/**
 * Calculates the things that change over time for a part.
 * @param now The current time, in the clock of SuperConductor
 */
export function getPartLive(group: CompanionGroup, part: CompanionPart, now: number): PartLive {
	const live: PartLive = {
		status: 'stopped',
		elapsed: null,
		timeLeft: null,
		infinite: false,
		countdown: null,
		isNext: group.playout.nextPartId === part.id,
	}

	const playhead = group.playout.playheads[part.id]
	if (playhead) {
		const duration = playhead.duration
		if (playhead.pausedAt !== undefined) {
			live.status = 'paused'
			live.elapsed = playhead.pausedAt
			if (duration !== null) live.timeLeft = Math.max(0, duration - playhead.pausedAt)
		} else {
			live.status = 'playing'
			live.elapsed = Math.max(0, now - playhead.startTime)
			if (playhead.endTime !== null) live.timeLeft = Math.max(0, playhead.endTime - now)
		}
		if (duration !== null && live.elapsed > duration) live.elapsed = duration
		live.infinite = live.timeLeft === null
	}

	const nextStart = (group.playout.countdowns[part.id] ?? []).find((timestamp) => timestamp > now)
	if (nextStart !== undefined) live.countdown = nextStart - now

	return live
}
/**
 * Calculates the things that change over time for a group.
 * @param now The current time, in the clock of SuperConductor
 */
export function getGroupLive(group: CompanionGroup, now: number): GroupLive {
	const playout = group.playout
	const live: GroupLive = {
		status: playout.playing ? 'playing' : playout.paused ? 'paused' : 'stopped',
		currentPart: null,
		nextPart: group.parts.find((part) => part.id === playout.nextPartId) ?? null,
		onAirCount: 0,
		timeLeft: null,
		infinite: false,
		groupTimeLeft: null,
		countdown: null,
	}

	for (const part of group.parts) {
		if (!playout.playheads[part.id]) continue
		live.onAirCount++
		if (!live.currentPart) live.currentPart = part
	}
	if (live.currentPart) {
		const partLive = getPartLive(group, live.currentPart, now)
		live.timeLeft = partLive.timeLeft
		live.infinite = partLive.infinite
	}

	if (playout.endTime !== null) live.groupTimeLeft = Math.max(0, playout.endTime - now)
	else if (playout.pausedTimeToEnd !== null) live.groupTimeLeft = Math.max(0, playout.pausedTimeToEnd)

	const nextStart = playout.scheduledToPlay.find((timestamp) => timestamp > now)
	if (nextStart !== undefined) live.countdown = nextStart - now

	return live
}

/**
 * Returns a string that changes whenever a timer (in whole seconds) would display something new.
 * It is used to only update the timers when needed.
 * @param now The current time, in the clock of SuperConductor
 */
export function getTimeSignature(state: CompanionState, now: number): string {
	const values: number[] = []
	const pushSeconds = (ms: number | null, round: 'ceil' | 'floor') => {
		if (ms !== null) values.push(toSeconds(ms, round))
	}

	for (const rundown of state.rundowns) {
		for (const group of rundown.groups) {
			const playout = group.playout
			let isActive = false

			for (const part of group.parts) {
				if (!playout.playheads[part.id] && !playout.countdowns[part.id]) continue
				isActive = true
				const live = getPartLive(group, part, now)
				pushSeconds(live.timeLeft, 'ceil')
				pushSeconds(live.elapsed, 'floor')
				pushSeconds(live.countdown, 'ceil')
			}
			if (isActive || playout.scheduledToPlay.length > 0) {
				const live = getGroupLive(group, now)
				pushSeconds(live.groupTimeLeft, 'ceil')
				pushSeconds(live.countdown, 'ceil')
			}
		}
	}
	return values.join(',')
}

function splitRef(ref: unknown): string[] {
	if (typeof ref !== 'string' && typeof ref !== 'number') return []
	const str = `${ref}`.trim()
	if (!str) return []
	return str.split(REF_SEPARATOR).map((segment) => segment.trim())
}
function equalsIgnoreCase(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase()
}
function matchesRundown(rundown: CompanionRundown, segment: string | undefined): boolean {
	if (segment === undefined) return true
	return rundown.id === segment || equalsIgnoreCase(rundown.name, segment)
}
function matchesGroup(group: CompanionGroup, segment: string | undefined): boolean {
	if (segment === undefined) return true
	return group.id === segment || equalsIgnoreCase(group.name, segment)
}
