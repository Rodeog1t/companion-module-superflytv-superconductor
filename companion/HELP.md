## SuperFlyTV SuperConductor

Controls the playout of [SuperConductor](https://github.com/SuperFlyTV/SuperConductor), and shows names, statuses and timers on the buttons.

### Requirements

This module needs a version of SuperConductor that has the **Companion API**.
Enable it in SuperConductor: the home page → **Bridges** → **Companion**, and note the port (5505 by default).

It also needs Companion 5.0.5 or later. On earlier versions the buttons made from the presets display `$NA`, because their local variables are not created.

### Configuration

- **SuperConductor host**: The address of the computer running SuperConductor (`127.0.0.1` if it is this one).
- **Port**: The port of the Companion API.

### Making buttons

The buttons are defined in Companion, so the Stream Deck (or any other surface) stays under the control of Companion.
Do not enable the same Stream Deck in SuperConductor: SuperConductor would take it over and Companion could no longer draw on it.

You choose what each button does and how it looks, using the actions, feedbacks and variables of this module.
The easiest way to start is to drag a preset onto a button, then change it as you like.

**Presets**

For each rundown there are presets for:

- **Groups**: one button per group. It plays (or stops) the whole group and displays the name of the group, the part that is playing and its time left.
- **Parts**: one button per part. It plays (or stops) that part and displays its name and timer.
- **Parts by position**: one button per position in a group, so the buttons follow the changes made in SuperConductor.
- **Controls**: status, play, stop, pause, next, previous and schedule buttons for a group.

A part can be pointed out in several ways:

- **A specific part**: the button follows that part, wherever it is moved.
- **The part at a position in a group**: the button plays whatever part is at that position, so it follows the changes made in SuperConductor.
- **The part that is playing in a group**, or **the next part in a group**.

Instead of picking a part or a group from the list, you can type its name: `Group name` or `Group name|||Part name`
(add `Rundown name|||` in front if several rundowns have groups with the same name).

**Actions**

- Part: Play, Stop, Pause / Resume, Play / Stop
- Group: Play, Stop, Pause / Resume, Play / Stop, Play next part, Play previous part
- Group: Enable schedule, Disable schedule, Enable / Disable schedule.
  These only work on a group that is in the **Schedule** playout mode in SuperConductor, and that is not locked.

**Feedbacks**

- Part: Is playing, Is paused, Is about to end, Is next, Exists, Is disabled
- Group: Is playing, Is paused, Current part is about to end, Schedule is enabled
- Part: Information and Group: Information. These give a text (a name, a status or a timer).
  Store it in a local variable of the button and use it in the button text, like `$(local:name)\n$(local:time)`.
  The presets are set up this way.

**Variables**

For every group and every part there are variables with its name, status and timers.
They are listed in the Variables tab of the connection.
Timers are formatted as `m:ss` (or `h:mm:ss`), there are also variables with the time in seconds for use in expressions.
