import { cpus, loadavg } from 'node:os'

/**
 * Refuses to start a browser-driven check on a machine that is already busy.
 *
 * Every script that imports this drives headless Chrome with SwiftShader —
 * software rasterisation, no GPU — which is the most CPU-hungry thing in this
 * repository. Two of them at once do not merely run slowly.
 *
 * They produce *wrong answers*. The walkthrough asserts by holding a movement
 * key for a fixed number of bursts and then checking what is on screen, so
 * frame rate is distance travelled: on a loaded machine the same scripted walk
 * covers less ground and strolls past the prompt it was sent to find. The
 * failure is indistinguishable from a geometry bug, and `MIRROR_RADIUS` in
 * `shopLayout.ts` carries a comment about a previous occasion where it was
 * mistaken for one.
 *
 * That is the cost this guard exists to avoid: not the slow run, but the hours
 * spent attributing a load failure to a change that was fine.
 */

/**
 * Load average at which a run is refused.
 *
 * One times the core count, i.e. the machine is already fully committed before
 * this run adds a browser to it. Measured on the ten-core machine this was
 * written for: a walkthrough at load 3 passed twenty of twenty beats, and the
 * same commit at load 19 and above failed at a different beat every time, on
 * main as readily as on a branch.
 */
const LOAD_CEILING = cpus().length

/** Set this to run anyway, when you know what the load is and accept it. */
const OVERRIDE = 'IGNORE_MACHINE_LOAD'

/**
 * Exits the process if the machine is too busy for a trustworthy run.
 *
 * @param {string} what Name of the check, for the message.
 * @returns {void}
 */
export function requireQuietMachine(what) {
  if (process.env[OVERRIDE]) return

  const [oneMinute] = loadavg()
  if (oneMinute <= LOAD_CEILING) return

  console.error(
    [
      ``,
      `${what} refused: the machine is too busy for the result to mean anything.`,
      ``,
      `  load average   ${oneMinute.toFixed(2)}  (1 min)`,
      `  ceiling        ${LOAD_CEILING.toFixed(2)}  (${cpus().length} cores)`,
      ``,
      `This check drives headless Chrome on a software renderer, and it asserts`,
      `by walking a fixed number of key bursts — so on a loaded machine the`,
      `player covers less ground and walks past the thing being tested. A pass`,
      `would be luck and a failure would not be evidence.`,
      ``,
      `Wait for the other session to finish, or run anyway with:`,
      `  ${OVERRIDE}=1 npm run ...`,
      ``,
    ].join('\n'),
  )

  // 75 is EX_TEMPFAIL, the same code `lockf` uses when somebody else holds the
  // lock: "nothing is wrong with your request, the machine is just not free".
  process.exit(75)
}
