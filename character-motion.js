const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => Number.isFinite(value) ? value : 0;
const smooth = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Eyes acquire a new global look direction first; the head follows that same
 * history 110 ms later. Eye angles are local to the head, so they relax toward
 * center as the head catches up without looking past the pointer.
 */
export function createGazeController() {
  const delay = .11;
  const headSpeed = 7.5;
  const eyeSpeed = 25;
  let time = 0;
  let pitch = 0, yaw = 0;
  let gazePitch = 0, gazeYaw = 0;
  let headTargetPitch = 0, headTargetYaw = 0;
  let lastPitch = 0, lastYaw = 0;
  const pending = [];

  function snapshot() {
    return {
      pitch, yaw,
      eyePitch: clamp(gazePitch - pitch, -.23, .23),
      eyeYaw: clamp(gazeYaw - yaw, -.34, .34),
    };
  }

  function advanceHead(dt) {
    const blend = 1 - Math.exp(-headSpeed * dt);
    pitch += (headTargetPitch - pitch) * blend;
    yaw += (headTargetYaw - yaw) * blend;
  }

  return {
    update(targetPitch, targetYaw, delta) {
      const dt = clamp(finite(delta), 0, .1);
      if (dt === 0) return snapshot();
      targetPitch = clamp(finite(targetPitch), -.55, .55);
      targetYaw = clamp(finite(targetYaw), -.5, .5);
      if (targetPitch !== lastPitch || targetYaw !== lastYaw) {
        pending.push({ time: time + delay, pitch: targetPitch * .7, yaw: targetYaw * .8 });
        lastPitch = targetPitch;
        lastYaw = targetYaw;
        // At ordinary refresh rates only a handful of samples are pending.
        // Bound memory even for callers supplying thousands of tiny steps.
        if (pending.length > 128) pending.splice(1, 1);
      }

      const eyeBlend = 1 - Math.exp(-eyeSpeed * dt);
      gazePitch += (targetPitch - gazePitch) * eyeBlend;
      gazeYaw += (targetYaw - gazeYaw) * eyeBlend;

      const end = time + dt;
      // Integrate each delayed target boundary, rather than rounding the delay
      // to a render frame. Continuous pointer movement never resets a timer.
      while (pending.length && pending[0].time <= end + 1e-12) {
        const sample = pending.shift();
        advanceHead(Math.max(0, sample.time - time));
        time = Math.max(time, sample.time);
        headTargetPitch = sample.pitch;
        headTargetYaw = sample.yaw;
      }
      advanceHead(Math.max(0, end - time));
      time = end;
      return snapshot();
    },
    reset({ pitch: startPitch = 0, yaw: startYaw = 0 } = {}) {
      time = 0;
      pending.length = 0;
      pitch = gazePitch = headTargetPitch = clamp(finite(startPitch), -.385, .385);
      yaw = gazeYaw = headTargetYaw = clamp(finite(startYaw), -.4, .4);
      // Force the first input to establish a fresh delayed target, even when
      // its numeric value happens to match the pre-reset input.
      lastPitch = lastYaw = NaN;
      return snapshot();
    },
  };
}

/**
 * Real-time lid animation, using a 30 fps animation reference.
 * Values describe closure, not eyeball scale. The rig controls how much of the
 * aperture each lid covers; both lid controllers reach exactly 1 when shut.
 */
export function createBlinkController({ random = Math.random, reducedMotion = false } = {}) {
  const sample = () => clamp(finite(random()), 0, 1);
  const quietInterval = () => 2.7 + sample() * 3.8;
  let wait = quietInterval();
  let blink = null;
  let pendingDouble = false;

  function begin(isDouble = false) {
    const down = .1 + sample() * (2 / 30);
    const hold = .025 + sample() * .02;
    const up = 2 / 30 + sample() * (2 / 30);
    const offset = sample() * .012;
    const leftFirst = sample() < .5;
    const left = leftFirst ? 0 : offset;
    const right = leftFirst ? offset : 0;
    const closeEnd = down + offset + .004;
    const openStart = closeEnd + hold;
    blink = {
      time: 0, down, up, left, right, closeEnd, openStart, isDouble,
      // The brow settles just after the lids instead of snapping on their frame.
      duration: openStart + up + .012 + .028,
    };
  }

  function lid(time, onset, lower = false) {
    const start = onset + (lower ? .016 : 0);
    const down = blink.down - (lower ? .012 : 0);
    const open = blink.openStart + (lower ? .012 : 0);
    if (time <= start) return 0;
    if (time < start + down) return smooth((time - start) / down);
    if (time <= open) return 1;
    return 1 - smooth((time - open) / blink.up);
  }

  function snapshot() {
    if (!blink) return {
      upperLeft: 0, upperRight: 0, lowerLeft: 0, lowerRight: 0,
      browLeft: 0, browRight: 0, phase: 'idle',
    };
    const time = blink.time;
    return {
      upperLeft: lid(time, blink.left),
      upperRight: lid(time, blink.right),
      lowerLeft: lid(time, blink.left, true),
      lowerRight: lid(time, blink.right, true),
      browLeft: lid(time - .028, blink.left),
      browRight: lid(time - .028, blink.right),
      phase: time < blink.closeEnd ? 'closing' : time < blink.openStart ? 'holding' : 'opening',
    };
  }

  return {
    update(delta) {
      // Resume from a suspended tab without replaying a queue of missed blinks.
      let remaining = clamp(finite(delta), 0, .25);
      while (remaining > 0) {
        if (blink) {
          const step = Math.min(remaining, Math.max(0, blink.duration - blink.time));
          blink.time += step;
          remaining -= step;
          if (blink.time >= blink.duration - 1e-12) {
            const canDouble = !blink.isDouble && !reducedMotion;
            blink = null;
            if (canDouble && sample() < .1) {
              wait = .13 + sample() * .10;
              pendingDouble = true;
            } else {
              wait = quietInterval();
              pendingDouble = false;
            }
          }
        } else if (reducedMotion) {
          remaining = 0;
        } else {
          const step = Math.min(remaining, Math.max(0, wait));
          wait -= step;
          remaining -= step;
          if (wait <= 1e-12) begin(pendingDouble);
        }
      }
      return snapshot();
    },
    trigger() {
      if (!blink) {
        pendingDouble = false;
        begin();
      }
      return snapshot();
    },
    reset() {
      blink = null;
      pendingDouble = false;
      wait = quietInterval();
      return snapshot();
    },
  };

}

/**
 * Analytic damped spring from the approved site's quiff motion. Input rates
 * are radians per second; output angles are radians in the head's local frame.
 */
export function createQuiffController() {
  const axes = Array.from({ length: 3 }, () => ({ angle: 0, velocity: 0 }));
  const limits = [.065, .045, .09];
  const frequency = 17;
  const damping = .62;
  const decay = frequency * damping;
  const oscillation = frequency * Math.sqrt(1 - damping * damping);
  return {
    update(pitchRate, yawRate, delta) {
      const dt = clamp(finite(delta), 0, .05);
      const targets = [-finite(pitchRate) * .075, -finite(yawRate) * .028, finite(yawRate) * .075];
      const fade = Math.exp(-decay * dt);
      const cosine = Math.cos(oscillation * dt);
      const sine = Math.sin(oscillation * dt);
      for (let i = 0; i < axes.length; i++) {
        const axis = axes[i];
        const limit = limits[i];
        const target = clamp(targets[i], -limit, limit);
        const displacement = axis.angle - target;
        const b = (axis.velocity + decay * displacement) / oscillation;
        const next = fade * (displacement * cosine + b * sine);
        axis.velocity = fade * ((-decay * displacement + oscillation * b) * cosine
          + (-decay * b - oscillation * displacement) * sine);
        axis.angle = clamp(target + next, -limit, limit);
        if (Math.abs(axis.angle) === limit && axis.angle * axis.velocity > 0) axis.velocity = 0;
      }
      return { pitch: axes[0].angle, yaw: axes[1].angle, roll: axes[2].angle };
    },
    reset() {
      for (const axis of axes) {
        axis.angle = 0;
        axis.velocity = 0;
      }
      return { pitch: 0, yaw: 0, roll: 0 };
    },
  };
}
