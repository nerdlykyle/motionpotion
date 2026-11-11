Residential Ducted Lossnay® interactive: product demo build

Upload this whole folder to your site as is (for example /work/lossnay/). It uses relative paths
and makes no outside requests. Open index.html directly, or embed it:

<iframe src="/work/lossnay/index.html" title="Residential Ducted Lossnay interactive demo"
        loading="lazy" allow="fullscreen"
        style="display:block;width:100%;aspect-ratio:16/9;border:0"></iframe>

Server MIME types (most hosts already have these): .glb = model/gltf-binary, .woff2 = font/woff2.
It won't run from a double-clicked file (file://). It needs to be served, even locally:
  python3 -m http.server 8080   then open http://localhost:8080

Differences from the client build: DM Sans (SIL Open Font License, see fonts-license/) replaces
the licensed Styrene A, and a "Product demo" tag sits in the header.

Client work for Mitsubishi Electric, shown with permission.
