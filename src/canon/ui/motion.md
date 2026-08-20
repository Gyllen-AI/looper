Things that move.

- **Motion carries meaning or it is noise.**
- **Animate what the compositor can animate.** Transform and opacity are cheap;
  anything that changes layout costs a reflow every frame.
- **Interpolate between samples rather than snapping**, with the glide taken
  from the gap between them, so a slow feed looks slow rather than broken.
- **Honour the request to stop.** A reduced-motion preference is an instruction.
- **A frame budget is a number on a named machine.**
