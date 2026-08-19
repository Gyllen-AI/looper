Things that move.

- **Motion carries meaning or it is noise.** Movement that does not tell the eye
  where something came from or where it went is decoration paid for in frames.
- **Animate what the compositor can animate.** Transform and opacity are cheap;
  anything that changes layout costs a reflow every frame and is the most
  expensive animation shape there is.
- **Interpolate between samples rather than snapping**, and take the glide length
  from the gap between them, so a slow feed looks slow rather than broken.
- **Honour the request to stop.** A reduced-motion preference is an instruction,
  not a hint.
- **A frame budget is a number on a named machine.** Smooth is not a measurement.
