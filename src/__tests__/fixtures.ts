import type { CompanionGroup, CompanionGroupPlayout, CompanionPart, CompanionState } from '../protocol.js'

export function makePart(
	id: string,
	name: string,
	duration: number | null,
	extra?: Partial<CompanionPart>,
): CompanionPart {
	return { id, name, label: name, duration, disabled: false, loop: false, locked: false, ...extra }
}
export function makePlayout(extra?: Partial<CompanionGroupPlayout>): CompanionGroupPlayout {
	return {
		playing: false,
		paused: false,
		playheads: {},
		countdowns: {},
		scheduledToPlay: [],
		endTime: null,
		pausedTimeToEnd: null,
		nextPartId: null,
		prevPartId: null,
		...extra,
	}
}
export function makeGroup(
	id: string,
	name: string,
	parts: CompanionPart[],
	extra?: Partial<CompanionGroup>,
): CompanionGroup {
	return {
		id,
		name,
		transparent: false,
		oneAtATime: true,
		autoPlay: false,
		loop: false,
		disabled: false,
		locked: false,
		scheduled: false,
		parts,
		playout: makePlayout(),
		...extra,
	}
}

/**
 * A state with two rundowns:
 * - "Show": the group "Main" (Intro, Interview, Outro), and a single part "Bumper" in a transparent group
 * - "Extras": the group "Main" (Sting)
 */
export function makeState(): CompanionState {
	return {
		rundowns: [
			{
				id: 'show.rundown.json',
				name: 'Show',
				groups: [
					makeGroup('grpMain', 'Main', [
						makePart('prtIntro', 'Intro', 10000),
						makePart('prtInterview', 'Interview', null),
						makePart('prtOutro', 'Outro', 5500),
					]),
					makeGroup('grpHidden', 'Hidden', [makePart('prtBumper', 'Bumper', 3000)], { transparent: true }),
				],
			},
			{
				id: 'extras.rundown.json',
				name: 'Extras',
				groups: [makeGroup('grpExtras', 'Main', [makePart('prtSting', 'Sting', 2000)])],
			},
		],
	}
}
