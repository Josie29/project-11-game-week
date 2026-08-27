import { execFileSync } from 'node:child_process'
import { cpus } from 'node:os'

/**
 * Refuses to start a browser-driven check on a machine that is already busy.
 *
 * Every script that imports this drives headless Chrome with SwiftShader —
 * software rasterisation, no GPU — which is the most CPU-hungry thing in this
 * repository. Two of them at once do not merely run slowly.
 *
 * They produce *wrong answers*. The walkthrough asserts by holding a movement
 * key for a fixed number of bursts and then checking what is on screen, so
 * frame rate is distance travelled: on a busy machine the same scripted walk
 * covers less ground and strolls past the prompt it was sent to find. The
 * failure is indistinguishable from a geometry bug, and `MIRROR_RADIUS` in
 * `shopLayout.ts` carries a comment about a previous occasion where it was
 * mistaken for one.
 *
 * That is the cost this guard exists to avoid: not the slow run, but the hours
 * spent attributing a load failure to a change that was fine.
 */

/**
 * How much of the machine has to be free, as a percentage of total CPU.
 *
 * **Idle CPU, not load average.** The first version of this guard read
 * `loadavg()` and refused above one per core, which sounds equivalent and is
 * not: on macOS the load average counts threads blocked in the kernel as well
 * as threads wanting to run, and Chrome, VS Code and the agent itself keep
 * hundreds of them. Measured on the ten-core machine this was written for, an
 * ordinary desktop with an editor open and one browser tab rendering sat at a
 * load average of 12 to 18 while `top` reported **54% idle** — five free cores,
 * and every browser-driven check refused for an hour.
 *
 * A run needs roughly one core to itself plus headroom for the compositor, so
 * this is set at a third of the machine. It is the quantity the guard actually
 * cares about: how much CPU there is left for a render loop.
 */
const IDLE_FLOOR = 33

/** Set this to run anyway, when you know what the machine is doing. */
const OVERRIDE = 'IGNORE_MACHINE_LOAD'

/**
 * Percentage of CPU currently idle, or null if it cannot be measured.
 *
 * Two samples, because the first line `top` prints is an average since boot and
 * says nothing about now. Costs about a second, against a check that takes
 * minutes.
 *
 * Returns null rather than throwing on anything unexpected — a guard that
 * cannot take a reading must let the run proceed, not block it. Refusing to
 * work because the thermometer is broken is worse than the thing it guards.
 *
 * @returns {number | null}
 */
function idlePercent() {
  try {
    const output = execFileSync('top', ['-l', '2', '-n', '0', '-s', '1'], {
      encoding: 'utf8',
      timeout: 15_000,
    })

    // "CPU usage: 26.5% user, 19.67% sys, 54.27% idle" — the last one is now.
    const readings = [...output.matchAll(/CPU usage:.*?([\d.]+)%\s+idle/g)]
    const last = readings[readings.length - 1]

    return last ? Number(last[1]) : null
  } catch {
    return null
  }
}

/**
 * Exits the process if the machine is too busy for a trustworthy run.
 *
 * @param {string} what Name of the check, for the message.
 * @returns {void}
 */
export function requireQuietMachine(what) {
  if (process.env[OVERRIDE]) return

  const idle = idlePercent()
  if (idle === null || idle >= IDLE_FLOOR) return

  console.error(
    [
      ``,
      `${what} refused: the machine is too busy for the result to mean anything.`,
      ``,
      `  idle CPU   ${idle.toFixed(1)}%`,
      `  floor      ${IDLE_FLOOR}%  (${cpus().length} cores)`,
      ``,
      `This check drives headless Chrome on a software renderer, and it asserts`,
      `by walking a fixed number of key bursts — so on a busy machine the`,
      `player covers less ground and walks past the thing being tested. A pass`,
      `would be luck and a failure would not be evidence.`,
      ``,
      `Find what is using the machine before waiting on it. A crashed capture`,
      `leaves its headless Chrome running with a live render loop, which holds`,
      `a core for as long as the terminal stays open:`,
      ``,
      `  ps -eo pid,etime,%cpu,command | grep headless`,
      ``,
      `Or run anyway with:  ${OVERRIDE}=1 npm run ...`,
      ``,
    ].join('\n'),
  )

  // 75 is EX_TEMPFAIL, the same code `lockf` uses when somebody else holds the
  // lock: "nothing is wrong with your request, the machine is just not free".
  process.exit(75)
}
