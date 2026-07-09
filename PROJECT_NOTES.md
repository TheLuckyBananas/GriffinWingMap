# Griffin Wing Map Project Notes

## Source Of Truth

Primary map repo:

```text
C:\Users\stanb\Documents\Codex\GitHub\GriffinWingMap
```

This is the folder watched by GitHub Desktop and used for GitHub Pages.

User-facing site:

```text
https://theluckybananas.github.io/GriffinWingMap/
```

Deep Desert direct link:

```text
https://theluckybananas.github.io/GriffinWingMap/?map=deep
```

Keep future map edits in the GitHub Desktop repo folder above. Older `outputs` folders are reference/backup only and should not be treated as source of truth.

## Commit Workflow

When code changes are made, provide both:

```text
Commit Summary
```

and

```text
Commit Description
```

Also state the app version that should appear in the top-right live badge after GitHub Pages updates.

The app uses cache-busting versions in:

- `APP_VERSION` in `app.js`
- `styles.css?v=###` in `index.html`
- `app.js?v=###` in `index.html`

The live badge should read like:

```text
v### Live
```

## App Overview

This is a Dune: Awakening guild map for Griffin Wing.

It has two map tabs:

- Hagga Basin
- Deep Desert

Initial page load should show Hagga Basin.

Users do not log in manually. Supabase anonymous auth is used in the background. Anyone with the link can use the site.

## Supabase

Supabase stores marker data and anonymous users.

Important behavior:

- Users can add/edit/move/delete their own markers.
- Admins can edit/move/delete any marker.
- Hagga Basin normal users have a max of 3 bases.
- Deep Desert has unlimited friendly bases and enemy bases.
- Enemy markers can be deleted by anyone.
- Claimed/shared ownership exists through `base_marker_claims`.
- Admins are listed in Supabase admin table/policy setup.

## Hagga Basin

Purpose:

- Guild member base locations.

Marker behavior:

- Character Name field.
- Seitch Name field.
- Hover label shows base name and seitch.
- Friendly base tiles on right panel show name and details.
- Normal users can place up to 3 bases.
- Admin can place unlimited bases.
- Admin can place as self or as other/member.
- Admin can mark Guild Access Base, which uses the red guild icon.

Icons:

- `base-own.png`: current user's base.
- `base-other.png`: other member base.
- `base-guild.png`: guild access base.

Enemy markers should not be available on Hagga Basin.

## Deep Desert

Purpose:

- Friendly temporary bases.
- Enemy base/stronghold targets.
- Weekly Deep Desert resources.

Deep Desert resets weekly around Tuesday morning Central time. The map should show a reset timestamp in the top bar.

Deep Desert marker behavior:

- Location type is first choice.
- Default type is My Base.
- My Base options include Character Name, PvP checkbox, Guild Base checkbox.
- Enemy Base option only needs Place Marker behavior.
- Enemy hover should show:

```text
Enemy Base
<sector>
```

Deep Desert grid:

- 9x9 grid.
- Rows bottom-to-top: A through I.
- Columns left-to-right: 1 through 9.
- Sector labels centered in each square.

## Deep Desert Resources

Resource overlays come from Method's Deep Desert companion data and are stored in:

```text
deep-spice-fields.json
```

Supported overlay/resource types:

- Large Spice Field
- Titanium
- Stravidium
- Testing Station
- Loot Cave

Resource images:

- `spice-field.png`
- `titanium-field.png`
- `stravidium-field.png`
- `testing-station.png`
- `cave-field.png`

Resource legend:

- Lives in the lower-left of the map.
- Has checkboxes for each resource type.
- Has an unlabeled select/deselect-all checkbox aligned with the Resources title row.
- All resources should be checked on initial load.
- Resource hover should match marker hover style:

```text
<Resource Name>
<sector>
```

Resource labels should not be numbered. Use generic names like `Titanium`, not `Titanium 1`.

## GitHub Action

Workflow:

```text
.github/workflows/deep-desert-weekly.yml
```

Tools:

```text
tools/reset_deep_desert_supabase.py
tools/sync_method_spice_fields.py
```

The workflow should:

- Check for Deep Desert map changes.
- Reset Supabase Deep Desert markers if the map changed.
- Sync Method overlays for spice/titanium/stravidium/testing stations/loot caves.
- Commit updated `deep-spice-fields.json` if it changed.

GitHub secrets required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Bot Integration

Related Discord bot repo:

```text
C:\Users\stanb\Documents\Codex\2026-05-23\i-d-like-to-create-a
```

The bot watches Supabase enemy markers and posts alerts in Discord.

The map repo includes screenshot support for bot images:

```text
sector-shot.html
```

Bot screenshot behavior:

- Weekly Deep Desert map image should be generated from the actual rendered map page.
- Bot map screenshot should hide UI overlays like tabs, zoom control, and resource legend.
- The screenshot may include enemy X markers during tests, but weekly reset map posting normally should not have enemy bases present.

## Styling Notes

Design direction:

- Dark Dune-themed UI.
- Gold/tan accents.
- Tight operational layout.
- Avoid large marketing/landing page treatment.

Marker hover:

- Base, enemy, and resource hover tooltips should be visually consistent.
- Marker cursors should use grab/open-hand style consistently, not pointing finger.

Right sidebar:

- Friendly bases and enemy bases are separated on Deep Desert.
- Enemy base helper text saying "Enemy marker can be removed by anyone" should not appear.
- Detail text below tile names should be bold but same size.

## Current Important User Preferences

- The user wants concise step-by-step guidance.
- When making commits, always provide Summary and Description.
- Always state the app version to verify after publish.
- Prefer GitHub Desktop commit flow unless told otherwise.
- Do not reorganize repo folders right now; leave file layout as-is because it works.
