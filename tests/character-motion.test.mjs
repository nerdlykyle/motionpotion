import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlinkController, createQuiffController, createGazeController } from '../character-motion.js';

function seededRandom(seed = 12345) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const channels = ['upperLeft', 'upperRight', 'lowerLeft', 'lowerRight', 'browLeft', 'browRight'];
const near = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

test('eyes acquire the cursor before the head, then hold fixation as the head catches up', () => {
  const gaze = createGazeController();
  let state = gaze.update(.2, .3, .04);
  assert.ok(state.eyePitch > .12 && state.eyeYaw > .18, 'eyes respond within 40 ms');
  assert.equal(state.pitch, 0);
  assert.equal(state.yaw, 0);
  state = gaze.update(.2, .3, .06);
  assert.equal(state.pitch, 0, 'head remains still for the first 100 ms');
  state = gaze.update(.2, .3, .02);
  assert.ok(state.pitch > 0 && state.yaw > 0, 'head follows after 110 ms');
  for (let i = 0; i < 180; i++) {
    state = gaze.update(.2, .3, 1 / 60);
    assert.ok(state.pitch >= 0 && state.pitch <= .14 + 1e-12);
    assert.ok(state.yaw >= 0 && state.yaw <= .24 + 1e-12);
    assert.ok(state.pitch + state.eyePitch <= .2 + 1e-12, 'global gaze never overshoots');
    assert.ok(state.yaw + state.eyeYaw <= .3 + 1e-12, 'global gaze never overshoots');
  }
  near(state.pitch, .14, 1e-9);
  near(state.yaw, .24, 1e-9);
  near(state.eyePitch, .06, 1e-9);
  near(state.eyeYaw, .06, 1e-9);
});

test('continuous cursor motion still moves the head instead of restarting its delay', () => {
  const gaze = createGazeController();
  let state;
  for (let frame = 1; frame <= 60; frame++) {
    state = gaze.update(frame * .003, frame * .004, 1 / 60);
  }
  assert.ok(state.pitch > .08 && state.yaw > .13, 'delayed history follows a continuously moving target');
  assert.ok(state.eyePitch > 0 && state.eyeYaw > 0, 'eyes still lead toward the current position');
});

test('gaze delay and response agree at 30, 60, and 120 Hz through direction changes', () => {
  const traces = [30, 60, 120].map(hz => {
    const gaze = createGazeController();
    const trace = [];
    for (let frame = 0; frame < hz * 3; frame++) {
      const time = frame / hz;
      const direction = time < 1 ? 1 : time < 2 ? -1 : 0;
      const state = gaze.update(.2 * direction, .3 * direction, 1 / hz);
      if ((frame + 1) % (hz / 10) === 0) trace.push(state);
    }
    return trace;
  });
  for (let run = 1; run < traces.length; run++) {
    for (let sample = 0; sample < traces[0].length; sample++) {
      for (const key of ['pitch', 'yaw', 'eyePitch', 'eyeYaw']) {
        near(traces[run][sample][key], traces[0][sample][key], 1e-10);
      }
    }
  }
});

test('reset clears delayed gaze and seeds the current pose without stale movement', () => {
  const gaze = createGazeController();
  gaze.update(.3, .4, .08);
  assert.deepEqual(gaze.reset(), { pitch: 0, yaw: 0, eyePitch: 0, eyeYaw: 0 });
  for (let frame = 0; frame < 60; frame++) {
    assert.deepEqual(gaze.update(0, 0, 1 / 60), { pitch: 0, yaw: 0, eyePitch: 0, eyeYaw: 0 });
  }
  assert.deepEqual(gaze.reset({ pitch: .1, yaw: -.2 }), {
    pitch: .1, yaw: -.2, eyePitch: 0, eyeYaw: 0,
  });
  const state = gaze.update(.1, -.2, .05);
  near(state.pitch, .1);
  near(state.yaw, -.2);
  near(state.eyePitch, 0);
  near(state.eyeYaw, 0);
});

test('gaze controller bounds extreme inputs and rejects invalid time deltas', () => {
  const gaze = createGazeController();
  for (let frame = 0; frame < 1000; frame++) {
    const sign = frame % 2 ? 1 : -1;
    const state = gaze.update(sign * 1e9, sign * 1e9, 1 / 120);
    assert.ok(Object.values(state).every(Number.isFinite));
    assert.ok(Math.abs(state.eyePitch) <= .23 && Math.abs(state.eyeYaw) <= .34);
    assert.ok(Math.abs(state.pitch) <= .385 && Math.abs(state.yaw) <= .4);
  }
  const frozen = gaze.update(0, 0, 0);
  for (const dt of [NaN, Infinity, -1]) assert.deepEqual(gaze.update(1, 1, dt), frozen);
  assert.ok(Object.values(gaze.update(NaN, Infinity, 10000)).every(Number.isFinite));
});

test('a deliberate blink fully closes both eyes, holds, reopens, and settles', () => {
  for (const randomValue of [0, .5, 1]) {
    const blink = createBlinkController({ random: () => randomValue, reducedMotion: true });
    assert.equal(blink.trigger().phase, 'closing');
    let heldSamples = 0;
    const firstClosed = { upperLeft: null, upperRight: null };
    const lastClosed = { upperLeft: null, upperRight: null };
    const firstReopened = { upperLeft: null, upperRight: null };
    const phases = new Set();
    for (let frame = 1; frame <= 500; frame++) {
      const state = blink.update(.001);
      phases.add(state.phase);
      for (const key of channels) assert.ok(state[key] >= 0 && state[key] <= 1, key);
      for (const key of ['upperLeft', 'upperRight']) {
        if (state[key] === 1) {
          firstClosed[key] ??= frame / 1000;
          lastClosed[key] = frame / 1000;
        } else if (state[key] === 0 && firstClosed[key] !== null) {
          firstReopened[key] ??= frame / 1000;
        }
      }
      if (['upperLeft', 'upperRight', 'lowerLeft', 'lowerRight'].every(key => state[key] === 1)) heldSamples++;
    }
    assert.deepEqual([...phases], ['closing', 'holding', 'opening', 'idle']);
    assert.ok(heldSamples >= 24, 'all four lids share a visible closed hold');
    for (const key of ['upperLeft', 'upperRight']) {
      assert.ok(firstClosed[key] >= .099 && firstClosed[key] <= .180, '3–5 frames plus at most 12 ms eye offset');
      const openingDuration = firstReopened[key] - lastClosed[key];
      assert.ok(openingDuration >= .066 && openingDuration <= .135, '2–4 frames to reopen');
    }
    assert.ok(Math.abs(firstClosed.upperLeft - firstClosed.upperRight) <= .013);
    const resting = blink.update(0);
    assert.ok(channels.every(key => resting[key] === 0));
  }
});

test('lower lids and brows follow the upper lids, without an eyeball-scale channel', () => {
  const blink = createBlinkController({ random: () => 0, reducedMotion: true });
  blink.trigger();
  const early = blink.update(.012);
  assert.ok(early.upperLeft > 0);
  assert.equal(early.lowerLeft, 0);
  assert.equal(early.browLeft, 0);
  const catchup = blink.update(.010);
  assert.ok(catchup.lowerLeft > 0);
  assert.equal(catchup.browLeft, 0);
  assert.equal(Object.keys(early).some(key => /scale/i.test(key)), false);
});

test('the same blink timeline matches at 30, 60, and 120 Hz', () => {
  const samples = [30, 60, 120].map(hz => {
    const controller = createBlinkController({ random: seededRandom(71) });
    controller.trigger();
    const result = [];
    for (let frame = 1; frame <= hz * 12; frame++) {
      const state = controller.update(1 / hz);
      if (frame % (hz / 10) === 0) result.push(state);
    }
    return result;
  });
  for (let run = 1; run < samples.length; run++) {
    for (let i = 0; i < samples[0].length; i++) {
      assert.equal(samples[run][i].phase, samples[0][i].phase);
      for (const key of channels) near(samples[run][i][key], samples[0][i][key], 1e-9);
    }
  }
});

test('random scheduling is repeatable for review and includes spaced natural double blinks', () => {
  const starts = random => {
    const controller = createBlinkController({ random });
    let previous = 'idle';
    const times = [];
    for (let frame = 1; frame <= 12000; frame++) {
      const state = controller.update(.01);
      if (previous === 'idle' && state.phase === 'closing') times.push(frame / 100);
      previous = state.phase;
    }
    return times;
  };
  const schedule = starts(seededRandom(91));
  assert.deepEqual(schedule, starts(seededRandom(91)));
  const gaps = schedule.slice(1).map((time, i) => time - schedule[i]);
  assert.ok(new Set(gaps.map(gap => gap.toFixed(1))).size > 8, 'quiet intervals vary');
  assert.ok(gaps.some(gap => gap < 1), 'occasional second blink');
  assert.ok(gaps.filter(gap => gap >= 1).every(gap => gap >= 2.7 && gap <= 7));
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(!(gaps[i - 1] < 1 && gaps[i] < 1), 'no unintended chains of triple blinks');
  }
});

test('reduced motion remains still until a deliberate trigger; reset cancels movement', () => {
  const controller = createBlinkController({ random: seededRandom(), reducedMotion: true });
  for (let frame = 0; frame < 1000; frame++) assert.equal(controller.update(.1).phase, 'idle');
  controller.trigger();
  assert.ok(controller.update(.05).upperLeft > 0);
  assert.equal(controller.reset().phase, 'idle');
  assert.equal(controller.update(.25).phase, 'idle');
});

test('invalid and suspended-tab time deltas stay finite and bounded', () => {
  const controller = createBlinkController({ random: seededRandom() });
  for (const dt of [NaN, Infinity, -1, 100000, 0]) {
    const state = controller.update(dt);
    assert.ok(channels.every(key => Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1));
  }
  assert.equal(controller.update(0).phase, 'idle', 'a suspended tab does not replay minutes of blinking');
});

test('quiff spring follows head velocity, overshoots naturally, and settles', () => {
  const controller = createQuiffController();
  let state;
  for (let i = 0; i < 15; i++) state = controller.update(.6, .6, 1 / 60);
  assert.ok(state.pitch < 0 && state.yaw < 0 && state.roll > 0, 'hair lags the head');
  let crossed = false;
  for (let i = 0; i < 240; i++) {
    state = controller.update(0, 0, 1 / 60);
    if (state.pitch > 0) crossed = true;
  }
  assert.ok(crossed, 'secondary motion crosses the resting pose');
  for (const value of Object.values(state)) near(value, 0, 1e-12);
  assert.deepEqual(controller.reset(), { pitch: 0, yaw: 0, roll: 0 });
});

test('analytic quiff motion agrees across frame rates and stays inside safe deformation limits', () => {
  const frames = [30, 60, 120].map(hz => {
    const controller = createQuiffController();
    let state;
    for (let frame = 0; frame < hz; frame++) state = controller.update(.25, -.3, 1 / hz);
    return state;
  });
  for (let i = 1; i < frames.length; i++) {
    for (const key of ['pitch', 'yaw', 'roll']) near(frames[i][key], frames[0][key], 1e-12);
  }
  const controller = createQuiffController();
  for (let i = 0; i < 1000; i++) {
    const sign = i % 2 ? -1 : 1;
    const state = controller.update(sign * 100000, -sign * 100000, i % 3 ? 1 / 120 : 1000);
    assert.ok(Math.abs(state.pitch) <= .065 && Math.abs(state.yaw) <= .045 && Math.abs(state.roll) <= .09);
  }
  const finiteState = controller.update(NaN, Infinity, NaN);
  assert.ok(Object.values(finiteState).every(Number.isFinite));
});

