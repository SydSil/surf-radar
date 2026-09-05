# Motion references for Surf Radar

## Sources worth keeping

- Emil Kowalski — Skills for Design Engineers: https://github.com/emilkowalski/skills
  - Strongest fit for Surf Radar. Motion must have a named purpose: feedback, spatial continuity, state indication or removal of a jarring change.
  - Particularly useful references: `find-animation-opportunities`, `animate`, `review-animations` and `emil-design-eng`.
- Motion Primitives by Ibelick: https://github.com/ibelick/motion-primitives
  - Good visual reference for drawers, popovers and state transitions. The project is React-based, so Surf Radar should borrow the interaction principles rather than add the library.
- Motion Design Skill by LottieFiles: https://github.com/LottieFiles/motion-design-skill
  - Useful timing, easing, choreography and reduced-motion checklists.
- Motion UI Design resources: https://github.com/fliptheweb/motion-ui-design
  - Broad reading list for motion as a usability tool rather than decoration.

## Recommended future motion pass

1. Bottom sheet: enter from its physical origin in 220–260 ms; exit slightly faster. Keep it interruptible.
2. Help popover: short origin-aware entrance from the `?` trigger. This is already introduced at 160 ms.
3. Buttons: subtle press feedback only; no hover choreography on touch-first controls.
4. Carousel: keep native swipe and scroll snap. Do not add arrows, counters, autoplay or decorative bounce.
5. Map markers: preserve instant map interaction; only animate selected-state feedback if it improves identification.
6. Use only opacity and transform for motion, and always preserve `prefers-reduced-motion`.

The target is a calm, responsive utility. Motion should make state changes easier to understand, never make forecast data slower to read.
