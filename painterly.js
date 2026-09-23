import * as THREE from 'three';

// Browser adaptation of the tutorial's render-space workflow: paint the lit
// character including the eyes, anchor strokes to object position, soften edges.
// The Blender file retains the actual official compositor asset separately.
export function createPainterlyPass(renderer, scene, camera) {
  const color = new THREE.WebGLRenderTarget(1, 1, {type:THREE.HalfFloatType, depthBuffer:true});
  const position = new THREE.WebGLRenderTarget(1, 1, {type:THREE.FloatType, depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  const positionMaterial = new THREE.ShaderMaterial({
    vertexShader:`
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vRest;
      void main(){
        vRest=position;
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
      }`,
    fragmentShader:`
      precision highp float;
      varying vec3 vRest;
      void main(){
        gl_FragColor=vec4(vRest*.75+.5,1.);
      }`,
    toneMapped:false
  });
  const uniforms={tColor:{value:color.texture},tPosition:{value:position.texture},resolution:{value:new THREE.Vector2(1,1)},exposure:{value:renderer.toneMappingExposure}};
  const material = new THREE.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,transparent:true,premultipliedAlpha:true,toneMapped:false,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`
      precision highp float;
      uniform sampler2D tColor,tPosition;
      uniform vec2 resolution;
      uniform float exposure;
      varying vec2 vUv;
      vec3 hash3(vec3 p){return fract(sin(vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))))*43758.5453);}
      vec3 displayColor(vec3 c){
        const mat3 inputMat=mat3(.59719,.076,.0284,.35458,.90834,.13383,.04823,.01566,.83777);
        const mat3 outputMat=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
        c=inputMat*(c*exposure/.6);
        c=(c*(c+.0245786)-.000090537)/(c*(.983729*c+.432951)+.238081);
        c=clamp(outputMat*c,0.,1.);
        return mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
      }
      vec4 samplePaint(vec2 uv){vec4 c=textureLod(tColor,uv,0.);return vec4(displayColor(c.rgb),c.a);}
      float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
      void main(){
        vec2 px=1./resolution;
        vec4 raw=samplePaint(vUv);
        vec4 pos=textureLod(tPosition,vUv,0.);
        vec3 rest=(pos.xyz-.5)/.75;
        vec3 dx=dFdx(rest),dy=dFdy(rest);
        if(raw.a<.001){
          vec4 edge=vec4(0.);
          for(int k=0;k<8;k++){
            float a=float(k)*.785398;
            vec4 c=samplePaint(vUv+vec2(cos(a),sin(a))*px*1.35);
            if(c.a>edge.a)edge=c;
          }
          float alpha=edge.a*.23;
          gl_FragColor=vec4(edge.rgb*alpha,alpha);return;
        }
        // World-position seeded brush cells stay on the moving head.
        vec3 freq=vec3(155.,195.,145.);
        vec3 cell=floor(rest*freq),local=fract(rest*freq);
        float nearest=1e8,second=1e8;vec3 delta=vec3(0.),seed=vec3(0.);
        for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec3 offset=vec3(float(x),float(y),float(z));
          vec3 h=hash3(cell+offset),r=offset+.18+.64*h-local;
          float d=dot(r,r);
          if(d<nearest){second=nearest;nearest=d;delta=r/freq;seed=h;}
          else second=min(second,d);
        }
        vec2 anchor=clamp(vec2(dot(delta,dx)/max(dot(dx,dx),.00000001),dot(delta,dy)/max(dot(dy,dy),.00000001)),vec2(-5.),vec2(5.));
        vec2 at=vUv+anchor*px*.38;
        if(textureLod(tColor,at,0.).a<.85)at=vUv;
        float gx=lum(samplePaint(vUv+vec2(px.x,0.)).rgb)-lum(samplePaint(vUv-vec2(px.x,0.)).rgb);
        float gy=lum(samplePaint(vUv+vec2(0.,px.y)).rgb)-lum(samplePaint(vUv-vec2(0.,px.y)).rgb);
        vec2 tangent=normalize(vec2(-gy,gx)+vec2(.0001));
        vec2 across=vec2(tangent.y,-tangent.x);
        float radius=1.8+seed.y*1.4;
        vec3 m0=vec3(0.),m1=vec3(0.),m2=vec3(0.),m3=vec3(0.);
        vec3 s0=vec3(0.),s1=vec3(0.),s2=vec3(0.),s3=vec3(0.);
        float n0=0.,n1=0.,n2=0.,n3=0.;
        for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){
          vec2 d=(tangent*float(i)*.75+across*float(j)*.5)*radius*px;
          vec4 c=samplePaint(at+d);
          float w=step(.8,c.a);
          if(i<=0&&j<=0){m0+=c.rgb*w;s0+=c.rgb*c.rgb*w;n0+=w;}
          if(i>=0&&j<=0){m1+=c.rgb*w;s1+=c.rgb*c.rgb*w;n1+=w;}
          if(i<=0&&j>=0){m2+=c.rgb*w;s2+=c.rgb*c.rgb*w;n2+=w;}
          if(i>=0&&j>=0){m3+=c.rgb*w;s3+=c.rgb*c.rgb*w;n3+=w;}
        }
        m0/=max(n0,1.);m1/=max(n1,1.);m2/=max(n2,1.);m3/=max(n3,1.);
        vec4 variance=vec4(length(abs(s0/max(n0,1.)-m0*m0)),length(abs(s1/max(n1,1.)-m1*m1)),length(abs(s2/max(n2,1.)-m2*m2)),length(abs(s3/max(n3,1.)-m3*m3)));
        variance+=vec4(n0<2.?100.:0.,n1<2.?100.:0.,n2<2.?100.:0.,n3<2.?100.:0.);
        float best=variance.x;vec3 paint=m0;
        if(variance.y<best){paint=m1;best=variance.y;}
        if(variance.z<best){paint=m2;best=variance.z;}
        if(variance.w<best){paint=m3;}
        paint=mix(paint,raw.rgb,.22);
        // Low accidental color and pooling, as in the tutorial.
        paint*=1.+(seed-.5)*.045;
        float bristles=sin(dot(rest,vec3(2730.,315.,940.))+seed.z*18.);
        paint*=1.+bristles*.012;
        float nose=1.-smoothstep(.5,1.6,pow(rest.x/.021,2.)+pow((rest.y-.268)/.019,2.));
        float mouth=1.-smoothstep(.5,1.5,pow(rest.x/.035,2.)+pow((rest.y-.235)/.009,2.));
        paint=mix(paint,raw.rgb,max(nose*.58,mouth*.72)*smoothstep(.075,.095,rest.z));
        // A restrained painted silhouette, isolated from the page background.
        float alpha=raw.a;
        if(alpha<.98){
          vec4 closest=raw;
          for(int k=0;k<8;k++){
            float a=float(k)*.785398;
            vec4 c=samplePaint(vUv+vec2(cos(a),sin(a))*px*1.35);
            if(c.a>closest.a)closest=c;
          }
          paint=mix(closest.rgb,paint,step(.8,raw.a));
          alpha=max(alpha,closest.a*.23);
        }
        gl_FragColor=vec4(paint*alpha,alpha);
      }`
  });
  const postScene=new THREE.Scene();
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);postScene.add(quad);
  const postCamera=new THREE.Camera();
  return {
    resize(width,height){
      // CSS-pixel scale keeps the strokes visible on high-DPI displays too.
      color.setSize(Math.max(1,Math.round(width)),Math.max(1,Math.round(height)));
      position.setSize(color.width,color.height);uniforms.resolution.value.set(color.width,color.height);
    },
    render(){
      const override=scene.overrideMaterial;
      renderer.setRenderTarget(color);renderer.clear();renderer.render(scene,camera);
      scene.overrideMaterial=positionMaterial;
      renderer.setRenderTarget(position);renderer.clear();renderer.render(scene,camera);
      scene.overrideMaterial=override;
      renderer.setRenderTarget(null);renderer.clear();renderer.render(postScene,postCamera);
    },
    dispose(){color.dispose();position.dispose();positionMaterial.dispose();material.dispose();quad.geometry.dispose();}
  };
}
