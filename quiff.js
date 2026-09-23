const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value, low, high) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

// Original sculpt coordinates after the site's orientation transform.
// Fade in above the hairline, toward the front, and away from the temples.
export function quiffWeight(x, y, z) {
  return .88 * smooth(y, .395, .455)
    * smooth(z, -.018, .045)
    * (1 - smooth(Math.abs(x), .060, .115));
}

export function createQuiffMotion() {
  const axes = [0, 1, 2].map(() => ({ angle: 0, velocity: 0 }));
  const limits = [.065, .045, .09];
  const frequency = 17, damping = .62;
  const decay = frequency * damping;
  const oscillation = frequency * Math.sqrt(1 - damping * damping);
  return {
    update(pitchRate, yawRate, delta) {
      const dt = clamp(delta, 0, .05);
      const targets = [-pitchRate * .075, -yawRate * .028, yawRate * .075];
      const fade = Math.exp(-decay * dt);
      const cosine = Math.cos(oscillation * dt), sine = Math.sin(oscillation * dt);
      for (let i = 0; i < axes.length; i++) {
        const axis = axes[i], limit = limits[i];
        const target = clamp(targets[i], -limit, limit);
        const displacement = axis.angle - target;
        const b = (axis.velocity + decay * displacement) / oscillation;
        const next = fade * (displacement * cosine + b * sine);
        axis.velocity = fade * ((-decay * displacement + oscillation * b) * cosine
          + (-decay * b - oscillation * displacement) * sine);
        axis.angle = clamp(target + next, -limit, limit);
        if (Math.abs(axis.angle) === limit && axis.angle * axis.velocity > 0) axis.velocity = 0;
      }
      return axes;
    },
    reset() { for (const axis of axes) { axis.angle = 0; axis.velocity = 0; } }
  };
}
