import type { StringKeys } from '@companion-module/base'
import type ModuleInstance from './main.js'
import {
	getGroupInfo,
	getPartInfo,
	GROUP_FIELD_CHOICES,
	PART_FIELD_CHOICES,
	type GroupField,
	type PartField,
} from './info.js'
import {
	groupTargetFields,
	partTargetFields,
	toPartTarget,
	type GroupTargetOptions,
	type PartTargetOptions,
} from './options.js'
import { getGroupLive, getPartLive } from './state.js'
import { renderKeyDisplay } from './surface.js'

export type FeedbacksSchema = {
	part_playing: { type: 'boolean'; options: PartTargetOptions }
	part_paused: { type: 'boolean'; options: PartTargetOptions }
	part_ending: { type: 'boolean'; options: PartTargetOptions & { seconds: number } }
	part_next: { type: 'boolean'; options: PartTargetOptions }
	part_exists: { type: 'boolean'; options: PartTargetOptions }
	part_disabled: { type: 'boolean'; options: PartTargetOptions }
	part_info: { type: 'value'; options: PartTargetOptions & { field: string } }

	group_playing: { type: 'boolean'; options: GroupTargetOptions }
	group_paused: { type: 'boolean'; options: GroupTargetOptions }
	group_ending: { type: 'boolean'; options: GroupTargetOptions & { seconds: number } }
	group_info: { type: 'value'; options: GroupTargetOptions & { field: string } }

	surface_key: { type: 'advanced'; options: { key: number } }
}

/** The feedbacks that change when the playout state changes */
export const STATE_FEEDBACKS: StringKeys<FeedbacksSchema>[] = [
	'part_playing',
	'part_paused',
	'part_ending',
	'part_next',
	'part_exists',
	'part_disabled',
	'part_info',
	'group_playing',
	'group_paused',
	'group_ending',
	'group_info',
]
/** The feedbacks that change as time passes, while something is playing */
export const TIME_FEEDBACKS: StringKeys<FeedbacksSchema>[] = ['part_ending', 'part_info', 'group_ending', 'group_info']

const COLOR_BLACK = 0x000000
const COLOR_WHITE = 0xffffff
const COLOR_PLAYING = 0x00a000
const COLOR_PAUSED = 0xc08000
const COLOR_ENDING = 0xd00000
const COLOR_NEXT = 0x004080
const COLOR_DISABLED = 0x303030

export function UpdateFeedbacks(self: ModuleInstance): void {
	const store = self.store

	const secondsField = {
		id: 'seconds' as const,
		type: 'number' as const,
		label: 'Seconds left',
		default: 10,
		min: 1,
		max: 3600,
	}

	self.setFeedbackDefinitions({
		part_playing: {
			type: 'boolean',
			name: 'Part: Is playing',
			description: 'True when the part is playing (and is not paused)',
			defaultStyle: { bgcolor: COLOR_PLAYING, color: COLOR_WHITE },
			options: partTargetFields(store),
			callback: (feedback) => {
				const ref = store.resolvePart(toPartTarget(feedback.options))
				if (!ref) return false
				return getPartLive(ref.group, ref.part, self.now()).status === 'playing'
			},
		},
		part_paused: {
			type: 'boolean',
			name: 'Part: Is paused',
			description: 'True when the part is paused (or cued)',
			defaultStyle: { bgcolor: COLOR_PAUSED, color: COLOR_WHITE },
			options: partTargetFields(store),
			callback: (feedback) => {
				const ref = store.resolvePart(toPartTarget(feedback.options))
				if (!ref) return false
				return getPartLive(ref.group, ref.part, self.now()).status === 'paused'
			},
		},
		part_ending: {
			type: 'boolean',
			name: 'Part: Is about to end',
			description: 'True when the part is playing and has less than the given time left',
			defaultStyle: { bgcolor: COLOR_ENDING, color: COLOR_WHITE },
			options: [...partTargetFields(store), secondsField],
			callback: (feedback) => {
				const ref = store.resolvePart(toPartTarget(feedback.options))
				if (!ref) return false
				const live = getPartLive(ref.group, ref.part, self.now())
				return isEnding(live.status, live.timeLeft, feedback.options.seconds)
			},
		},
		part_next: {
			type: 'boolean',
			name: 'Part: Is next',
			description: 'True when the part is the one that "Play next part" would play',
			defaultStyle: { bgcolor: COLOR_NEXT, color: COLOR_WHITE },
			options: partTargetFields(store),
			callback: (feedback) => {
				const ref = store.resolvePart(toPartTarget(feedback.options))
				if (!ref) return false
				return ref.group.playout.nextPartId === ref.part.id
			},
		},
		part_exists: {
			type: 'boolean',
			name: 'Part: Exists',
			description:
				'True when the part exists. Useful (inverted) to dim buttons that point at a position in a group where there is no part.',
			defaultStyle: { bgcolor: COLOR_BLACK, color: COLOR_WHITE },
			options: partTargetFields(store),
			callback: (feedback) => {
				return !!store.resolvePart(toPartTarget(feedback.options))
			},
		},
		part_disabled: {
			type: 'boolean',
			name: 'Part: Is disabled',
			description: 'True when the part (or its group) is disabled in SuperConductor, so it can not be played',
			defaultStyle: { bgcolor: COLOR_DISABLED, color: 0x808080 },
			options: partTargetFields(store),
			callback: (feedback) => {
				const ref = store.resolvePart(toPartTarget(feedback.options))
				if (!ref) return false
				return ref.part.disabled || ref.group.disabled
			},
		},
		part_info: {
			type: 'value',
			name: 'Part: Information',
			description:
				'Gives the name, the status or a timer of a part. Store it in a local variable to display it on the button.',
			options: [
				...partTargetFields(store),
				{
					id: 'field',
					type: 'dropdown',
					label: 'Information',
					choices: PART_FIELD_CHOICES,
					default: 'name',
				},
			],
			callback: (feedback) => {
				const ref = store.resolvePart(toPartTarget(feedback.options))
				return getPartInfo(ref, feedback.options.field as PartField, self.now())
			},
		},

		group_playing: {
			type: 'boolean',
			name: 'Group: Is playing',
			description: 'True when something in the group is playing (and is not paused)',
			defaultStyle: { bgcolor: COLOR_PLAYING, color: COLOR_WHITE },
			options: groupTargetFields(store),
			callback: (feedback) => {
				return store.resolveGroup(feedback.options.group)?.group.playout.playing ?? false
			},
		},
		group_paused: {
			type: 'boolean',
			name: 'Group: Is paused',
			description: 'True when everything that is on air in the group is paused',
			defaultStyle: { bgcolor: COLOR_PAUSED, color: COLOR_WHITE },
			options: groupTargetFields(store),
			callback: (feedback) => {
				return store.resolveGroup(feedback.options.group)?.group.playout.paused ?? false
			},
		},
		group_ending: {
			type: 'boolean',
			name: 'Group: Current part is about to end',
			description: 'True when the part that is playing in the group has less than the given time left',
			defaultStyle: { bgcolor: COLOR_ENDING, color: COLOR_WHITE },
			options: [...groupTargetFields(store), secondsField],
			callback: (feedback) => {
				const ref = store.resolveGroup(feedback.options.group)
				if (!ref) return false
				const live = getGroupLive(ref.group, self.now())
				return isEnding(live.status, live.timeLeft, feedback.options.seconds)
			},
		},
		group_info: {
			type: 'value',
			name: 'Group: Information',
			description:
				'Gives the name, the status, the current part or a timer of a group. Store it in a local variable to display it on the button.',
			options: [
				...groupTargetFields(store),
				{
					id: 'field',
					type: 'dropdown',
					label: 'Information',
					choices: GROUP_FIELD_CHOICES,
					default: 'current_part',
				},
			],
			callback: (feedback) => {
				const ref = store.resolveGroup(feedback.options.group)
				return getGroupInfo(ref, feedback.options.field as GroupField, self.now())
			},
		},

		surface_key: {
			type: 'advanced',
			name: 'Button panel: Key display',
			description:
				'Makes the button look like the key on the button panel does in SuperConductor (text, colors and border).',
			affectedProperties: ['text', 'size', 'color', 'bgcolor', 'imageBuffer'],
			options: [
				{
					id: 'key',
					type: 'number',
					label: 'Key (0 is the top left one)',
					default: 0,
					min: 0,
					max: 1023,
					asInteger: true,
				},
			],
			callback: (feedback) => {
				const display = self.surfaceKeys.get(Math.floor(Number(feedback.options.key)))
				return renderKeyDisplay(display, feedback.image)
			},
		},
	})
}

function isEnding(status: string, timeLeft: number | null, seconds: unknown): boolean {
	if (status !== 'playing' || timeLeft === null) return false
	const limit = Number(seconds)
	if (Number.isNaN(limit)) return false
	return timeLeft <= limit * 1000
}
