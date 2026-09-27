/**
 * MissionManager.js — Phase 3 Mission System
 *
 * Each Floor gets one PRIMARY OBJECTIVE that motivates exploration and
 * culminates with the Boss encounter.
 *
 * Each room receives a concise ROOM OBJECTIVE (sub-task) that varies what
 * the player does between fights.
 *
 * Design rules (brief §Mission system):
 *  - Never reveal future room types or contents
 *  - Work with hidden randomized RoomGraph
 *  - Objectives short, readable, connected to the horror setting
 *  - At least one type motivates exploration rather than just combat
 */

import { ROOM_TYPE } from '../core/constants.js';

// Floor-level primary objectives
const FLOOR_OBJECTIVES = [
  {
    id: 'inhibitor_core',
    title: 'LOCATE THE INHIBITOR CORE',
    desc: 'Something suppresses the emergency exits. Destroy it.',
    stepsTotal: 3,
    stepLabel: (n, t) => `Core fragments disabled: ${n}/${t}`,
    events: ['elite_killed', 'boss_reached', 'boss_killed'],
  },
  {
    id: 'access_cipher',
    title: 'RECOVER THE ACCESS CIPHER',
    desc: 'A classified key was dropped during containment failure. Retrieve it.',
    stepsTotal: 3,
    stepLabel: (n, t) => `Cipher fragments secured: ${n}/${t}`,
    events: ['treasure_entered', 'elite_killed', 'boss_killed'],
  },
  {
    id: 'purge_infestation',
    title: 'PURGE THE INFESTATION SOURCE',
    desc: 'Bio-signatures indicate a primary growth node in this sector.',
    stepsTotal: 3,
    stepLabel: (n, t) => `Clusters eliminated: ${n}/${t}`,
    events: ['combat_cleared', 'elite_killed', 'boss_killed'],
  },
  {
    id: 'signal_trace',
    title: 'TRACE THE DISTRESS SIGNAL',
    desc: 'An emergency beacon is pinging from deep in the facility. Reach it.',
    stepsTotal: 3,
    stepLabel: (n, t) => `Signal sectors reached: ${n}/${t}`,
    events: ['mystery_entered', 'elite_killed', 'boss_killed'],
  },
  {
    id: 'lockdown_lift',
    title: 'OVERRIDE LOCKDOWN PROTOCOL',
    desc: 'Automated containment has sealed the lower levels. Disable the terminals.',
    stepsTotal: 3,
    stepLabel: (n, t) => `Terminals disabled: ${n}/${t}`,
    events: ['rest_entered', 'elite_killed', 'boss_killed'],
  },
];

// Room-level sub-task prompts
const ROOM_OBJECTIVES = {
  combat: [
    { id: 'clear_chamber',   label: 'Clear the contaminated chamber.',      doneOn: 'combat_cleared' },
    { id: 'survive_ambush',  label: 'Survive the ambush and push forward.', doneOn: 'combat_cleared' },
    { id: 'eliminate_squad', label: 'Eliminate the patrol unit.',           doneOn: 'combat_cleared' },
  ],
  elite: [
    { id: 'neutralize',  label: 'Neutralize the elite unit blocking the route.', doneOn: 'elite_killed' },
    { id: 'defeat_grd',  label: 'Defeat the facility guardian.',                 doneOn: 'elite_killed' },
  ],
  boss: [
    { id: 'destroy_threat', label: 'Destroy the primary threat to advance.', doneOn: 'boss_killed' },
  ],
  treasure: [
    { id: 'secure_cache', label: 'Secure the abandoned supply cache.',      doneOn: 'immediate' },
  ],
  rest: [
    { id: 'use_terminal', label: 'Access the emergency rest terminal.',     doneOn: 'immediate' },
  ],
  mystery: [
    { id: 'investigate',  label: 'Investigate the anomaly.',                doneOn: 'immediate' },
  ],
  safe: [
    { id: 'regroup',      label: 'Safe zone secure. Regroup.',              doneOn: 'immediate' },
  ],
  shop: null,
};

function seedPick(arr, seed) {
  return arr[Math.abs(seed | 0) % arr.length];
}

export class MissionManager {
  constructor(floorNum, seed) {
    this.floorNum = floorNum;
    this.seed     = seed;

    const objIdx = ((floorNum - 1) + Math.abs(seed % FLOOR_OBJECTIVES.length))
                   % FLOOR_OBJECTIVES.length;
    this._floorDef = FLOOR_OBJECTIVES[objIdx];

    this._floorStep          = 0;
    this._pendingFloorEvents = [...this._floorDef.events];

    this._roomObj     = null;
    this._roomObjDone = false;

    this._onFloorProgressCbs = [];
    this._onFloorCompleteCbs = [];
    this._onRoomObjectiveCbs = [];
  }

  get floorObjectiveTitle() { return this._floorDef.title; }
  get floorObjectiveDesc()  { return this._floorDef.desc; }
  get floorStepsTotal()     { return this._floorDef.stepsTotal; }
  get floorStepsCurrent()   { return this._floorStep; }
  get floorComplete()       { return this._floorStep >= this._floorDef.stepsTotal; }
  get floorStepLabel()      { return this._floorDef.stepLabel(this._floorStep, this._floorDef.stepsTotal); }
  get roomObjectiveLabel()  { return this._roomObj ? this._roomObj.label : null; }
  get roomObjectiveDone()   { return this._roomObjDone; }

  enterRoom(roomType, roomSeed) {
    if (roomSeed === undefined) roomSeed = 0;
    const options = ROOM_OBJECTIVES[roomType];
    this._roomObjDone = false;
    this._roomObj     = null;

    if (options && options.length > 0) {
      const def = seedPick(options, roomSeed ^ this.seed);
      this._roomObj = Object.assign({}, def, { done: false });
      if (def.doneOn === 'immediate') {
        this._completeRoomObjective();
      }
    }

    this._fireFloorEvent(roomType + '_entered');
  }

  fireEvent(eventId) {
    if (this._roomObj && !this._roomObjDone && this._roomObj.doneOn === eventId) {
      this._completeRoomObjective();
    }
    this._fireFloorEvent(eventId);
  }

  _fireFloorEvent(eventId) {
    if (this.floorComplete) return;
    const idx = this._pendingFloorEvents.indexOf(eventId);
    if (idx === -1) return;
    this._pendingFloorEvents.splice(idx, 1);
    this._floorStep++;
    const done = this.floorComplete;
    this._onFloorProgressCbs.forEach(function(cb) { cb(this._floorStep, this._floorDef.stepsTotal, done); }, this);
    if (done) this._onFloorCompleteCbs.forEach(function(cb) { cb(); });
  }

  _completeRoomObjective() {
    if (this._roomObjDone || !this._roomObj) return;
    this._roomObjDone = true;
    this._roomObj.done = true;
    var label = this._roomObj.label;
    this._onRoomObjectiveCbs.forEach(function(cb) { cb(label); });
  }

  onFloorProgress(cb) { this._onFloorProgressCbs.push(cb); }
  onFloorComplete(cb) { this._onFloorCompleteCbs.push(cb); }
  onRoomObjective(cb) { this._onRoomObjectiveCbs.push(cb); }

  serialise() {
    return {
      floorNum:           this.floorNum,
      seed:               this.seed,
      floorStep:          this._floorStep,
      pendingFloorEvents: this._pendingFloorEvents.slice(),
    };
  }

  static restore(data) {
    const m = new MissionManager(data.floorNum, data.seed);
    m._floorStep           = data.floorStep;
    m._pendingFloorEvents  = data.pendingFloorEvents.slice();
    return m;
  }
}