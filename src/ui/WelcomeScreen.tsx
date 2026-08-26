import { useState } from 'react'
import { isMultiplayerConfigured } from '../net/room'
import { isSupabaseConfigured } from '../store/supabase'
import { AuthStatus, useAuthStore } from '../store/useAuthStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'
import { ControlsCard } from './ControlsCard'

/**
 * The first screen, and the only one that asks anything before play starts.
 *
 * Three decisions, in the order they matter: who you are, whether anyone else
 * is on your strip, and what the keys do. None of them is a wall — guest is the
 * default and the primary action is always live, so a player who reads nothing
 * and clicks once is on the street.
 *
 * It sits in front of the strip rather than a flat backdrop because the strip is
 * the thing being sold, and it costs nothing: the scene is already mounted.
 */
export function WelcomeScreen() {
  const mode = useSessionStore((state) => state.mode)
  const setMode = useSessionStore((state) => state.setMode)
  const completeWelcome = useSessionStore((state) => state.completeWelcome)

  const status = useAuthStore((state) => state.status)
  const player = useAuthStore((state) => state.player)
  const authError = useAuthStore((state) => state.error)
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle)

  const [showControls, setShowControls] = useState(false)

  const signedIn = status === AuthStatus.SignedIn && player !== null

  /*
   * A mode the build cannot honour is never the one we start with. The socket
   * layer checks this too, but a screen that lets you pick "Multiplayer" and
   * then quietly plays you alone is worse than one that never offered it.
   */
  const chosenMode = isMultiplayerConfigured ? mode : PlayMode.Single

  return (
    <div className="welcome">
      <div className="welcome__panel">
        <header className="welcome__header">
          <h1 className="welcome__title">Neon Strip</h1>
          <p className="welcome__subtitle">
            Walk the strip, find a casino, and play the house with real odds and
            fictional money.
          </p>
        </header>

        <section className="welcome__section">
          <h2 className="welcome__legend">Playing as</h2>

          {signedIn ? (
            <p className="welcome__account">
              {player.avatarUrl !== null && (
                <img className="welcome__avatar" src={player.avatarUrl} alt="" width={24} height={24} />
              )}
              <span>{player.name}</span>
              <span className="welcome__note">Your chips follow you to another device.</span>
            </p>
          ) : (
            <>
              <p className="welcome__account">
                <span>Guest</span>
                <span className="welcome__note">
                  Everything stays in this browser. Nothing is sent anywhere.
                </span>
              </p>

              {/*
                Only when there is a Supabase to sign in to. A fresh clone or a
                preview deploy without the environment variables has to look
                exactly like the game did before accounts, rather than showing a
                button that fails.
              */}
              {isSupabaseConfigured && (
                <button
                  type="button"
                  className="button welcome__signin"
                  disabled={status === AuthStatus.Restoring}
                  onClick={() => void signInWithGoogle()}
                >
                  Sign in with Google to keep your chips
                </button>
              )}

              {authError !== null && <p className="welcome__error">{authError}</p>}
            </>
          )}
        </section>

        <section className="welcome__section">
          <h2 className="welcome__legend">How to play</h2>

          <div className="welcome__choices">
            <button
              type="button"
              className={`button button--choice${chosenMode === PlayMode.Single ? ' button--choice-on' : ''}`}
              onClick={() => setMode(PlayMode.Single)}
            >
              Single player
            </button>
            <button
              type="button"
              className={`button button--choice${chosenMode === PlayMode.Multiplayer ? ' button--choice-on' : ''}`}
              disabled={!isMultiplayerConfigured}
              onClick={() => setMode(PlayMode.Multiplayer)}
            >
              Multiplayer
            </button>
          </div>

          <p className="welcome__note">
            {!isMultiplayerConfigured
              ? 'Multiplayer is unavailable in this build.'
              : chosenMode === PlayMode.Multiplayer
                ? 'Other players walk the same strip and stand in the same rooms.'
                : 'Nobody else on your strip. No connection is made.'}
          </p>
        </section>

        <section className="welcome__section">
          {/*
            Collapsed by default. The controls are two rows and most players
            will not read them, but the one who wants them should not have to
            find out by walking into a wall.
          */}
          <button
            type="button"
            className="button button--ghost welcome__disclosure"
            aria-expanded={showControls}
            onClick={() => setShowControls((open) => !open)}
          >
            {showControls ? 'Hide controls' : 'Show controls'}
          </button>

          {showControls && <ControlsCard />}
        </section>

        <button
          type="button"
          className="button button--primary welcome__start"
          onClick={() => completeWelcome(chosenMode)}
        >
          Enter the strip
        </button>
      </div>
    </div>
  )
}
