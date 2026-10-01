import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getGroupInfo, getPartInfo } from '../info.js'
import { getGroupLive, getPartLive, getTimeSignature, StateStore } from '../state.js'
import { formatDuration } from '../time.js'
import { makePlayout, makeState } from './fixtures.js'

function makeStore(): StateStore {
	const store = new StateStore()
	store.setState(makeState())
	return store
}

describe('formatDuration', () => {
	test('formats minutes and hours', () => {
		assert.equal(formatDuration(0), '0:00')
		assert.equal(formatDuration(61000), '1:01')
		assert.equal(formatDuration(3661000), '1:01:01')
		assert.equal(formatDuration(-500), '0:00')
	})
	test('rounding', () => {
		// A countdown shows 0:00 only when it is over:
		assert.equal(formatDuration(1, 'ceil'), '0:00')
		assert.equal(formatDuration(100, 'ceil'), '0:01')
		assert.equal(formatDuration(3000, 'ceil'), '0:03')
		assert.equal(formatDuration(3001, 'ceil'), '0:03')
		assert.equal(formatDuration(3100, 'ceil'), '0:04')
		assert.equal(formatDuration(2999, 'floor'), '0:03')
		assert.equal(formatDuration(2900, 'floor'), '0:02')
	})
})

describe('StateStore', () => {
	test('resolves groups by reference, id and name', () => {
		const store = makeStore()

		assert.equal(store.resolveGroup('show.rundown.json|||grpMain')?.group.id, 'grpMain')
		assert.equal(store.resolveGroup('grpExtras')?.group.id, 'grpExtras')
		// Two groups are named "Main", the rundown tells them apart:
		assert.equal(store.resolveGroup('main')?.group.id, 'grpMain')
		assert.equal(store.resolveGroup('Extras|||Main')?.group.id, 'grpExtras')

		assert.equal(store.resolveGroup('nope'), undefined)
		assert.equal(store.resolveGroup(''), undefined)
		assert.equal(store.resolveGroup(undefined), undefined)
	})
	test('resolves parts', () => {
		const store = makeStore()

		const byId = store.resolvePart({ mode: 'id', part: 'show.rundown.json|||grpMain|||prtOutro' })
		assert.equal(byId?.part.id, 'prtOutro')
		assert.equal(byId?.index, 2)
		assert.equal(store.resolvePart({ mode: 'id', part: 'Main|||interview' })?.part.id, 'prtInterview')
		assert.equal(store.resolvePart({ mode: 'id', part: 'Sting' })?.part.id, 'prtSting')
		assert.equal(store.resolvePart({ mode: 'id', part: 'Hidden|||Sting' }), undefined)

		// By position:
		assert.equal(store.resolvePart({ mode: 'index', group: 'grpMain', index: 1 })?.part.id, 'prtIntro')
		assert.equal(store.resolvePart({ mode: 'index', group: 'grpMain', index: '3' })?.part.id, 'prtOutro')
		assert.equal(store.resolvePart({ mode: 'index', group: 'grpMain', index: 4 }), undefined)
		assert.equal(store.resolvePart({ mode: 'index', group: 'grpMain', index: 0 }), undefined)

		// Current and next:
		assert.equal(store.resolvePart({ mode: 'current', group: 'grpMain' }), undefined)
		const group = store.resolveGroup('grpMain')!.group
		group.playout = makePlayout({
			playing: true,
			playheads: { prtInterview: { startTime: 1000, endTime: null, duration: null, fromSchedule: false } },
			nextPartId: 'prtOutro',
		})
		assert.equal(store.resolvePart({ mode: 'current', group: 'grpMain' })?.part.id, 'prtInterview')
		assert.equal(store.resolvePart({ mode: 'next', group: 'grpMain' })?.part.id, 'prtOutro')
	})
	test('labels', () => {
		const store = makeStore()

		// With several rundowns, their names are included:
		assert.deepEqual(
			store.getParts().map((ref) => store.getPartLabel(ref)),
			[
				'Show / Main / Intro',
				'Show / Main / Interview',
				'Show / Main / Outro',
				'Show / Bumper',
				'Extras / Main / Sting',
			],
		)
		assert.deepEqual(
			store.getGroups().map((ref) => store.getGroupLabel(ref)),
			['Show / Main', 'Show / Bumper', 'Extras / Main'],
		)

		const state = makeState()
		state.rundowns.pop()
		store.setState(state)
		assert.equal(store.getPartLabel(store.getParts()[0]), 'Main / Intro')
	})
})

describe('Timers', () => {
	test('a part that is playing', () => {
		const store = makeStore()
		const ref = store.resolvePart({ mode: 'id', part: 'prtIntro' })!
		ref.group.playout = makePlayout({
			playing: true,
			playheads: { prtIntro: { startTime: 1000, endTime: 11000, duration: 10000, fromSchedule: false } },
			endTime: 11000,
			nextPartId: 'prtInterview',
		})

		assert.deepEqual(getPartLive(ref.group, ref.part, 3500), {
			status: 'playing',
			elapsed: 2500,
			timeLeft: 7500,
			infinite: false,
			countdown: null,
			isNext: false,
		})
		assert.equal(getPartInfo(ref, 'name', 3500), 'Intro')
		assert.equal(getPartInfo(ref, 'status', 3500), 'playing')
		assert.equal(getPartInfo(ref, 'time', 3500), '0:08')
		assert.equal(getPartInfo(ref, 'time_left_seconds', 3500), 8)
		assert.equal(getPartInfo(ref, 'elapsed', 3500), '0:02')
		assert.equal(getPartInfo(ref, 'duration', 3500), '0:10')
		assert.equal(getPartInfo(ref, 'position', 3500), 1)
		assert.equal(getPartInfo(ref, 'group', 3500), 'Main')

		// The state isn't updated the instant the part ends, the timer must not go below zero:
		assert.equal(getPartInfo(ref, 'time', 11050), '0:00')

		const groupRef = store.resolveGroup('grpMain')
		assert.equal(getGroupInfo(groupRef, 'status', 3500), 'playing')
		assert.equal(getGroupInfo(groupRef, 'current_part', 3500), 'Intro')
		assert.equal(getGroupInfo(groupRef, 'next_part', 3500), 'Interview')
		assert.equal(getGroupInfo(groupRef, 'time_left', 3500), '0:08')
		assert.equal(getGroupInfo(groupRef, 'group_time_left', 3500), '0:08')
		assert.equal(getGroupInfo(groupRef, 'on_air_count', 3500), 1)

		// The other parts are stopped, and display their duration:
		const outro = store.resolvePart({ mode: 'id', part: 'prtOutro' })
		assert.equal(getPartInfo(outro, 'status', 3500), 'stopped')
		assert.equal(getPartInfo(outro, 'time', 3500), '0:06')
		assert.equal(getPartInfo(outro, 'time_left', 3500), '')
		const interview = store.resolvePart({ mode: 'id', part: 'prtInterview' })
		assert.equal(getPartInfo(interview, 'time', 3500), '∞')
		assert.equal(getPartLive(interview!.group, interview!.part, 3500).isNext, true)
	})
	test('a part that is paused', () => {
		const store = makeStore()
		const ref = store.resolvePart({ mode: 'id', part: 'prtIntro' })!
		ref.group.playout = makePlayout({
			paused: true,
			playheads: { prtIntro: { startTime: 1000, endTime: null, duration: 10000, pausedAt: 4000, fromSchedule: false } },
			pausedTimeToEnd: 6000,
		})

		// Time doesn't pass while paused:
		for (const now of [5000, 99000]) {
			assert.equal(getPartInfo(ref, 'status', now), 'paused')
			assert.equal(getPartInfo(ref, 'time', now), '0:06')
			assert.equal(getPartInfo(ref, 'elapsed', now), '0:04')
			assert.equal(getGroupInfo(ref, 'status', now), 'paused')
			assert.equal(getGroupInfo(ref, 'group_time_left', now), '0:06')
		}
	})
	test('a part without an end, and a queued part', () => {
		const store = makeStore()
		const ref = store.resolvePart({ mode: 'id', part: 'prtInterview' })!
		ref.group.playout = makePlayout({
			playing: true,
			playheads: { prtInterview: { startTime: 1000, endTime: null, duration: null, fromSchedule: false } },
			countdowns: { prtOutro: [500, 9000] },
		})

		assert.equal(getPartInfo(ref, 'time', 5000), '∞')
		assert.equal(getPartInfo(ref, 'time_left_seconds', 5000), '')
		assert.equal(getPartInfo(ref, 'elapsed', 5000), '0:04')
		assert.equal(getGroupLive(ref.group, 5000).infinite, true)

		const outro = store.resolvePart({ mode: 'id', part: 'prtOutro' })
		assert.equal(getPartInfo(outro, 'countdown', 5000), '0:04')
		assert.equal(getPartInfo(outro, 'countdown', 9500), '')
	})
	test('things that do not exist give empty values', () => {
		assert.equal(getPartInfo(undefined, 'name', 0), '')
		assert.equal(getPartInfo(undefined, 'time', 0), '')
		assert.equal(getGroupInfo(undefined, 'status', 0), '')
	})
	test('the time signature only changes when a timer would display something new', () => {
		const store = makeStore()
		// Nothing is playing:
		assert.equal(getTimeSignature(store.getState(), 1000), getTimeSignature(store.getState(), 99000))

		const ref = store.resolvePart({ mode: 'id', part: 'prtOutro' })!
		ref.group.playout = makePlayout({
			playing: true,
			playheads: { prtOutro: { startTime: 1000, endTime: 6500, duration: 5500, fromSchedule: false } },
			endTime: 6500,
		})
		const state = store.getState()
		// The elapsed time changes at 2000, 3000..., the time left at 1500, 2500... (the duration is 5.5 seconds)
		assert.equal(getTimeSignature(state, 2010), getTimeSignature(state, 2490))
		assert.notEqual(getTimeSignature(state, 2490), getTimeSignature(state, 2510))
		assert.equal(getTimeSignature(state, 2510), getTimeSignature(state, 2990))
		assert.notEqual(getTimeSignature(state, 2990), getTimeSignature(state, 3010))
	})
})
