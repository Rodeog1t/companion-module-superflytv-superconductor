import type ModuleInstance from './main.js'
import type { GroupCommand, PartCommand } from './protocol.js'
import {
	groupTargetFields,
	partTargetFields,
	toPartTarget,
	type GroupTargetOptions,
	type PartTargetOptions,
} from './options.js'

export type ActionsSchema = {
	part_play: { options: PartTargetOptions }
	part_stop: { options: PartTargetOptions }
	part_pause: { options: PartTargetOptions }
	part_play_stop: { options: PartTargetOptions }

	group_play: { options: GroupTargetOptions }
	group_stop: { options: GroupTargetOptions }
	group_pause: { options: GroupTargetOptions }
	group_play_stop: { options: GroupTargetOptions }
	group_next: { options: GroupTargetOptions }
	group_previous: { options: GroupTargetOptions }

	surface_key: {
		options: {
			key: number
			pressed: boolean
		}
	}
}

export function UpdateActions(self: ModuleInstance): void {
	const partAction = (name: string, description: string, command: PartCommand) => ({
		name,
		description,
		options: partTargetFields(self.store),
		callback: async (event: { options: PartTargetOptions }) => {
			const ref = self.store.resolvePart(toPartTarget(event.options))
			if (!ref) {
				self.log('warn', `${name}: The part was not found (${JSON.stringify(event.options)})`)
				return
			}
			await self.sendCommand(command, {
				rundownId: ref.rundown.id,
				groupId: ref.group.id,
				partId: ref.part.id,
			})
		},
	})
	const groupAction = (name: string, description: string, command: GroupCommand) => ({
		name,
		description,
		options: groupTargetFields(self.store),
		callback: async (event: { options: GroupTargetOptions }) => {
			const ref = self.store.resolveGroup(event.options.group)
			if (!ref) {
				self.log('warn', `${name}: The group was not found (${JSON.stringify(event.options)})`)
				return
			}
			await self.sendCommand(command, {
				rundownId: ref.rundown.id,
				groupId: ref.group.id,
			})
		},
	})

	self.setActionDefinitions({
		part_play: partAction('Part: Play', 'Plays a part (restarts it if it is already playing)', 'playPart'),
		part_stop: partAction('Part: Stop', 'Stops a part', 'stopPart'),
		part_pause: partAction(
			'Part: Pause / Resume',
			'Pauses a part. Resumes it if it is paused. Cues it (pauses it at its start) if it is not playing',
			'pausePart',
		),
		part_play_stop: partAction(
			'Part: Play / Stop',
			'Stops the part if it is playing, otherwise plays it',
			'playStopPart',
		),

		group_play: groupAction('Group: Play', 'Plays a group', 'playGroup'),
		group_stop: groupAction('Group: Stop', 'Stops everything that is playing in a group', 'stopGroup'),
		group_pause: groupAction(
			'Group: Pause / Resume',
			'Pauses what is playing in a group, or resumes it if it is paused',
			'pauseGroup',
		),
		group_play_stop: groupAction(
			'Group: Play / Stop',
			'Stops the group if it is playing, otherwise plays it',
			'playStopGroup',
		),
		group_next: groupAction(
			'Group: Play next part',
			'Plays the next part in a group (only for groups that play one part at a time)',
			'playNext',
		),
		group_previous: groupAction(
			'Group: Play previous part',
			'Plays the previous part in a group (only for groups that play one part at a time)',
			'playPrev',
		),

		surface_key: {
			name: 'Button panel: Press or release a key',
			description:
				'Tells SuperConductor that a key on the button panel was pressed or released. What the key does is set up in SuperConductor.',
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
				{
					id: 'pressed',
					type: 'checkbox',
					label: 'Pressed (uncheck to release the key)',
					default: true,
				},
			],
			callback: async (event) => {
				self.sendKey(Math.floor(Number(event.options.key)), !!event.options.pressed)
			},
		},
	})
}
