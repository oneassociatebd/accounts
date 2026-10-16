Update the payment receipt seal/stamp dimensions in `src/lib/memo-pdf.ts` to match the requested smaller, uniform size.

Changes:
- `.stamp` CSS: reduce width from `46mm` to `40mm`; keep height `23mm`.
- `buildStampSvg`:
  - Set SVG `viewBox="0 0 188 108"` to match the new 40mm × 23mm aspect ratio.
  - Scale the rotated outer/inner rectangles and rotation center to the new viewBox.
  - Set outer border `stroke-width="2.5"` and inner border `stroke-width="1"`.
  - Set the PAID/DUE/ADVANCE title font size uniformly to `30`.
  - Adjust `titleY` vertical centering for the uniform font size (with/without amount).
- Keep amount text font size at 18 and colors unchanged.

This affects web view, JPG export, and WhatsApp clipboard copy only; the PDF jsPDF seal overlay is out of scope for this change unless requested.