import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { getGroupInfo, getPartInfo } from './info.js'
import { getGroupName, getPartName } from './state.js'
import { getKeyHeader, getKeyInfo } from './surface.js'

/** The variables depend on what is in the rundowns, so they can't be listed in advance */
export type VariablesSchema = CompanionVariableValues

/** Turns an id from SuperConductor into something that is allowed in the name of a variable */
export function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function getVariableDefinitions(self: ModuleInstance): CompanionVariableDefinitions<VariablesSchema> {
	const definitions: CompanionVariableDefinitions<VariablesSchema> = {
		app_version: { name: 'Version of SuperConductor' },
	}

	for (const ref of self.store.getGroups()) {
		const id = `group_${sanitizeId(ref.group.id)}`
		const label = `Group "${self.store.getGroupLabel(ref)}"`
		definitions[`${id}_name`] = { name: `${label}: Name` }
		definitions[`${id}_status`] = { name: `${label}: Status (playing, paused or stopped)` }
		definitions[`${id}_current_part`] = { name: `${label}: Name of the part that is playing` }
		definitions[`${id}_next_part`] = { name: `${label}: Name of the next part` }
		definitions[`${id}_time_left`] = { name: `${label}: Time left of the part that is playing` }
		definitions[`${id}_time_left_seconds`] = { name: `${label}: Time left of the part that is playing, in seconds` }
	}
	for (const ref of self.store.getParts()) {
		const id = `part_${sanitizeId(ref.part.id)}`
		const label = `Part "${self.store.getPartLabel(ref)}"`
		definitions[`${id}_name`] = { name: `${label}: Name` }
		definitions[`${id}_status`] = { name: `${label}: Status (playing, paused or stopped)` }
		definitions[`${id}_time`] = { name: `${label}: Time left when playing, otherwise the duration` }
		definitions[`${id}_time_left_seconds`] = { name: `${label}: Time left, in seconds` }
	}

	for (let key = 0; key < self.surfaceKeyCount; key++) {
		definitions[`key_${key}_header`] = { name: `Button panel, key ${key}: Header` }
		definitions[`key_${key}_info`] = { name: `Button panel, key ${key}: Information` }
	}

	return definitions
}

/**
 * Returns the values of all variables
 * @param now The current time, in the clock of SuperConductor
 */
export function getVariableValues(self: ModuleInstance, now: number): CompanionVariableValues {
	const values: CompanionVariableValues = {
		app_version: self.appVersion,
	}

	for (const ref of self.store.getGroups()) {
		const id = `group_${sanitizeId(ref.group.id)}`
		values[`${id}_name`] = getGroupName(ref.group)
		values[`${id}_status`] = getGroupInfo(ref, 'status', now)
		values[`${id}_current_part`] = getGroupInfo(ref, 'current_part', now)
		values[`${id}_next_part`] = getGroupInfo(ref, 'next_part', now)
		values[`${id}_time_left`] = getGroupInfo(ref, 'time_left', now)
		values[`${id}_time_left_seconds`] = getGroupInfo(ref, 'time_left_seconds', now)
	}
	for (const ref of self.store.getParts()) {
		const id = `part_${sanitizeId(ref.part.id)}`
		values[`${id}_name`] = getPartName(ref.part)
		values[`${id}_status`] = getPartInfo(ref, 'status', now)
		values[`${id}_time`] = getPartInfo(ref, 'time', now)
		values[`${id}_time_left_seconds`] = getPartInfo(ref, 'time_left_seconds', now)
	}

	for (let key = 0; key < self.surfaceKeyCount; key++) {
		const display = self.surfaceKeys.get(key)
		values[`key_${key}_header`] = getKeyHeader(display)
		values[`key_${key}_info`] = getKeyInfo(display)
	}

	return values
}
