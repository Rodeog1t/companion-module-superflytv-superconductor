import type { CompanionInputFieldDropdown, CompanionInputFieldNumber, DropdownChoice } from '@companion-module/base'
import { getGroupReference, getPartReference, type PartMode, type PartTarget, type StateStore } from './state.js'

/******************************************************************************
 *
 * The options that are shared between the actions and the feedbacks:
 * how to point out a part or a group.
 *
 *****************************************************************************/

export type PartTargetOptions = {
	mode: string
	part: string
	group: string
	index: number
}
export type GroupTargetOptions = {
	group: string
}

type TargetField<TKey extends string> = CompanionInputFieldDropdown<TKey> | CompanionInputFieldNumber<TKey>

export const PART_MODE_CHOICES: DropdownChoice<PartMode>[] = [
	{ id: 'id', label: 'A specific part' },
	{ id: 'index', label: 'The part at a position in a group' },
	{ id: 'current', label: 'The part that is playing in a group' },
	{ id: 'next', label: 'The next part in a group' },
]

export function getGroupChoices(store: StateStore): DropdownChoice<string>[] {
	return store.getGroups().map((ref) => ({
		id: getGroupReference(ref),
		label: store.getGroupLabel(ref),
	}))
}
export function getPartChoices(store: StateStore): DropdownChoice<string>[] {
	return store.getParts().map((ref) => ({
		id: getPartReference(ref),
		label: store.getPartLabel(ref),
	}))
}

/** The fields used to point out a part */
export function partTargetFields(store: StateStore): TargetField<keyof PartTargetOptions>[] {
	const partChoices = getPartChoices(store)
	const groupChoices = getGroupChoices(store)
	return [
		{
			id: 'mode',
			type: 'dropdown',
			label: 'Which part',
			choices: PART_MODE_CHOICES,
			default: 'id',
			// The visibility of the other fields depends on this one, so it can't be an expression:
			disableAutoExpression: true,
		},
		{
			id: 'part',
			type: 'dropdown',
			label: 'Part',
			tooltip: 'Either pick a part, or type "Group name|||Part name"',
			choices: partChoices,
			default: partChoices[0]?.id ?? '',
			allowCustom: true,
			isVisibleExpression: `$(options:mode) == 'id'`,
		},
		{
			id: 'group',
			type: 'dropdown',
			label: 'Group',
			tooltip: 'Either pick a group, or type the name of a group',
			choices: groupChoices,
			default: groupChoices[0]?.id ?? '',
			allowCustom: true,
			isVisibleExpression: `$(options:mode) != 'id'`,
		},
		{
			id: 'index',
			type: 'number',
			label: 'Position (1 is the first part of the group)',
			default: 1,
			min: 1,
			max: 999,
			asInteger: true,
			isVisibleExpression: `$(options:mode) == 'index'`,
		},
	]
}
/** The field used to point out a group */
export function groupTargetFields(store: StateStore): TargetField<keyof GroupTargetOptions>[] {
	const groupChoices = getGroupChoices(store)
	return [
		{
			id: 'group',
			type: 'dropdown',
			label: 'Group',
			tooltip: 'Either pick a group, or type the name of a group',
			choices: groupChoices,
			default: groupChoices[0]?.id ?? '',
			allowCustom: true,
		},
	]
}
export function toPartTarget(options: Partial<PartTargetOptions>): PartTarget {
	return {
		mode: (options.mode ?? 'id') as PartMode,
		part: options.part,
		group: options.group,
		index: options.index,
	}
}
