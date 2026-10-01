import type {
	CompanionPresetDefinitions,
	CompanionPresetGroup,
	CompanionPresetSection,
	CompanionSimplePresetDefinition,
} from '@companion-module/base'
import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import type { GroupTargetOptions, PartTargetOptions } from './options.js'
import { getGroupName, getGroupReference, getPartName, getPartReference, type GroupRef, type PartRef } from './state.js'
import { sanitizeId } from './variables.js'

const COLOR_BLACK = 0x000000
const COLOR_WHITE = 0xffffff
const COLOR_GREY = 0x808080
const COLOR_PLAYING = 0x00a000
const COLOR_PAUSED = 0xc08000
const COLOR_ENDING = 0xd00000
const COLOR_NEXT = 0x004080
const COLOR_DISABLED = 0x303030

/** How many "by position" buttons to offer for a group, at least */
const MIN_POSITION_PRESETS = 8
const MAX_POSITION_PRESETS = 64

type Preset = CompanionSimplePresetDefinition<ModuleSchema>

export function UpdatePresets(self: ModuleInstance): void {
	const structure: CompanionPresetSection<ModuleSchema>[] = []
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	for (const rundown of self.store.getState().rundowns) {
		const groups: CompanionPresetGroup<ModuleSchema>[] = []
		/** The parts that are not in a (visible) group */
		const singleParts: string[] = []

		for (const group of rundown.groups) {
			const groupRef: GroupRef = { rundown, group }
			const groupId = sanitizeId(group.id)
			const groupName = getGroupName(group)

			if (group.transparent) {
				group.parts.forEach((part, index) => {
					const presetId = `part_${sanitizeId(part.id)}`
					presets[presetId] = getPartPreset(getPartName(part), partById({ ...groupRef, part, index }))
					singleParts.push(presetId)
				})
				continue
			}

			// One button per part:
			const partPresetIds: string[] = []
			group.parts.forEach((part, index) => {
				const presetId = `part_${sanitizeId(part.id)}`
				presets[presetId] = getPartPreset(getPartName(part), partById({ ...groupRef, part, index }))
				partPresetIds.push(presetId)
			})
			groups.push({
				id: `group_${groupId}_parts`,
				type: 'simple',
				name: `${groupName}: Parts`,
				description: 'Each button plays (or stops) one specific part, wherever that part is moved.',
				presets: partPresetIds,
			})

			// One button per position in the group:
			const positionPresetIds: string[] = []
			const positionCount = Math.min(MAX_POSITION_PRESETS, Math.max(MIN_POSITION_PRESETS, group.parts.length))
			for (let position = 1; position <= positionCount; position++) {
				const presetId = `group_${groupId}_position_${position}`
				presets[presetId] = getPartPreset(`${groupName}, part ${position}`, {
					mode: 'index',
					part: '',
					group: getGroupReference(groupRef),
					index: position,
				})
				positionPresetIds.push(presetId)
			}
			groups.push({
				id: `group_${groupId}_positions`,
				type: 'simple',
				name: `${groupName}: Parts by position`,
				description:
					'Each button plays (or stops) the part at a position in the group, so the buttons follow the changes made in SuperConductor.',
				presets: positionPresetIds,
			})

			// The controls of the group:
			const controls = getGroupPresets(groupRef)
			const controlPresetIds: string[] = []
			for (const [controlId, preset] of Object.entries(controls)) {
				const presetId = `group_${groupId}_${controlId}`
				presets[presetId] = preset
				controlPresetIds.push(presetId)
			}
			groups.push({
				id: `group_${groupId}_controls`,
				type: 'simple',
				name: `${groupName}: Controls`,
				presets: controlPresetIds,
			})
		}

		if (singleParts.length > 0) {
			groups.unshift({
				id: `rundown_${sanitizeId(rundown.id)}_single_parts`,
				type: 'simple',
				name: 'Parts that are not in a group',
				presets: singleParts,
			})
		}
		if (groups.length > 0) {
			structure.push({
				id: `rundown_${sanitizeId(rundown.id)}`,
				name: rundown.name,
				description: 'Buttons that are defined here in Companion: change their look and their actions as you like.',
				definitions: groups,
			})
		}
	}

	if (self.surfaceKeyCount > 0) {
		const keyPresetIds: string[] = []
		for (let key = 0; key < self.surfaceKeyCount; key++) {
			const presetId = `surface_key_${key}`
			presets[presetId] = getSurfaceKeyPreset(key)
			keyPresetIds.push(presetId)
		}
		structure.push({
			id: 'surface',
			name: 'Button panel',
			description:
				'Buttons that are defined in SuperConductor: assign triggers and button areas to the keys of the button panel there, like for a Stream Deck.',
			definitions: [
				{
					id: 'surface_keys',
					type: 'simple',
					name: `Keys (${self.config.surfaceColumns} columns, ${self.config.surfaceRows} rows)`,
					description: 'Key 0 is the top left one, then they are counted row by row.',
					presets: keyPresetIds,
				},
			],
		})
	}

	self.setPresetDefinitions(structure, presets)
}

function partById(ref: PartRef): PartTargetOptions {
	return {
		mode: 'id',
		part: getPartReference(ref),
		group: getGroupReference(ref),
		index: ref.index + 1,
	}
}
/** A button that plays/stops a part, and displays its name and timer */
function getPartPreset(name: string, target: PartTargetOptions): Preset {
	return {
		type: 'simple',
		name: `Play / Stop: ${name}`,
		style: {
			text: '$(local:name)\\n$(local:time)',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		steps: [
			{
				down: [{ actionId: 'part_play_stop', options: target }],
				up: [],
			},
		],
		// Note: The feedbacks further down take precedence over the ones above them
		feedbacks: [
			{ feedbackId: 'part_next', options: target, style: { bgcolor: COLOR_NEXT } },
			{ feedbackId: 'part_disabled', options: target, style: { bgcolor: COLOR_DISABLED, color: COLOR_GREY } },
			{ feedbackId: 'part_paused', options: target, style: { bgcolor: COLOR_PAUSED } },
			{ feedbackId: 'part_playing', options: target, style: { bgcolor: COLOR_PLAYING } },
			{ feedbackId: 'part_ending', options: { ...target, seconds: 10 }, style: { bgcolor: COLOR_ENDING } },
		],
		localVariables: [
			{
				variableType: 'feedback',
				variableName: 'name',
				feedbackId: 'part_info',
				options: { ...target, field: 'name' },
			},
			{
				variableType: 'feedback',
				variableName: 'time',
				feedbackId: 'part_info',
				options: { ...target, field: 'time' },
			},
		],
	}
}
/** The buttons that control a group */
function getGroupPresets(ref: GroupRef): { [controlId: string]: Preset } {
	const name = getGroupName(ref.group)
	const target: GroupTargetOptions = { group: getGroupReference(ref) }

	const baseStyle = {
		size: 'auto' as const,
		color: COLOR_WHITE,
		bgcolor: COLOR_BLACK,
	}
	const playing: Preset['feedbacks'][number] = {
		feedbackId: 'group_playing',
		options: target,
		style: { bgcolor: COLOR_PLAYING },
	}
	const paused: Preset['feedbacks'][number] = {
		feedbackId: 'group_paused',
		options: target,
		style: { bgcolor: COLOR_PAUSED },
	}
	const ending: Preset['feedbacks'][number] = {
		feedbackId: 'group_ending',
		options: { ...target, seconds: 10 },
		style: { bgcolor: COLOR_ENDING },
	}

	return {
		status: {
			type: 'simple',
			name: `Status: ${name}`,
			style: { ...baseStyle, text: '$(local:current)\\n$(local:time)' },
			steps: [],
			feedbacks: [paused, playing, ending],
			localVariables: [
				{
					variableType: 'feedback',
					variableName: 'current',
					feedbackId: 'group_info',
					options: { ...target, field: 'current_part' },
				},
				{
					variableType: 'feedback',
					variableName: 'time',
					feedbackId: 'group_info',
					options: { ...target, field: 'time_left' },
				},
			],
		},
		play_stop: {
			type: 'simple',
			name: `Play / Stop: ${name}`,
			style: { ...baseStyle, text: `PLAY / STOP\\n${name}` },
			steps: [{ down: [{ actionId: 'group_play_stop', options: target }], up: [] }],
			feedbacks: [paused, playing],
		},
		play: {
			type: 'simple',
			name: `Play: ${name}`,
			style: { ...baseStyle, text: `PLAY\\n${name}` },
			steps: [{ down: [{ actionId: 'group_play', options: target }], up: [] }],
			feedbacks: [playing],
		},
		stop: {
			type: 'simple',
			name: `Stop: ${name}`,
			style: { ...baseStyle, text: `STOP\\n${name}` },
			steps: [{ down: [{ actionId: 'group_stop', options: target }], up: [] }],
			feedbacks: [],
		},
		pause: {
			type: 'simple',
			name: `Pause / Resume: ${name}`,
			style: { ...baseStyle, text: `PAUSE\\n${name}` },
			steps: [{ down: [{ actionId: 'group_pause', options: target }], up: [] }],
			feedbacks: [paused],
		},
		next: {
			type: 'simple',
			name: `Play next part: ${name}`,
			style: { ...baseStyle, text: 'NEXT\\n$(local:next)' },
			steps: [{ down: [{ actionId: 'group_next', options: target }], up: [] }],
			feedbacks: [],
			localVariables: [
				{
					variableType: 'feedback',
					variableName: 'next',
					feedbackId: 'group_info',
					options: { ...target, field: 'next_part' },
				},
			],
		},
		previous: {
			type: 'simple',
			name: `Play previous part: ${name}`,
			style: { ...baseStyle, text: `PREVIOUS\\n${name}` },
			steps: [{ down: [{ actionId: 'group_previous', options: target }], up: [] }],
			feedbacks: [],
		},
	}
}
/** A button that is a key on the button panel: SuperConductor decides what it does and how it looks */
function getSurfaceKeyPreset(key: number): Preset {
	return {
		type: 'simple',
		name: `Key ${key}`,
		style: {
			text: '',
			size: 'auto',
			color: COLOR_WHITE,
			bgcolor: COLOR_BLACK,
		},
		previewStyle: {
			text: `Key ${key}`,
		},
		steps: [
			{
				down: [{ actionId: 'surface_key', options: { key, pressed: true } }],
				up: [{ actionId: 'surface_key', options: { key, pressed: false } }],
			},
		],
		feedbacks: [{ feedbackId: 'surface_key', options: { key } }],
	}
}
