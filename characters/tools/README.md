# Foundry → character sheet importer

Turns a Foundry VTT **dnd5e** actor export into a sheet that matches the rest
of `characters/`, wired to the shared `sheet.css` and `sheet.js`.

## Usage

```sh
cd characters/tools
python3 foundry_import.py foundry-exports/sky_scarlet.json overlays/sky_scarlet.json -o ../sky_scarlet.html
```

Regenerate all five:

```sh
for n in sky_scarlet cronus_aldor mimic jebrael_crux wolffe_loudstrife; do
  python3 foundry_import.py foundry-exports/$n.json overlays/$n.json -o ../$n.html
done
```

Inspect what the importer read, without writing a sheet:

```sh
python3 foundry_import.py foundry-exports/mimic.json --dump-model | less
```

## The two inputs

**`foundry-exports/*.json`** — the raw actor, exported from Foundry
(right-click the actor → Export Data). Everything numeric comes from here:
abilities, skills, saves, HP, AC, weapons and their damage dice, spells,
features, gear, currency. Re-export after a level-up and re-run.

**`overlays/*.json`** — the things a Foundry export cannot know, written by
hand: the colour theme, the "Don't Forget" reminders, how actions are grouped
into Attack / Bonus / Reaction / Magic / Other, and the condensed feature
bullets. Keeping this separate is the point — you can re-import a levelled-up
actor without losing any authored text.

### Overlay fields

| field | meaning |
|---|---|
| `slug` | file name and `localStorage` prefix |
| `icon` | emoji badge on the portrait |
| `links` | 5e.tools URLs for class / race / background; `null` renders plain text for homebrew |
| `theme` | palette + hero gradient + reminder icon |
| `bio` | age, gender, height… — Foundry leaves these blank, so fill them in here |
| `resources` | extra dot trackers (`id`, `name`, `total`, `note`) |
| `short_rest` | `keys` recharged on a short rest + the message shown |
| `rest` | bullets for the Rest Recovery card |
| `actions` | `attack` / `bonus` / `reaction` / `magic` / `other` lists (HTML allowed) |
| `reminders` | the "Don't Forget" panel |
| `features` | feature cards: `title` + `bullets` |
| `adjust` | manual corrections: `init_bonus`, `ranged_attack_bonus` |
| `hide_weapons` | weapon names to leave off the sheet |
| `max_prepared` | prepared-spell limit for casters |

### Why `adjust` exists

These exports carry **no active effects**, so bonuses a feature grants are not
in the numbers. Two are applied by hand and noted in each sheet's reminders:

* Wolffe — Fighting Style: Archery, `ranged_attack_bonus: 2`
* Cronus — Hare-Trigger, `init_bonus: 2`

If you add a feature that changes a derived number, put it in `adjust` and say
so in `reminders` — don't hand-edit the generated HTML, it gets overwritten.

## Assumptions

* HP maximum is computed as hit die + CON at level 1; above that the exported
  current HP is used, so top the character up in Foundry before exporting.
* AC comes from equipped armour + DEX (capped for medium) + shield.
* Tool proficiency uses the kit's canonical ability, since Foundry often
  stores a generic `int`.
