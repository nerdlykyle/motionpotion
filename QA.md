# Painterly revision 2 — September 22, 2026

Contact form revision — September 23, 2026: Name, email and message have visible labels and native required validation. Desktop and 390px mobile layouts were reviewed in the browser; the mobile page has no horizontal overflow. The Say hi link targets the form while preserving the portrait nod. JavaScript syntax and the GitHub Pages build pass. No live message was sent during testing. FormSubmit inbox delivery requires the first-submission email confirmation by Kyle.

Spam and button revision — September 23, 2026: The Say hello button uses the section yellow with a black pressed-button shadow. The `_honey` field is visually offscreen, excluded from keyboard and accessibility navigation, and checked by FormSubmit. The `_captcha=false` override was removed so FormSubmit's default challenge and filtering can run through the native form submission. A return URL brings successful submissions back to the site. No live message was sent during testing.

Quiff motion: the current web model has 17,806 vertices with nonzero hair influence (8,283 above half weight). The lowest affected vertex is above y=.395, with zero overlap with eye weights. Numerical turn/reversal tests at 20, 30, 60, and 144 fps remain within the angle limits and settle to rest. Browser head reversal reached .0843 radians of quiff motion and returned to zero; face and hairline visually checked, greeting focus retained, and no console warnings or errors observed. No Blender rebuild or source model edits.

User preference revision: restored the exact previous lighter live painterly shader from the backup taken before the stronger treatment. The eye bypass remains removed. The official Blender comparison, source model, and pointer-following behavior are unchanged.

Eye revision: removed the eye-restoration mask in the Blender compositor and the eye bypass in the browser shader. Both eyes now receive the same foreground paint treatment as the face. Portrait and close-up renders regenerated; original mesh and UV comparison rerun.

- Authoring model starts from the original `kp_prism_model.glb`. Mesh and UV hashes match a fresh import: 998,710 vertices, 1,941,182 faces. No mesh edits or rig added.
- Official Blender 5.2 Paint Filter was downloaded from Blender's asset repository and verified by SHA256. The packed Blender file renders the actual compositor effect, with tracked strokes and a restrained silhouette layer. The previous eye-restoration AOV mask has been removed.
- Browser loads the optimized original model (7,659,632 bytes) and uses a separate live WebGL adaptation. It is not a pixel-identical export of the Blender compositor.
- Head yaw changed from -0.074 to +0.073; eye yaw changed from -0.051 to +0.050. The original fused eye regions use runtime preview bones; source geometry is unchanged.
- Render targets follow canvas dimensions. Position uses full-float nearest sampling; color samples use explicit LOD to avoid undefined derivatives in shader branches. Empty pixels skip the expensive paint filter.
- Original and revised Blender renders are available in the local before/after comparison, including a small display-size view.

## Previous revision checks

- Full Blender model: exact geometry, UV and transform hashes match the cleaned source. Ten mesh objects remain, including both independent eyes and seven repaired buttons. No rig was added.
- Painterly GLB reimported in Blender and rendered successfully. No invalid vertex coordinates were found. The color, roughness and tangent-space normal maps are baked at 4096px; the editable procedural material is retained in the packed Blender file.
- Website model: 203,104 triangles, 7,364,392 bytes, 2048px textures. Staging preview loads the painterly model and matching fallback portrait with no console warnings or errors. Head and eyes respond to pointer input, and the greeting button remains functional.
- Static build completed with the new relative asset paths. Previous source and cleaned models remain untouched.

## Previous interface checks

Checked in the Codex Chromium browser:

- The optimized cleaned GLB loads successfully, including separate eyes and buttons. No console warnings or errors during the portrait checks.
- Moving the pointer across the portrait changes both head and eye poses. Observed head yaw changed from -0.103 to 0.087 radians; eye yaw changed from -0.070 to 0.059 radians.
- “Say hi” gives a head nod. The pause control, pointer hint, greeting caption, dimension caption, yellow portrait asterisk, and coral portrait shape have been removed. System reduced-motion handling remains.
- Buttons retain their raised default and pressed hover styling. Only the four rotating arrows on the project cards remain; text-link and text-button arrows have been removed.
- Desktop two-column layout checked at 1280 × 900. Portrait checked in the default narrow browser and at 320px width. No horizontal overflow at either tested breakpoint. Hair extends above the lavender shape; lower torso is masked to its bottom edge.
- Matching cleaned portrait replaces the old pixel-art About image.
- JavaScript syntax checks and static build completed. Public build contains the 7.1 MB web GLB and excludes the source-model directory.

Reduced-motion and real touch-device behavior are implemented but were not independently exercised through OS/device settings. This remains a local preview; no production deployment or DNS changes were made.
