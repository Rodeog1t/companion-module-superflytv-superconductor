/******************************************************************************
 *
 * The protocol of the Companion API of SuperConductor.
 * It is a WebSocket connection, exchanging JSON messages.
 *
 * This is a copy of apps/app/src/lib/companion/protocol.ts in SuperConductor,
 * keep them in sync. PROTOCOL_VERSION must match the version in SuperConductor.
 *
 *****************************************************************************/

export const PROTOCOL_VERSION = 1
export const DEFAULT_PORT = 5505

/** Max size of a virtual button panel */
export const SURFACE_MAX_COLUMNS = 32
export const SURFACE_MAX_ROWS = 32

// ---------------------------------- State ----------------------------------

export interface CompanionState {
	rundowns: CompanionRundown[]
}
export interface CompanionRundown {
	id: string
	name: string
	groups: CompanionGroup[]
}
export interface CompanionGroup {
	id: string
	name: string
	/** A transparent group is one that only has a single part, ie "hidden from the user" */
	transparent: boolean
	oneAtATime: boolean
	autoPlay: boolean
	loop: boolean
	disabled: boolean
	locked: boolean
	/** True when the group is played out using a schedule */
	scheduled: boolean

	parts: CompanionPart[]
	playout: CompanionGroupPlayout
}
export interface CompanionPart {
	id: string
	name: string
	/** Label of the part (derived from the name/timeline of the Part) */
	label: string
	/** Duration of the part [ms], null = infinite */
	duration: number | null
	disabled: boolean
	loop: boolean
	locked: boolean
}
/**
 * Describes what is playing in a group.
 * Only contains absolute timestamps (and no "time left"),
 * so that it only changes when the playout changes.
 */
export interface CompanionGroupPlayout {
	/** If any part in the group is playing (and not paused) */
	playing: boolean
	/** If any part in the group is on air, but all of them are paused */
	paused: boolean

	/** The parts that are currently on air */
	playheads: {
		[partId: string]: CompanionPlayhead
	}
	/** Times at which parts will start playing (unix timestamps) [ms] */
	countdowns: {
		[partId: string]: number[]
	}
	/** Times at which the group is scheduled to start playing (unix timestamps) [ms] */
	scheduledToPlay: number[]

	/** Time when the content of the group ends (unix timestamp) [ms]. null if not playing, paused or infinite */
	endTime: number | null
	/** When paused: The time left until the content of the group ends [ms]. */
	pausedTimeToEnd: number | null

	/** The part that a "Play next" command would play. null if there is none */
	nextPartId: string | null
	/** The part that a "Play previous" command would play. null if there is none */
	prevPartId: string | null
}
export interface CompanionPlayhead {
	/** The time when the part started playing (unix timestamp) [ms] */
	startTime: number
	/** The time when the part ends (unix timestamp) [ms], null = infinite or paused */
	endTime: number | null
	/** Duration of the part [ms], null = infinite */
	duration: number | null
	/** If set, the part is paused at this point in time (0 is the start of the part) [ms] */
	pausedAt?: number
	/** What happens when the part ends */
	endAction?: string
	/** Whether the part was started by a schedule */
	fromSchedule: boolean
}

// -------------------------------- KeyDisplay --------------------------------

/** What SuperConductor wants to display on a key of a button panel */
export interface KeyDisplay {
	/** How much the key should strive for the user's attention */
	attentionLevel: AttentionLevel

	/** Special case, is set when normal key-operations are intercepted (disabled) */
	intercept?: 'areaDefine'

	area?: {
		/** If the area is currently being defined */
		areaInDefinition: boolean
		/** Color of the area */
		color: string
		/** Label/Name of the area */
		areaLabel: string
		/** Label of this key in the area */
		keyLabel: string
		/** A unique id for this area */
		areaId: string
	}

	/** The most important text */
	header?: {
		long: string
		/** The shortened version (max 10 characters is recommended)*/
		short?: string
	}
	/** Informational text */
	info?: {
		long: string
		short?: string
		/** A text representing an analog value */
		analogValue?: string
	}

	/** base64-encoded thumbnail */
	thumbnail?: string
}
export const AttentionLevel = {
	/** Actively trying to be ignored */
	IGNORE: -1,
	/** Neutral */
	NEUTRAL: 0,
	/** User should notice me, if looking for me */
	INFO: 1,
	/** User should notice me easilly, even if not looking */
	NOTIFY: 2,
	/** User should notice me immediately */
	ALERT: 3,
} as const
export type AttentionLevel = (typeof AttentionLevel)[keyof typeof AttentionLevel]

// ---------------------------- Messages: To server ---------------------------

export type ClientMessage = MsgHello | MsgPing | MsgCommand | MsgKey

/** Must be the first message sent by the client */
export interface MsgHello {
	type: 'hello'
	protocolVersion: number
	/** If set, the client provides a virtual button panel */
	surface?: Surface | null
}
export interface Surface {
	/** Identifies the button panel. Button areas and triggers are tied to this id. */
	id: string
	/** Display name of the button panel */
	name?: string
	columns: number
	rows: number
}
/** Used to measure the difference between the clocks of the client and the server */
export interface MsgPing {
	type: 'ping'
	/** Client time, is echoed back in the pong */
	t: number
}
export type PartCommand = 'playPart' | 'stopPart' | 'pausePart' | 'playStopPart'
export type GroupCommand = 'playGroup' | 'stopGroup' | 'pauseGroup' | 'playStopGroup' | 'playNext' | 'playPrev'
export interface MsgCommand {
	type: 'command'
	/** Is echoed back in the reply */
	id: number
	command: PartCommand | GroupCommand
	rundownId: string
	groupId: string
	/** Required for the part commands */
	partId?: string
}
/** A key on the virtual button panel has been pressed or released */
export interface MsgKey {
	type: 'key'
	/** Index of the key, counted row by row from the top left (which is 0) */
	key: number
	down: boolean
}

// --------------------------- Messages: From server --------------------------

export type ServerMessage = MsgWelcome | MsgPong | MsgState | MsgReply | MsgKeyDisplay | MsgError

/** Reply to the hello */
export interface MsgWelcome {
	type: 'welcome'
	protocolVersion: number
	/** Version of SuperConductor */
	appVersion: string
	serverTime: number
}
export interface MsgPong {
	type: 'pong'
	t: number
	serverTime: number
}
/** Is sent after the welcome and then whenever the state has changed */
export interface MsgState {
	type: 'state'
	serverTime: number
	state: CompanionState
}
/** Reply to a command */
export interface MsgReply {
	type: 'reply'
	id: number
	ok: boolean
	error?: string
}
/** What to display on a key of the virtual button panel */
export interface MsgKeyDisplay {
	type: 'keyDisplay'
	key: number
	display: KeyDisplay
}
export interface MsgError {
	type: 'error'
	message: string
}
