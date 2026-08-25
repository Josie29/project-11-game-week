import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { NurseTask } from '../scenes/clinicRoutine'
import { canDonate, DONATION_FEE, nextDonationClock } from '../world/money'

/*
 * What the chair offers.
 *
 * Deliberately plain — no chips, no stakes, no colour. It is the one screen in
 * the game that is not trying to excite anyone, which is the whole point of the
 * clinic existing.
 */

export function ClinicPanel() {
  const bankroll = useGameStore((state) => state.bankroll)
  const lastDonationDay = useGameStore((state) => state.lastDonationDay)
  const beginDonation = useGameStore((state) => state.beginDonation)
  const donation = useGameStore((state) => state.donation)
  const nurseTask = useGameStore((state) => state.nurseTask)
  const leaveChair = useGameStore((state) => state.leaveChair)
  const day = useTimeStore((state) => state.day)

  const accepted = canDonate(day, lastDonationDay)

  // Escape stands up, as it leaves a table and leaves the shop.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') leaveChair()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leaveChair])

  return (
    <div className="table-ui">
      <div className="clinic">
        {donation !== null ? (
          /*
           * Narrated rather than a spinner, because the wait is the feature:
           * the money lands when she finishes, and Get up stays live the whole
           * time so leaving is a real choice rather than a formality.
           */
          <span className="clinic__line">
            {nurseTask === NurseTask.Approaching
              ? 'She is coming over.'
              : 'Hold still. Nearly there.'}
          </span>
        ) : accepted ? (
          <>
            <span className="clinic__line">
              They will take a pint today. It pays{' '}
              <strong className="clinic__fee">${DONATION_FEE}</strong>.
            </span>
            <button type="button" className="button button--primary" onClick={beginDonation}>
              Donate
            </button>
          </>
        ) : (
          <>
            <span className="clinic__line clinic__line--refused">
              You have already given today.
            </span>
            <span className="clinic__line">
              Next accepted at <strong>{nextDonationClock()}</strong>.
            </span>
          </>
        )}

        <span className="clinic__bankroll">${bankroll.toLocaleString()}</span>

        <button type="button" className="button button--ghost" onClick={leaveChair}>
          Get up <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
