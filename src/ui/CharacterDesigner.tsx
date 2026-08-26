import { Garment, HairStyle, PLAYER_GARMENTS, type Appearance } from '../character/appearance'
import { GARMENT_COLORS, HAIR_COLORS, SKIN_TONES, type Swatch } from '../character/palette'
import { Silhouette } from '../character/proportions'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { FALLBACK_NAME, MAX_NAME_LENGTH } from '../world/presence'
import { useGameStore } from '../store/useGameStore'

/*
 * The designer overlay.
 *
 * Occupies the left third of the screen; the rest stays transparent so the
 * turntable in `DesignerStage` shows through. Every control writes straight to
 * the store, so the figure updates as the player clicks rather than on a
 * separate "preview" step — with a rotating model there is nothing to preview.
 */

const SILHOUETTE_LABELS: Record<Silhouette, string> = {
  [Silhouette.Feminine]: 'Feminine',
  [Silhouette.Masculine]: 'Masculine',
  [Silhouette.Androgynous]: 'Androgynous',
}

const HAIR_LABELS: Record<HairStyle, string> = {
  [HairStyle.Buzz]: 'Buzz',
  [HairStyle.Crop]: 'Crop',
  [HairStyle.Pompadour]: 'Pompadour',
  [HairStyle.Bob]: 'Bob',
  [HairStyle.Long]: 'Long',
  [HairStyle.Ponytail]: 'Ponytail',
  [HairStyle.Updo]: 'Updo',
  [HairStyle.Coils]: 'Coils',
}

const GARMENT_LABELS: Record<Garment, string> = {
  [Garment.Suit]: 'Suit',
  [Garment.CocktailDress]: 'Cocktail dress',
  [Garment.ShirtAndSkirt]: 'Shirt & skirt',
  [Garment.TeeAndJeans]: 'Tee & jeans',
  // Never shown: scrubs are staff uniform and are not in `PLAYER_GARMENTS`.
  [Garment.Scrubs]: 'Scrubs',
}

interface ChoiceRowProps<T extends string> {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onPick: (value: T) => void
}

function ChoiceRow<T extends string>({ label, options, labels, value, onPick }: ChoiceRowProps<T>) {
  return (
    <fieldset className="designer__field">
      <legend className="designer__legend">{label}</legend>
      <div className="designer__choices">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`button button--choice${option === value ? ' button--choice-on' : ''}`}
            aria-pressed={option === value}
            onClick={() => onPick(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

interface SwatchRowProps {
  label: string
  palette: readonly Swatch[]
  value: string
  onPick: (id: string) => void
}

function SwatchRow({ label, palette, value, onPick }: SwatchRowProps) {
  return (
    <fieldset className="designer__field">
      <legend className="designer__legend">{label}</legend>
      <div className="designer__swatches">
        {palette.map((swatch) => (
          <button
            key={swatch.id}
            type="button"
            className={`designer__swatch${swatch.id === value ? ' designer__swatch--on' : ''}`}
            style={{ background: swatch.hex }}
            // The colour is the only thing on the button, so the name has to
            // reach a screen reader some other way.
            aria-label={swatch.name}
            aria-pressed={swatch.id === value}
            title={swatch.name}
            onClick={() => onPick(swatch.id)}
          />
        ))}
      </div>
    </fieldset>
  )
}

export function CharacterDesigner() {
  const appearance = useAppearanceStore((state) => state.appearance)
  const setAppearance = useAppearanceStore((state) => state.setAppearance)
  const completeDesign = useAppearanceStore((state) => state.completeDesign)
  const hasDesigned = useAppearanceStore((state) => state.hasDesigned)
  const closeDesigner = useGameStore((state) => state.closeDesigner)

  const update = (patch: Partial<Appearance>) => setAppearance({ ...appearance, ...patch })

  const playerName = useAppearanceStore((state) => state.playerName)
  const setPlayerName = useAppearanceStore((state) => state.setPlayerName)

  const done = () => {
    completeDesign()
    closeDesigner()
  }

  return (
    <div className="designer">
      <header className="designer__header">
        <h1 className="designer__title">Who are you tonight?</h1>
        <p className="designer__subtitle">
          {hasDesigned
            ? 'Change anything. Your wardrobe stays as it is.'
            : 'You can change all of this later at the shop on the strip.'}
        </p>
      </header>

      {/*
        Name first, because it is the only thing here anyone else reads. The
        rest of this screen decides what you look like; this decides what you
        are called when somebody passes you on the street.
      */}
      <fieldset className="designer__field">
        <legend className="designer__legend">Name</legend>
        <input
          className="designer__name"
          type="text"
          value={playerName}
          maxLength={MAX_NAME_LENGTH}
          spellCheck={false}
          autoComplete="off"
          placeholder={FALLBACK_NAME}
          aria-label="Your name, shown above your character to other players"
          onChange={(event) => setPlayerName(event.target.value)}
        />
        <p className="designer__hint">Shown over your head to anyone else on the strip.</p>
      </fieldset>

      <ChoiceRow
        label="Build"
        options={Object.values(Silhouette)}
        labels={SILHOUETTE_LABELS}
        value={appearance.silhouette}
        onPick={(silhouette) => update({ silhouette })}
      />

      <SwatchRow
        label="Skin"
        palette={SKIN_TONES}
        value={appearance.skinTone}
        onPick={(skinTone) => update({ skinTone })}
      />

      <ChoiceRow
        label="Hair"
        options={Object.values(HairStyle)}
        labels={HAIR_LABELS}
        value={appearance.hairStyle}
        onPick={(hairStyle) => update({ hairStyle })}
      />

      <SwatchRow
        label="Hair colour"
        palette={HAIR_COLORS}
        value={appearance.hairColor}
        onPick={(hairColor) => update({ hairColor })}
      />

      <ChoiceRow
        label="Clothes"
        options={PLAYER_GARMENTS}
        labels={GARMENT_LABELS}
        value={appearance.garment}
        onPick={(garment) => update({ garment })}
      />

      <SwatchRow
        label="Colour"
        palette={GARMENT_COLORS}
        value={appearance.garmentColor}
        onPick={(garmentColor) => update({ garmentColor })}
      />

      <div className="designer__actions">
        <button type="button" className="button button--primary designer__done" onClick={done}>
          {hasDesigned ? 'Done' : 'Hit the strip'}
        </button>

        {/*
          Only on the first run, and deliberately not styled as a peer of the
          primary action. Somebody returning to change their look has nothing to
          skip — `done` already keeps what they have — so offering it there
          would be a second button that does the same thing as the first.

          Skipping leaves `appearance` at whatever the store already holds,
          which `sanitizeAppearance` guarantees is drawable. It does not invent
          a second set of defaults for a character that would then differ from
          the one the designer opens on.
        */}
        {!hasDesigned && (
          <button type="button" className="button designer__skip" onClick={done}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
