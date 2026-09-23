import { mkdir, cp, copyFile, readdir } from 'node:fs/promises';
const root = new URL('.',import.meta.url);
const dist = new URL('dist/',root);
await mkdir(dist,{recursive:true});
for(const file of ['index.html','styles.css','app.js','character.js','painterly.js','quiff.js','contact-potion.js','.nojekyll'])await copyFile(new URL(file,root),new URL(file,dist));
await cp(new URL('vendor/',root),new URL('vendor/',dist),{recursive:true});
await mkdir(new URL('assets/models/',dist),{recursive:true});
// Authoring GLBs, Blender files and cleanup references are intentionally outside
// the public asset list. Only the lightweight portrait is deployed.
for(const entry of await readdir(new URL('assets/',root),{withFileTypes:true})) {
  if(entry.isFile() && /\.(?:png|jpe?g|webp|mp4|svg|woff2|txt)$/i.test(entry.name))
    await copyFile(new URL(`assets/${entry.name}`,root),new URL(`assets/${entry.name}`,dist));
}
await copyFile(new URL('assets/models/kyle-original-web.glb',root),new URL('assets/models/kyle-original-web.glb',dist));
await copyFile(new URL('assets/models/potion-form.glb',root),new URL('assets/models/potion-form.glb',dist));
await cp(new URL('assets/videos/',root),new URL('assets/videos/',dist),{recursive:true});
console.log('GitHub Pages site built in dist/');
