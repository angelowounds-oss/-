# V8 Motion Lab — Product Lock v1.0

## 1. Product Definition

**V8 Motion Lab** is a single-file, mobile-first interactive experience that presents a modern high-performance cutaway V8 engine with a premium visual style, swipe-based viewing, and RPM-driven motion.

### Non-negotiable constraints
- Final deliverable must remain **one HTML file**.
- Must run in modern **mobile browsers**.
- Quality is prioritized over implementation speed.
- The engine must feel like a **real modern performance V8**, not a schematic toy model.

---

## 2. Target Experience

When the page opens:
1. The engine is already alive at idle.
2. The user immediately sees a premium, studio-lit V8 object.
3. Swipe interaction lets the user explore the engine in 3D.
4. The RPM slider changes revs smoothly and visibly.
5. Internal motion and exterior shape both remain readable.

---

## 3. v1 Scope Lock

### Must ship in v1
- Single-file HTML deliverable
- Mobile-first layout
- Touch/swipe orbit interaction
- RPM slider with readout
- Auto-start idle animation
- Cutaway engine presentation
- Visible piston / rod / crank motion
- Premium dark studio presentation

### Must not block v1
- Audio
- Labels for every part
- Internal/external mode toggle
- Full valve train animation
- Detailed combustion simulation
- AR mode

---

## 4. Visual Quality Gates

The build is **not acceptable** if any of the following are true:
- The engine looks like abstract geometry rather than a believable modern V8.
- The internal motion reads like generic up/down repetition rather than coordinated engine mechanics.
- The camera starts from a weak or confusing angle.
- The UI covers too much of the engine on a mobile viewport.
- RPM changes do not clearly alter the energy of the scene.

The build is **acceptable** only when all of the following are true:
- The silhouette clearly reads as a modern performance V8.
- The cutaway feels intentional, not accidental.
- At idle, the engine already feels alive.
- At high RPM, the scene has noticeably more energy.
- Touch orbit works naturally on a phone-sized viewport.

---

## 5. Motion Quality Gates

### Required
- Smooth RPM interpolation
- Coordinated piston/rod/crank relationship
- Stable animation loop on resize and repeated interaction
- Small but noticeable vibration increase at higher RPM

### Not required for v1
- Thermodynamic correctness
- Fuel/air flow simulation
- Accurate valve timing simulation
- Exhaust pulse modeling

---

## 6. Mobile UX Gates

### Required
- Comfortable thumb-sized slider control
- Readable RPM display on narrow viewports
- No accidental page scrolling during interaction
- Orbit interaction works one-handed
- Scene remains legible in portrait orientation

### Optional post-v1
- Pinch zoom
- Haptic hooks
- Gesture hints overlay

---

## 7. Implementation Strategy Lock

### Core principle
Development can be iterative, but the final output remains a **single HTML file**.

### Allowed
- Inline CSS
- Inline JavaScript
- Procedural geometry
- Software-rendered or WebGL-rendered internals, provided final output remains single-file

### Not allowed
- Multi-file runtime dependency at ship time
- Required CDN fetches for normal use
- Server dependency just to run the demo locally

---

## 8. Current v1 Focus Areas

1. Improve silhouette readability.
2. Improve cutaway intent.
3. Increase material richness.
4. Strengthen low-RPM vs high-RPM contrast.
5. Keep motion smooth on mobile.
6. Preserve single-file simplicity.

---

## 9. Review Checklist

Before considering the interactive “ready enough” for the next quality pass:

- [ ] Single HTML still opens directly in browser
- [ ] Mobile portrait layout is readable
- [ ] RPM slider is easy to drag
- [ ] Swipe orbit feels natural
- [ ] Engine starts already moving
- [ ] Exterior shape reads clearly as a performance V8
- [ ] Internal mechanism is visible from the default camera angle
- [ ] High RPM meaningfully changes visual energy
- [ ] No major visual collapse on resize

---

## 10. Next Improvement Track

### Phase A
- Refine silhouette and shell sculpting
- Improve cutaway readability
- Strengthen metallic shading balance

### Phase B
- Add more premium presentation cues
- Improve depth layering and contrast
- Tune high-RPM visual character

### Phase C
- Final packaging polish
- Final mobile QA pass
- Optional screenshot/demo capture
