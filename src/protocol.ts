/******************************************************************************
 *
 * The protocol of the Companion API of SuperConductor.
 * It is a WebSocket connection, exchanging JSON messages.
 *
 * This is a copy of apps/app/src/lib/companion/protocol.ts in SuperConductor,
 * keep them in sync. PROTOCOL_VERSION must match the version in SuperConductor.
 *
 *****************************************************************************/

export const PROTOCOL_VERSION = 2
export const DEFAULT_PORT = 5505

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

// ---------------------------- Messages: To server ---------------------------

export type ClientMessage = MsgHello | MsgPing | MsgCommand

/** Must be the first message sent by the client */
export interface MsgHello {
	type: 'hello'
	protocolVersion: number
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

// --------------------------- Messages: From server --------------------------

export type ServerMessage = MsgWelcome | MsgPong | MsgState | MsgReply | MsgError

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
export interface MsgError {
	type: 'error'
	message: string
}
