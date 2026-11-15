/* Engine — runs a TouchDesigner TOP network (as extracted by TOE.parse) on WebGL2, per frame. */
const VS = `#version 300 es
in vec2 aPos; out vec2 vUV; void main(){ vUV=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;
const NOISE = `
float h13(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
vec3 g3(vec3 p){ float a=h13(p)*6.2831853, z=h13(p+17.17)*2.-1., r=sqrt(max(0.,1.-z*z)); return vec3(r*cos(a),r*sin(a),z); }
float gn(vec3 p){ vec3 i=floor(p), f=fract(p), u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(g3(i),f), b=dot(g3(i+vec3(1,0,0)),f-vec3(1,0,0)), c=dot(g3(i+vec3(0,1,0)),f-vec3(0,1,0)), d=dot(g3(i+vec3(1,1,0)),f-vec3(1,1,0));
  float e=dot(g3(i+vec3(0,0,1)),f-vec3(0,0,1)), g=dot(g3(i+vec3(1,0,1)),f-vec3(1,0,1)), h=dot(g3(i+vec3(0,1,1)),f-vec3(0,1,1)), k=dot(g3(i+vec3(1,1,1)),f-vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(mix(e,g,u.x),mix(h,k,u.x),u.y),u.z)*1.6; }
float lum(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int;
in vec2 vUV; out vec4 o;
uniform sampler2D A,B,C,D; uniform vec2 uRes; uniform float uTime;` + NOISE;
const FS = {
  copy: `void main(){ o=texture(A,vUV); }`,
  src: `uniform vec2 uScale; uniform float uMirror; void main(){ vec2 uv=(vUV-.5)*uScale+.5; if(uMirror>.5) uv.x=1.-uv.x; o=vec4(texture(A,uv).rgb,1.); }`,
  present: `void main(){ o=vec4(clamp(texture(A,vUV).rgb,0.,1.),1.); }`,
  level: `uniform float uClampIn,uInvert,uBlack,uB1,uG1,uCon,uInLo,uInHi,uOutLo,uOutHi,uOpacity,uB2,uG2,uClamp,uCLo,uCHi;
void main(){ vec4 c=texture(A,vUV); vec3 x=c.rgb; if(uClampIn>.5) x=clamp(x,0.,1.);
  x=mix(x,1.-x,uInvert); x=max(x-uBlack,0.)/max(1.-uBlack,1e-4); x*=uB1; x=pow(max(x,0.),vec3(1./max(uG1,1e-3))); x=(x-.5)*uCon+.5;
  x=(x-uInLo)/max(uInHi-uInLo,1e-4)*(uOutHi-uOutLo)+uOutLo; x*=uB2; x=pow(max(x,0.),vec3(1./max(uG2,1e-3)));
  if(uClamp>.5) x=clamp(x,uCLo,uCHi); o=vec4(x,c.a)*uOpacity; }`,
  comp: `uniform int uOp,uN; uniform float uSwap;
vec4 op(vec4 a,vec4 b){ if(uSwap>.5){ vec4 t=a;a=b;b=t; } float al=max(a.a,b.a);
  if(uOp==0) return a*b; if(uOp==1) return a+b; if(uOp==2) return a+b*(1.-a.a); if(uOp==3) return max(a,b); if(uOp==4) return min(a,b);
  if(uOp==5) return (a+b)*.5; if(uOp==6) return vec4(1.-abs(1.-a.rgb-b.rgb),al);
  if(uOp==7) return vec4(1.-min(vec3(1.),(1.-b.rgb)/max(a.rgb,1e-4)),al);
  if(uOp==8) return 1.-(1.-a)*(1.-b); if(uOp==9) return vec4(abs(a.rgb-b.rgb),al); if(uOp==10) return vec4(a.rgb-b.rgb,al);
  if(uOp==11) return b+a*(1.-b.a); if(uOp==12) return a*b.a; if(uOp==13) return vec4(min(vec3(1.),b.rgb/max(1.-a.rgb,1e-4)),al);
  if(uOp==14) return lum(a.rgb)<=lum(b.rgb)?a:b; if(uOp==15) return lum(a.rgb)>=lum(b.rgb)?a:b;
  if(uOp==16){ vec3 c=a.rgb+(lum(b.rgb)-lum(a.rgb)); float l=lum(c), n=min(c.r,min(c.g,c.b)), x=max(c.r,max(c.g,c.b)); if(n<0.) c=l+(c-l)*l/max(l-n,1e-4); if(x>1.) c=l+(c-l)*(1.-l)/max(x-l,1e-4); return vec4(c,al); }
  if(uOp==17){ vec3 s=a.rgb, d=b.rgb, g=mix(sqrt(d),((16.*d-12.)*d+4.)*d,step(d,vec3(.25))); return vec4(mix(d-(1.-2.*s)*d*(1.-d),d+(2.*s-1.)*(g-d),step(vec3(.5),s)),al); }
  if(uOp==18) return vec4(mix(2.*a.rgb*b.rgb,1.-2.*(1.-a.rgb)*(1.-b.rgb),step(vec3(.5),b.rgb)),al);
  return a+b*(1.-a.a); }
void main(){ vec4 c=texture(A,vUV); if(uN>1) c=op(c,texture(B,vUV)); if(uN>2) c=op(c,texture(C,vUV)); if(uN>3) c=op(c,texture(D,vUV)); o=c; }`,
  noise: `uniform int uType,uHarm; uniform float uSeed,uPeriod,uSpread,uGain,uExp,uAmp,uOffset,uMono,uHasIn,uAspect; uniform vec3 uT;
float fbm(vec3 p){ float a=1.,s=0.; for(int i=0;i<8;i++){ if(i>uHarm) break; s+=a*gn(p); p=p*uSpread+7.3; a*=uGain; } return s; }
float sh(float n){ return uExp<=0.?n:sign(n)*pow(abs(n),uExp); }
void main(){ vec3 n; vec2 q=(vUV-.5)*vec2(uAspect,1.);
  if(uType==1||uPeriod<=0.){ vec3 pp=vec3(floor(vUV*uRes),mod(uSeed,289.)); n=vec3(h13(pp),h13(pp+31.7),h13(pp+71.3)); if(uType!=1){ n=n*2.-1.; n=vec3(sh(n.x),sh(n.y),sh(n.z)); } }
  else { vec3 p=vec3(q/uPeriod*1.5,0.)+uT+mod(uSeed,289.)*.137; n=vec3(sh(fbm(p)),sh(fbm(p+19.19)),sh(fbm(p+47.47))); }
  if(uMono>.5) n=n.xxx; vec3 v=uOffset+uAmp*n; vec4 c=texture(A,vUV); o=uHasIn>.5?vec4(c.rgb+v,c.a):vec4(v,1.); }`,
  blur: `uniform vec2 uDir; void main(){ vec4 s=vec4(0.); float ws=0.; for(int i=-8;i<=8;i++){ float w=exp(-float(i*i)/18.); s+=texture(A,vUV+uDir*float(i))*w; ws+=w; } o=s/ws; }`,
  edge: `uniform float uStrength,uBlack,uComp,uOff,uSel; uniform vec3 uCol; float L(vec2 d){ vec3 c=texture(A,vUV+d/uRes).rgb; return uSel>.5?max(c.r,max(c.g,c.b)):lum(c); }
void main(){ float gx=L(vec2(uOff,0.))-L(vec2(-uOff,0.)), gy=L(vec2(0.,uOff))-L(vec2(0.,-uOff)); float e=length(vec2(gx,gy))*uStrength*2.;
  e=clamp((e-uBlack)/max(1.-uBlack,1e-4),0.,1.); vec4 c=texture(A,vUV); vec4 k=vec4(uCol*e,e); o=uComp>.5?k+c*(1.-e):k; }`,
  thresh: `uniform float uTh,uSoft,uCmp,uMax,uA1; void main(){ vec4 c4=texture(A,vUV); vec3 c=c4.rgb;
  float v=uMax>6.5?max(c.r,max(c.g,c.b)):uMax>5.5?(c.r+c.g+c.b+c4.a)/4.:uMax>4.5?(c.r+c.g+c.b)/3.:uMax>3.5?c4.a:uMax>2.5?c.b:uMax>1.5?c.g:uMax>.5?c.r:lum(c), m;
  if(uCmp<.5) m=M_(v); else if(uCmp<1.5) m=1.-m_(v); else if(uCmp<2.5) m=1.-clamp(abs(v-uTh)/max(uSoft,.02),0.,1.); else m=clamp(abs(v-uTh)/max(uSoft,.02),0.,1.);
  o=vec4(m,m,m,uA1>.5?1.:m); }`.replace('M_(v)', '(uSoft>1e-5?smoothstep(uTh-uSoft*.5,uTh+uSoft*.5,v):step(uTh-.002,v))').replace('m_(v)', '(uSoft>1e-5?smoothstep(uTh-uSoft*.5,uTh+uSoft*.5,v):step(uTh-.002,v))'),
  rgbkey: `uniform vec3 uMin,uMax; void main(){ vec4 c=texture(A,vUV); vec3 u=c.a>1e-4?c.rgb/c.a:c.rgb; float k=(all(greaterThanEqual(u,uMin-1e-4))&&all(lessThanEqual(u,uMax+1e-4)))?1.:0.; o=c*k; }`,
  transform: `uniform vec2 uT,uS; uniform float uR,uAsp,uHold; uniform vec4 uBg;
void main(){ vec2 p=vUV-.5-uT; p.x*=uAsp; float c=cos(-uR),s=sin(-uR); p=mat2(c,-s,s,c)*p; p.x/=uAsp; p/=uS; vec2 uv=p+.5;
  if(uHold>1.5) uv=fract(uv); vec4 t=texture(A,clamp(uv,0.,1.)); if(uHold<.5&&(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)) t=vec4(0.); o=t+uBg*(1.-t.a); }`,
  flip: `uniform float uFx,uFy; void main(){ vec2 uv=vUV; if(uFx>.5) uv.x=1.-uv.x; if(uFy>.5) uv.y=1.-uv.y; o=texture(A,uv); }`,
  func: `uniform int uOp; uniform float uBase,uExpv,uR1,uR2; void main(){ vec4 c=texture(A,vUV); vec3 x=c.rgb*uR2+uR1;
  if(uOp==0) x=pow(max(x,0.),vec3(uExpv)); else if(uOp==1) x=pow(vec3(uBase),x); else if(uOp==2) x=sqrt(max(x,0.)); else if(uOp==3) x=abs(x);
  else if(uOp==4) x=sin(x*6.2831853); else if(uOp==5) x=cos(x*6.2831853); else if(uOp==6) x=exp(x); o=vec4(x,c.a); }`,
  mix: `uniform float uMix; void main(){ o=mix(texture(A,vUV),texture(B,vUV),uMix); }`,
  constant: `uniform vec4 uCol; uniform float uHasIn; void main(){ o=uHasIn>.5?uCol+texture(A,vUV)*(1.-uCol.a):uCol; }`,
  circle: `uniform float uRad,uSoft,uAsp; void main(){ vec2 p=(vUV-.5)*vec2(uAsp,1.); float r=uRad*uAsp, d=length(p); float e=1.-smoothstep(r*(1.-uSoft)-1e-4,r+1e-4,d); o=vec4(e); }`,
  ramp: `void main(){ o=vec4(vec3(vUV.x),1.); }`,
  /* Ramp TOP with colour keys (A = 256x1 key texture) */
  rampk: `uniform float uType,uPhase,uPeriod,uAsp; void main(){ vec2 q=vUV-.5; float t=uType<.5?vUV.x:uType<1.5?vUV.y:uType<2.5?length(q*vec2(uAsp,1.))*2.:fract(atan(q.y,q.x)/6.2831853+.5);
  t=(t-uPhase)/max(uPeriod,1e-4); o=texture(A,vec2(clamp(t,0.,1.),.5)); }`,
  /* Luma Level TOP: InColor * Lookup(Source) / Source — the level curve is applied to the luminance, hue and saturation are kept */
  lumalevel: `uniform float uInvert,uBlack,uB1,uG1,uCon,uInLo,uInHi,uOutLo,uOutHi,uOpacity,uB2,uG2; uniform int uSrc;
float cv(float x){ x=mix(x,1.-x,uInvert); x=max(x-uBlack,0.)/max(1.-uBlack,1e-4); x*=uB1; x=pow(max(x,0.),1./max(uG1,1e-3)); x=(x-.5)*uCon+.5;
  x=(x-uInLo)/max(uInHi-uInLo,1e-4)*(uOutHi-uOutLo)+uOutLo; x*=uB2; return pow(max(x,0.),1./max(uG2,1e-3)); }
void main(){ vec4 c=texture(A,vUV); float s=uSrc==1?c.r:uSrc==2?c.g:uSrc==3?c.b:uSrc==4?c.a:uSrc==5?(c.r+c.g+c.b)/3.:uSrc==6?(c.r+c.g+c.b+c.a)/4.:lum(c.rgb);
  float L=cv(s); vec3 x=mix(vec3(L),c.rgb*(L/max(s,1e-4)),smoothstep(0.,.02,s)); o=vec4(x,c.a)*uOpacity; }`,
  /* Lookup TOP: the table is the line Dark UV -> Light UV in the 2nd input; RGBA Independent looks each channel up separately */
  lookup: `uniform vec2 uIdx,uDark,uLight; uniform int uCh; uniform float uIA;
vec4 lk(float v){ float t=clamp((v-uIdx.x)/max(uIdx.y-uIdx.x,1e-5),0.,1.); return texture(B,mix(uDark,uLight,t)); }
void main(){ vec4 c=texture(A,vUV); if(uCh==9){ o=vec4(lk(c.r).r,lk(c.g).g,lk(c.b).b,lk(c.a).a); return; }
  float v=uCh==1?c.r:uCh==2?c.g:uCh==3?c.b:uCh==4?c.a:uCh==5?(c.r+c.g+c.b)/3.:uCh==6?(c.r+c.g+c.b+c.a)/4.:uCh==7?max(c.r,max(c.g,c.b)):uCh==8?max(max(c.r,c.g),max(c.b,c.a)):lum(c.rgb);
  o=lk(v); if(uIA>.5) o.a=lk(c.a).a; }`,
  /* Matte TOP: input 1 over input 2 through one channel of input 3 */
  matte: `uniform int uCh; void main(){ vec4 a=texture(A,vUV), b=texture(B,vUV), k=texture(C,vUV);
  float m=uCh==0?lum(k.rgb):uCh==1?k.r:uCh==2?k.g:uCh==3?k.b:uCh==5?(k.r+k.g+k.b)/3.:uCh==6?(k.r+k.g+k.b+k.a)/4.:k.a; o=mix(b,a,clamp(m,0.,1.)); }`,
  /* palette Pixelate: the image is resized down with nearest sampling and back up */
  pixcell: `uniform vec2 uCell; uniform float uMix; void main(){ vec2 n=max(vec2(1.),floor(uRes/uCell+.5)); o=mix(texture(A,vUV),texture(A,(floor(vUV*n)+.5)/n),uMix); }`,
  reorder: `uniform ivec4 uSrc,uCh; float pick(int i,int ch){ vec4 c=i==0?texture(A,vUV):i==1?texture(B,vUV):i==2?texture(C,vUV):texture(D,vUV);
  if(ch==0) return c.r; if(ch==1) return c.g; if(ch==2) return c.b; if(ch==3) return c.a; if(ch==4) return 0.; if(ch==5) return 1.; return lum(c.rgb); }
void main(){ o=vec4(pick(uSrc.x,uCh.x),pick(uSrc.y,uCh.y),pick(uSrc.z,uCh.z),pick(uSrc.w,uCh.w)); }`,
  displace: `uniform vec2 uW,uMid; uniform ivec2 uSel; uniform float uUV; float ch(vec4 d,int i){ return i==0?d.r:i==1?d.g:i==2?d.b:d.a; }
void main(){ vec4 d=texture(B,vUV); vec2 k=vec2(uSel.x<0?0.:ch(d,uSel.x)-uMid.x, uSel.y<0?0.:ch(d,uSel.y)-uMid.y)*uW; o=texture(A,(vUV-.5)*uUV+.5+k); }`,
  hsv: `uniform float uHue,uSat,uVal; void main(){ vec4 c=texture(A,vUV); float l=lum(c.rgb); vec3 x=mix(vec3(l),c.rgb,uSat)*uVal;
  float a=uHue*6.2831853/360.; vec3 k=vec3(.57735); x=x*cos(a)+cross(k,x)*sin(a)+k*dot(k,x)*(1.-cos(a)); o=vec4(x,c.a); }`,
  mono: `uniform float uAvg,uA0; void main(){ vec4 c=texture(A,vUV); float l=uAvg>.5?(c.r+c.g+c.b)/3.:lum(c.rgb); o=vec4(vec3(l),uA0>.5?0.:c.a); }`,
  slope: `uniform ivec3 uCh; uniform float uStr; float L(vec2 d){ return lum(texture(A,vUV+d/uRes).rgb); }
float pick(int k){ return k==1?.5+(L(vec2(1.,0.))-L(vec2(-1.,0.)))*uStr:k==2?.5+(L(vec2(0.,1.))-L(vec2(0.,-1.)))*uStr:.5; }
void main(){ o=vec4(pick(uCh.x),pick(uCh.y),pick(uCh.z),1.); }`,
  rect: `uniform vec2 uSize; uniform float uSoft,uHasIn; void main(){ vec2 d=abs(vUV-.5)-uSize*.5; float m=1.-smoothstep(-uSoft-1e-4,1e-4,max(d.x,d.y)); o=vec4(m)+(uHasIn>.5?texture(A,vUV):vec4(0.)); }`,
  lens: `uniform vec3 uK; uniform vec2 uPt,uC,uF; uniform float uInv;
void main(){ vec2 p=(vUV-.5-uC)*2./uF; float r2=dot(p,p), rad=1.+uK.x*r2+uK.y*r2*r2+uK.z*r2*r2*r2;
  vec2 tg=vec2(2.*uPt.x*p.x*p.y+uPt.y*(r2+2.*p.x*p.x), uPt.x*(r2+2.*p.y*p.y)+2.*uPt.y*p.x*p.y);
  vec2 q=uInv>.5?(p-tg*.02)/(abs(rad)<.05?.05:rad):p*rad+tg*.02; vec2 uv=q*uF*.5+.5+uC; uv=abs(mod(uv+1.,2.)-1.); o=texture(A,uv); }`,
  tima: `uniform highp sampler2DArray uArr; uniform float uHead,uK,uN,uBlack,uWhite;
void main(){ float l=clamp(lum(texture(A,vUV).rgb),0.,1.), d=clamp(abs(mix(uBlack,uWhite,l)),0.,max(uN-1.,0.)), i0=floor(d), f=d-i0;
  float a=mod(uHead-i0+uK,uK), b=mod(uHead-min(i0+1.,max(uN-1.,0.))+uK,uK); o=mix(texture(uArr,vec3(vUV,a)),texture(uArr,vec3(vUV,b)),f); }`,
  tint: `uniform vec4 uCol; uniform float uHasIn; void main(){ vec4 t=texture(A,vUV)*uCol; o=t+(uHasIn>.5?texture(B,vUV)*(1.-t.a):vec4(0.)); }`,
  tunnel: `uniform float uRad,uMix,uAsp; uniform vec2 uC; void main(){ vec2 p=(vUV*2.-1.)*vec2(uAsp,1.)+uC; float r=length(p); if(r>uRad) p*=uRad/r; p-=uC; p/=vec2(uAsp,1.); o=mix(texture(A,vUV),texture(A,p*.5+.5),uMix); }`,
  radial: `uniform vec2 uCenter; uniform float uStr,uMix; void main(){ vec2 dir=vUV-uCenter; vec4 s=vec4(0.); for(int i=0;i<40;i++) s+=texture(A,vUV-dir*uStr*float(i)/40.); o=mix(texture(A,vUV),s/40.,uMix); }`,
  solar: `uniform float uLT,uLS,uDT,uDS,uMix; void main(){ vec4 c=texture(A,vUV); vec3 inv=1.-c.rgb;
  float t1=smoothstep(uLT-uLS*.5-1e-4,uLT+uLS*.5+1e-4,lum(inv)), t2=smoothstep(uDT-uDS*.5-1e-4,uDT+uDS*.5+1e-4,lum(c.rgb));
  o=vec4(mix(c.rgb,max(c.rgb*t1,inv*t2),uMix),c.a); }`,
  rgbdelay: `uniform float uMix; void main(){ vec4 r=texture(A,vUV),g=texture(B,vUV),b=texture(C,vUV),d=texture(D,vUV); o=mix(d,vec4(r.r,g.g,b.b,max(r.a,max(g.a,b.a))),uMix); }`,
  bright: `uniform float uTh,uGam,uGain; void main(){ vec3 x=max(texture(A,vUV).rgb-uTh,0.)/max(1.-uTh,1e-4); o=vec4(pow(x,vec3(uGam))*uGain,1.); }`,
  avg3: `void main(){ o=(texture(A,vUV)+texture(B,vUV)+texture(C,vUV))/3.; }`,
  addmix: `uniform float uA,uB; uniform vec3 uTint; void main(){ vec4 a=texture(A,vUV); o=vec4(a.rgb*uA+texture(B,vUV).rgb*uB*uTint,a.a); }`,
  trace: `uniform float uTh; void main(){ float l=lum(texture(A,vUV).rgb); float e=1.-smoothstep(0.,1.,abs(l-uTh)/(fwidth(l)*1.5+1e-4)); o=vec4(e); }`,
  paper: `void main(){ vec2 q=vUV*uRes/900.; float n=gn(vec3(q*3.,1.))*.5+gn(vec3(q*42.,3.))*.22+(h13(vec3(floor(vUV*uRes),7.))-.5)*.16;
  float v=.87+n*.13; vec2 d=vUV-.5; v*=1.-dot(d,d)*.55; o=vec4(v*vec3(1.,.97,.91),1.); }`,
  flat: `uniform vec4 uCol; in float vL; void main(){ o=uCol*vL; }`,
};
const VS3 = {
  lines: `#version 300 es
in vec2 aUV; uniform sampler2D A; uniform mat4 uPV; uniform vec2 uSize; uniform float uAmp; out float vL;
void main(){ float d=textureLod(A,aUV,0.).r; gl_Position=uPV*vec4((aUV.x-.5)*uSize.x,(aUV.y-.5)*uSize.y+d*uAmp,0.,1.); vL=1.; }`,
  points: `#version 300 es
precision highp float;
in vec2 aUV; uniform sampler2D A; uniform mat4 uPV; uniform vec2 uSize; uniform float uAmp,uTime,uPt; out float vL;` + NOISE + `
void main(){ float l=clamp(lum(textureLod(A,aUV,0.).rgb),0.,1.); vec2 q=(aUV-.5)*uSize;
  float z=(gn(vec3(q*.55,uTime*.25))+.5*gn(vec3(q*1.3+5.,uTime*.4)))*uAmp; gl_Position=uPV*vec4(q,z,1.); gl_PointSize=l*uPt*5./gl_Position.w; vL=step(.02,l); }`,
  wire: `#version 300 es
precision highp float; precision highp int;
in vec2 aP; uniform mat4 uPV; uniform ivec3 uW; uniform float uTime,uN,uScale; out float vL;
float wave(int t,float x){ float f=fract(x), s=sin(x*6.2831853);
  if(t==0) return 0.; if(t==1) return s; if(t==2) return cos(x*6.2831853); if(t==3) return 1.-abs(f*2.-1.)*2.; if(t==4) return f*2.-1.;
  if(t==5) return s>=0.?1.:-1.; if(t==6) return f<.1?1.:-1.; if(t==7) return exp(-pow((f-.5)*6.,2.))*2.-1.; if(t==8) return abs(s)*2.-1.;
  if(t==9) return 1.-f*2.; if(t==10) return sin(x*12.566371); if(t==11) return s*cos(x*18.849556); return smoothstep(0.,1.,f)*2.-1.; }
void main(){ float i=float(gl_InstanceID)/uN; vec3 c=vec3(wave(uW.x,i+uTime*.2),wave(uW.y,i+uTime*.2),wave(uW.z,i));
  gl_Position=uPV*vec4(c+vec3(aP*uScale,0.),1.); vL=1.; }`,
};
VS3.inst = `#version 300 es
layout(location=0) in vec2 aP; layout(location=1) in vec3 aI; uniform mat4 uPV; uniform float uScale; out float vL;
void main(){ gl_Position=uPV*vec4(aI.xy+aP*aI.z*uScale,0.,1.); vL=1.; }`;
const vnoise = (x, y) => { const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; };
const COMP_OPS = { multiply: 0, add: 1, over: 2, maximum: 3, minimum: 4, average: 5, negate: 6, burncolor: 7, screen: 8, difference: 9, subtract: 10, under: 11, inside: 12, dodgecolor: 13, darkercolor: 14, dimmest: 14, lightercolor: 15, brightest: 15, color: 16, softlight: 17, overlay: 18 };
const MACROS = { Bloom: 'mBloom', RadialBlur: 'mRadial', Solarize: 'mSolar', RGBADelay: 'mRgbDelay', LightTunnel: 'mTunnel', Pixelate: 'mPixelate' };
const EXPR_FN = { sin: Math.sin, cos: Math.cos, abs: Math.abs, floor: Math.floor, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt, fract: x => x - Math.floor(x),
  step: (e, x) => x < e ? 0 : 1, mix: (a, b, t) => a + (b - a) * t, clamp: (x, a, b) => Math.min(b, Math.max(a, x)) };
const dirname = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const join = (d, n) => { const out = d ? d.split('/') : []; for (const s of n.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); } return out.join('/'); };

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 が使えません');
    this.float = false; /* 8-bit targets on purpose: TouchDesigner's default pixel format clamps to 0..1 between operators */
    this.progs = {}; this.w = canvas.width = 960; this.h = canvas.height = 540; this.fid = 0; this.time = 0; this.dt = 1 / 60;
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.black = { tex: this.mkTex(1, 1, true), w: 1, h: 1 };
    this.white = this.solid([255, 255, 255, 255]);
    this.srcTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.pool = {}; this.g = { nodes: {} }; this.rt = {}; this.cs = {}; this.exprCache = new Map();
    this.audio = { band: () => 0, level: () => 0, peak: () => 0, spec: () => 0 }; this.text = 'XTAL'; this.extra = []; this.near = false; this.intensity = 1;
    this.mirror = false; this.view = null; this.srcMap = {}; this.ctl = { wave: [1, 1, 1], shape: 0 }; this.geo = {};
    this.source = null; this.texImage = null; this.errors = [];
  }
  /* ---------- GL plumbing ---------- */
  mkTex(w, h, eight) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (this.float && !eight) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  solid(rgba) { const gl = this.gl, t = this.mkTex(1, 1, true); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); return { tex: t, w: 1, h: 1 }; }
  /** render target keyed by name; recreated when the size changes */
  tgt(key, w, h, eight) { w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h)); let t = this.pool[key];
    if (t && t.w === w && t.h === h) return t; const gl = this.gl;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    t = { tex: this.mkTex(w, h, eight), fbo: gl.createFramebuffer(), w, h };
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return this.pool[key] = t; }
  freeAll() { const gl = this.gl; for (const k in this.pool) { gl.deleteTexture(this.pool[k].tex); gl.deleteFramebuffer(this.pool[k].fbo); } this.pool = {}; for (const t of this.extra) { gl.deleteTexture(t.tex); if (t.fbo) gl.deleteFramebuffer(t.fbo); } this.extra = []; }
  prog(key, fs, vs) { if (this.progs[key]) return this.progs[key]; const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs || VS], [gl.FRAGMENT_SHADER, HEAD + fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader ' + key + ': ' + gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
    gl.bindAttribLocation(p, 0, vs ? (vs.includes('aUV') ? 'aUV' : 'aP') : 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link ' + key + ': ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
    return this.progs[key] = { p, u }; }
  uniforms(pr, un, w, h) { const gl = this.gl; let unit = 0;
    for (const s of ['A', 'B', 'C', 'D']) { if (!(s in pr.u)) continue; const t = un[s] || this.black; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(pr.u[s], unit++); }
    if (pr.u.uArr && un.uArr) { gl.activeTexture(gl.TEXTURE0 + 5); gl.bindTexture(gl.TEXTURE_2D_ARRAY, un.uArr.arr); gl.uniform1i(pr.u.uArr, 5); }
    if (pr.u.uRes) gl.uniform2f(pr.u.uRes, w, h); if (pr.u.uTime) gl.uniform1f(pr.u.uTime, this.time);
    for (const k in un) { const v = un[k], l = pr.u[k]; if (l == null || k.length === 1) continue;
      if (v.arr) continue; if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.i != null) gl.uniform1i(l, v.i);
      else if (v.iv) gl['uniform' + v.iv.length + 'iv'](l, v.iv);
      else if (v.length === 16) gl.uniformMatrix4fv(l, false, v);
      else gl['uniform' + v.length + 'fv'](l, v); } }
  draw(key, t, un) { const gl = this.gl, pr = this.prog(key, FS[key]); gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    const w = t ? t.w : this.canvas.width, h = t ? t.h : this.canvas.height; gl.viewport(0, 0, w, h); gl.disable(gl.BLEND); gl.useProgram(pr.p);
    this.uniforms(pr, un, w, h); const nr = this.near && un.A && un.A.tex; if (nr) this.filter(un.A.tex, gl.NEAREST);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); if (nr) this.filter(un.A.tex, gl.LINEAR); return t; }
  filter(tex, f) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + 7); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); }
  /* ---------- graph ---------- */
  setGraph(g, adapt) {
    this.freeAll(); this.g = g; this.rt = {}; this.cs = {}; this.exprCache.clear(); this.view = null; this.errors = []; this.geo = {};
    this.srcMap = Object.assign({}, adapt && adapt.src); this.ov = {};
    if (adapt && adapt.set) for (const k in adapt.set) this.ov[k] = adapt.set[k];
    const N = g.nodes; this.macro = {};
    for (const p in N) { const sc = N[p].params.parentshortcut; if (N[p].fam === 'COMP' && sc && MACROS[sc.v]) this.macro[p] = MACROS[sc.v]; }
    this.hidden = p => { for (let d = dirname(p); d; d = dirname(d)) if (this.macro[d]) return true; return false; };
    const tops = Object.keys(N).filter(p => (N[p].fam === 'TOP' || this.macro[p]) && !this.hidden(p));
    const cnt = {}; for (const p of tops) cnt[dirname(p)] = (cnt[dirname(p)] || 0) + 1;
    this.mainDir = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
    const main = tops.filter(p => dirname(p) === this.mainDir);
    let out = main.find(p => N[p].type === 'out');
    if (!out) { const mo = main.find(p => N[p].type === 'moviefileout'); if (mo && N[mo].inputs[0]) out = join(this.mainDir, N[mo].inputs[0]); }
    if (!out) { const used = new Set(); for (const p of main) for (const i of N[p].inputs) if (i) used.add(join(this.mainDir, i)); out = main.filter(p => !used.has(p)).pop() || main[main.length - 1]; }
    this.out = (adapt && adapt.out) || out; this.tops = tops;
    this.ctl = { wave: [1, 1, 1], shape: 0 };
    const pats = Object.keys(N).filter(p => N[p].type === 'pattern').sort(); const W = { const: 0, sin: 1, cos: 2, tri: 3, ramp: 4, square: 5, pulse: 6, gaussian: 7 };
    pats.forEach((p, i) => { if (i < 3) this.ctl.wave[i] = W[(N[p].params.wavetype || {}).v] ?? 1; });
    this.unsupported = tops.filter(p => !this.macro[p] && !this.OPS[N[p].type]).map(p => p + ' (' + N[p].type + ')');
  }
  node(p) { return this.g.nodes[p]; }
  /** resolve an operator reference relative to a node; collapses references into macro components */
  ref(from, name) { if (!name) return null; let p = name[0] === '/' ? name.slice(1) : join(dirname(from), name);
    for (let d = dirname(p); d; d = dirname(d)) if (this.macro[d]) p = d;
    return this.g.nodes[p] ? p : null; }
  /* ---------- parameters & expressions ---------- */
  P(path, name, def) { const k = path + '.' + name; if (k in this.ov) return this.ov[k];
    const n = this.g.nodes[path], p = n && n.params[name]; if (!p) { const c = n && n.cdef && n.cdef[name]; return c != null && isFinite(parseFloat(c)) ? parseFloat(c) : def; }
    if (p.e) { const v = this.expr(p.e, path); if (v != null && isFinite(v)) return v; }
    const f = parseFloat(p.v); return isFinite(f) ? f : (p.v === 'on' ? 1 : p.v === 'off' ? 0 : def); }
  S(path, name, def) { const n = this.g.nodes[path], p = n && n.params[name]; return p ? p.v : (n && n.cdef && n.cdef[name]) || def; }
  expr(src, path) { const key = path + '\n' + src; let f = this.exprCache.get(key);
    if (f === undefined) { try { f = this.compile(src, path); } catch (e) { f = null; } this.exprCache.set(key, f); }
    if (!f) return null; try { return f(); } catch (e) { return null; } }
  /* tiny arithmetic parser for TD parameter expressions — never evals file content as code */
  compile(src, path) {
    const tk = src.match(/\d+\.?\d*(?:e[-+]?\d+)?|\.\d+|[A-Za-z_]\w*|'[^']*'|"[^"]*"|[-+*/()\[\].,=]/g) || []; let i = 0; const E = this;
    const peek = () => tk[i], eat = t => { if (tk[i] !== t) throw 0; i++; }, str = () => { const t = tk[i++]; if (!/^['"]/.test(t)) throw 0; return t.slice(1, -1); };
    const anc = k => { let d = dirname(path); for (let j = 1; j < k; j++) d = dirname(d); return d; };
    const par = owner => { eat('.'); eat('par'); eat('.'); const nm = tk[i++]; if (peek() === '.') { i++; i++; eat('('); eat(')'); } return () => E.P(owner, nm, 0); };
    function prim() { const t = tk[i++]; if (t === undefined) throw 0;
      if (/^[\d.]/.test(t)) { const v = parseFloat(t); return () => v; }
      if (t === '(') { const e = sum(); eat(')'); return e; }
      if (t === '-') { const e = prim(); return () => -e(); }
      if (EXPR_FN[t] && peek() === '(') { i++; const args = []; if (peek() !== ')') { args.push(sum()); while (peek() === ',') { i++; args.push(sum()); } } eat(')'); const fn = EXPR_FN[t]; return () => fn(...args.map(a => a())); }
      if (t === 'absTime') { eat('.'); const k = tk[i++]; return k === 'seconds' ? () => E.time : () => E.time * 60; }
      if (t === 'me' || t === 'root') { eat('.'); eat('time'); eat('.'); const k = tk[i++]; return k === 'seconds' ? () => E.time : k === 'rate' ? () => 60 : () => E.time * 60; }
      if (t === 'op') { eat('('); const nm = str(); eat(')'); const tp = E.ref(path, nm);
        if (peek() === '[') { i++; const ch = /^['"]/.test(peek()) ? str() : (i++, null); if (peek() === ',') throw 0; eat(']'); return () => E.chop(tp, ch); }
        if (peek() === '.') { if (tk[i + 1] === 'par') return par(tp); i++; const k = tk[i++]; if (k === 'width') return () => E.w; if (k === 'height') return () => E.h; throw 0; }
        return () => E.chop(tp, null); }
      if (t === 'parent') { let owner;
        if (peek() === '(') { i++; let k = 1; if (peek() !== ')') k = parseInt(tk[i++]); eat(')'); owner = anc(k); }
        else { eat('.'); const sc = tk[i++]; owner = dirname(path); while (owner && (E.S(owner, 'parentshortcut', '') !== sc)) owner = dirname(owner); }
        return par(owner); }
      throw 0; }
    function prod() { let a = prim(); while (peek() === '*' || peek() === '/') { const o = tk[i++], b = prim(), x = a; a = o === '*' ? () => x() * b() : () => x() / b(); } return a; }
    function sum() { let a = prod(); while (peek() === '+' || peek() === '-') { const o = tk[i++], b = prod(), x = a; a = o === '+' ? () => x() + b() : () => x() - b(); } return a; }
    const f = sum(); if (i < tk.length) throw 0; return f; }
  /* ---------- CHOP (scalar) evaluation ---------- */
  chop(path, ch) { const n = this.g.nodes[path]; if (!n) return 0; const key = path + '|' + (ch || '');
    let s = this.cs[key] || (this.cs[key] = { fid: -1, v: 0 }); if (s.fid === this.fid || s.busy) return s.v; s.busy = true;
    const inp = (k = 0) => n.inputs[k] ? this.chop(this.ref(path, n.inputs[k]), ch) : 0, P = (a, d) => this.P(path, a, d), A = this.audio; let v = 0;
    if (n.bypass) v = inp();
    else switch (n.type) {
      case 'constant': { v = P('const0value', 0); for (let k = 0; k < 16; k++) if (this.S(path, 'const' + k + 'name', '') === ch) v = P('const' + k + 'value', 0); break; }
      case 'lfo': { const ph = P('frequency', 1) * this.time + P('phase', 0), f = ph - Math.floor(ph), wt = this.S(path, 'wavetype', 'sin');
        const w = wt === 'square' ? (f < .5 ? 1 : -1) : wt === 'ramp' ? f * 2 - 1 : wt === 'tri' ? 1 - Math.abs(f * 2 - 1) * 2 : wt === 'pulse' ? (f < .1 ? 1 : 0) : wt === 'normal' ? Math.exp(-Math.pow((f - .5) * 5, 2)) : Math.sin(6.2831853 * ph);
        v = P('offset', 0) + P('amp', 1) * w; break; }
      case 'math': { v = inp(); if (this.S(path, 'chopop', 'off') === 'add') for (let k = 1; k < n.inputs.length; k++) v += inp(k);
        v = (v + P('preoff', 0)) * P('gain', 1) + P('postoff', 0); const f1 = P('fromrange1', 0), f2 = P('fromrange2', 1), t1 = P('torange1', 0), t2 = P('torange2', 1);
        v = t1 + (v - f1) / ((f2 - f1) || 1) * (t2 - t1); break; }
      case 'filter': case 'lag': { const w = n.type === 'lag' ? P('lag1', 0.2) : P('width', 0.2) * 0.5, x = inp(); s.s = s.s == null ? x : s.s + (x - s.s) * (1 - Math.exp(-this.dt / Math.max(w, 1e-3))); v = s.s; break; }
      case 'limit': v = inp(); if (this.S(path, 'type', 'off') === 'clamp') v = Math.min(P('max', 1), Math.max(P('min', -1), v)); break;
      case 'audiofilter': { const c = P('cutofffrequency', 1000), f = this.S(path, 'filter', 'lowpass'); v = f === 'highpass' ? A.band(c, 20000) : f === 'bandpass' ? A.band(c * .6, c * 1.6) : A.band(0, c); break; }
      case 'audiofilein': case 'audiodevin': case 'audiodevout': case 'audiooscillator': v = A.level(); break;
      case 'audiospect': v = A.peak(); break;
      case 'trigger': { const x = inp(), th = P('threshup', 0.5); if (x > th && !s.hi) s.env = 1; s.hi = x > th; s.env = (s.env || 0) * Math.exp(-this.dt / 0.18); v = s.env; break; }
      case 'info': v = ch === 'resy' ? this.h : this.w; break;
      case 'noise': v = P('offset', 0) + P('amp', 1) * (vnoise(this.time * P('rate', 1) + P('seed', 0) * 17.31, P('seed', 0) * 3.7) * 2 - 1); break;
      case 'count': case 'keyboardin': case 'pattern': case 'topto': case 'sopto': v = 0; break;
      default: v = inp();
    }
    s.busy = false; s.fid = this.fid; return s.v = isFinite(v) ? v : 0; }
  /* ---------- TOP evaluation ---------- */
  ev(path) { const N = this.g.nodes[path]; if (!N) return this.black; let r = this.rt[path] || (this.rt[path] = { fid: -1, out: null, st: {} });
    if (r.fid === this.fid) return r.out; if (r.busy) return r.out || this.black; r.busy = true;
    const near0 = this.near; this.near = this.S(path, 'inputfiltertype', '') === 'nearest' || this.S(path, 'filtertype', '') === 'nearest';
    try { const m = this.macro[path]; let o;
      if (N.bypass && !m) o = this.in(path, 0);
      else { const fn = m ? this[m] : this.OPS[N.type]; o = fn ? fn.call(this, path, N, r.st) : this.in(path, 0); }
      r.out = o || this.black; r.err = null;
    } catch (e) { r.err = String(e.message || e); if (!this.errors.includes(path + ': ' + r.err)) this.errors.push(path + ': ' + r.err); r.out = r.out || this.black; }
    this.near = near0; r.busy = false; r.fid = this.fid; if (this.order && !this.hidden(path)) this.order.push(path); return r.out; }
  in(path, k) { const N = this.g.nodes[path], nm = N.inputs[k]; if (!nm) return k === 0 ? this.black : null; const p = this.ref(path, nm); return p ? this.ev(p) : (k === 0 ? this.black : null); }
  ins(path) { const N = this.g.nodes[path], o = []; for (let k = 0; k < N.inputs.length; k++) { const t = this.in(path, k); if (t && (N.inputs[k])) o.push(t); } return o; }
  size(path, A) { const m = this.S(path, 'outputresolution', 'useinput'); let w = A ? A.w : this.w, h = A ? A.h : this.h;
    const sc = { half: .5, quarter: .25, eighth: .125, '2x': 2, '4x': 4 }[m]; if (sc) { w *= sc; h *= sc; }
    if (m === 'custom') { w = this.P(path, 'resolutionw', w); h = this.P(path, 'resolutionh', h); }
    const k = Math.min(1, this.w / w, this.h / h); return [Math.max(8, w * k), Math.max(8, h * k)]; }
  T(path, A, suffix, eight) { const [w, h] = this.size(path, A); return this.tgt(path + (suffix || ''), w, h, eight); }
  blurPass(key, A, sizePx, shrink, full) { const w = Math.max(8, A.w / shrink), h = Math.max(8, A.h / shrink), r = Math.max(.5, sizePx / shrink) / 8;
    const t1 = this.tgt(key + '#h', w, h), t2 = full ? this.tgt(key, A.w, A.h) : this.tgt(key + '#v', w, h);
    this.draw('blur', t1, { A, uDir: [r / w, 0] }); return this.draw('blur', t2, { A: t1, uDir: [0, r / h] }); }
  glow(key, A, th, gamma, gain, sizePx) { const b = this.draw('bright', this.tgt(key + '#b', A.w / 2, A.h / 2), { A, uTh: th, uGam: gamma, uGain: gain });
    const s = this.h / 720, l1 = this.blurPass(key + '#1', b, sizePx * s, 1), l2 = this.blurPass(key + '#2', l1, sizePx * 2 * s, 2), l3 = this.blurPass(key + '#3', l2, sizePx * 4 * s, 4);
    return this.draw('avg3', this.tgt(key + '#g', b.w, b.h), { A: l1, B: l2, C: l3 }); }
  sourceFor(path, N) { let kind = this.srcMap[path];
    if (!kind) { const f = N.params.file || { v: '' }; kind = (!f.e && /\.(jpe?g|png|tiff?|bmp|exr)$/i.test(f.v)) ? 'texture' : 'camera'; }
    if (kind === 'white') return this.white; if (kind === 'black') return this.black;
    if (kind === 'texture') { if (this.texImage) return this.texImage; const t = this.tgt('#paper', this.w, this.h); if (!t.done) { this.draw('paper', t, {}); t.done = true; } return t; }
    return this.src; }
  /* ---------- 3D-ish renderers (the Render TOP is replaced by a purpose-built pass) ---------- */
  pv(camZ) { const f = 1 / Math.tan(Math.PI / 8), a = this.w / this.h, n = .05, fr = 200;
    return new Float32Array([f, 0, 0, 0, 0, f * a, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, camZ * (fr + n) / (fr - n) + 2 * fr * n / (n - fr), camZ]); }
  mesh(key, build) { if (this.geo[key]) return this.geo[key]; const gl = this.gl, m = build(), vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (m.i) { const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW); }
    gl.bindVertexArray(this.vao); return this.geo[key] = { vao, n: m.i ? m.i.length : m.v.length / 2 }; }
  draw3(key, t, un, mesh, mode, inst, additive) { const gl = this.gl, pr = this.prog('3d' + key, FS[un.__fs || 'flat'], VS3[key]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(pr.p); this.uniforms(pr, un, t.w, t.h); gl.bindVertexArray(mesh.vao);
    if (inst) gl.drawArraysInstanced(mode, 0, mesh.n, inst); else if (mode === gl.LINES) gl.drawElements(mode, mesh.n, gl.UNSIGNED_INT, 0); else gl.drawArrays(mode, 0, mesh.n);
    gl.disable(gl.BLEND); gl.bindVertexArray(this.vao); return t; }
  render(path, N) { const gl = this.gl, dir = dirname(path), sib = t => Object.keys(this.g.nodes).filter(p => dirname(p) === dir && this.g.nodes[p].type === t), t = this.tgt(path, this.w, this.h);
    const cam = sib('cam')[0], camZ = cam ? this.P(cam, 'tz', 5) : 5, visW = 2 * camZ * Math.tan(Math.PI / 8), visH = visW * this.h / this.w;
    const trace = sib('trace')[0], topto = sib('topto')[0], chopto = sib('chopto')[0], pattern = sib('pattern')[0];
    if (trace) { const A = this.ev(this.ref(trace, this.S(trace, 'top', ''))); return this.draw('trace', t, { A, uTh: this.P(trace, 'thresh', .5) }); }
    const lumaSrc = topto ? this.ev(this.ref(topto, this.S(topto, 'top', ''))) : this.black;
    if (chopto) { const grid = sib('grid')[0], cols = Math.min(512, Math.round(this.P(grid, 'cols', 64))), rows = Math.min(512, Math.round(this.P(grid, 'rows', 36)));
      const m = this.mesh('lines' + cols + 'x' + rows, () => { const v = new Float32Array(cols * rows * 2), ix = new Uint32Array((cols - 1) * rows * 2); let k = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { v[(r * cols + c) * 2] = c / (cols - 1); v[(r * cols + c) * 2 + 1] = r / (rows - 1); if (c < cols - 1) { ix[k++] = r * cols + c; ix[k++] = r * cols + c + 1; } }
        return { v, i: ix }; });
      const mth = sib('math').find(p => this.g.nodes[p].params.torange2), amp = mth ? this.P(mth, 'torange2', .05) : .05;
      return this.draw3('lines', t, { A: lumaSrc, uPV: this.pv(camZ), uSize: [visW * 1.04, visH * 1.03], uAmp: amp * visH / 1.07, uCol: [.8, .8, .8, 1] }, m, gl.LINES); }
    if (topto) { const cols = Math.min(360, Math.round(this.w / 3)), rows = Math.round(cols * this.h / this.w);
      const m = this.mesh('pts' + cols + 'x' + rows, () => { const v = new Float32Array(cols * rows * 2); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { v[(r * cols + c) * 2] = (c + .5) / cols; v[(r * cols + c) * 2 + 1] = (r + .5) / rows; } return { v }; });
      const mat = sib('constant').find(p => this.g.nodes[p].fam === 'MAT'), a = mat ? Math.min(1, Math.max(0, this.P(mat, 'alpha', 1))) : 1;
      const col = mat ? [this.P(mat, 'colorr', 1), this.P(mat, 'colorg', 1), this.P(mat, 'colorb', 1)] : [1, 1, 1], nz = sib('noise').find(p => this.g.nodes[p].fam === 'SOP');
      return this.draw3('points', t, { A: lumaSrc, uPV: this.pv(camZ), uSize: [visW * 1.25, visH * 1.25], uAmp: (nz ? this.P(nz, 'amp', 1) : 0) * .12, uPt: this.w / cols * 1.15 * camZ / 5, uCol: [col[0] * a, col[1] * a, col[2] * a, a] }, m, gl.POINTS); }
    const geo = sib('geo')[0];
    if (geo && this.S(geo, 'instancesx', '') === 'size') { const grid = sib('grid')[0], n = Math.max(2, Math.min(400, Math.round(grid ? this.P(grid, 'cols', 100) : 100))), gs = this.P(geo, 'sx', 1), sx = grid ? this.P(grid, 'sizex', 1) : 1;
      const xf = sib('transform').find(p => this.g.nodes[p].fam === 'SOP'), ci = sib('circle').find(p => this.g.nodes[p].fam === 'SOP'), rad = (ci ? this.P(ci, 'radx', 1) : 1) * (xf ? this.P(xf, 'sx', 1) * this.P(xf, 'scale', 1) : 1) * gs, dv = ci ? Math.max(3, Math.round(this.P(ci, 'divs', 20))) : 20;
      const key = 'inst' + dv + '_' + n; let m = this.geo[key];
      if (!m) { const v = [0, 0]; for (let k = 0; k <= dv; k++) v.push(Math.cos(k / dv * 6.2831853), Math.sin(k / dv * 6.2831853)); m = this.geo[key] = { vao: gl.createVertexArray(), n: v.length / 2, ib: gl.createBuffer(), data: new Float32Array(n * 3) };
        gl.bindVertexArray(m.vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.ib); gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1); gl.bindVertexArray(this.vao); }
      for (let i = 0; i < n; i++) { const u = i / (n - 1), sp = this.audio.spec(((i * 37) % n) / n); m.data[i * 3] = ((u - .5) * sx + (vnoise(i / 18, this.time) * 2 - 1) * .8) * gs; m.data[i * 3 + 1] = (vnoise(i / 30 + 40, this.time) * 2 - 1) * .55 * gs; m.data[i * 3 + 2] = .2 + sp * 2.6; }
      gl.bindBuffer(gl.ARRAY_BUFFER, m.ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data);
      return this.draw3('inst', t, { uPV: this.pv(camZ), uScale: rad, uCol: [1, 1, 1, 1] }, m, gl.TRIANGLE_FAN, n); }
    if (pattern) { const sw = sib('switch').find(p => this.g.nodes[p].fam === 'SOP'), names = sw ? this.g.nodes[sw].inputs.map(s => (s || '').replace(/\d+$/, '')) : ['circle'];
      const shape = names[this.ctl.shape % names.length] || 'circle', len = Math.min(2000, this.P(pattern, 'length', 600));
      const m = this.mesh('wire' + shape, () => { const v = []; if (shape === 'line') v.push(0, -.5, 0, .5); else if (shape === 'rectangle') v.push(-.5, -.5, .5, -.5, .5, .5, -.5, .5); else for (let k = 0; k < 48; k++) v.push(Math.cos(k / 48 * 6.2831853), Math.sin(k / 48 * 6.2831853)); return { v: new Float32Array(v) }; });
      const xf = sib('transform').find(p => this.g.nodes[p].fam === 'SOP'), trg = sib('trigger')[0], sc = xf && trg ? .1 + this.chop(trg, null) * .9 : 1;
      return this.draw3('wire', t, { uPV: this.pv(camZ), uW: { iv: this.ctl.wave }, uN: len, uScale: sc, uCol: [.5, .5, .5, .5] }, m, gl.LINE_LOOP, len, true); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return t; }
  /* ---------- palette components handled as single operators ---------- */
  cin(path, name) { const N = this.g.nodes[path], s = N.compinputs && N.compinputs[name || 'in1']; const p = s && this.ref(path, s); return p ? this.ev(p) : this.black; }
  mBloom(path) { const A = this.cin(path), P = (k, d) => this.P(path, k, d);
    const g = this.glow(path, A, P('Threshold', .26), 1, P('Intensity', .62) * 3, P('Blursize', 20) * .5 * Math.max(1, P('Iterations', 5) * .5));
    return this.draw('addmix', this.tgt(path, A.w, A.h), { A, B: g, uA: P('Inputlevel', 1), uB: P('Bloom', .392) * 4 + P('Glow', .4), uTint: [1, 1, 1] }); }
  mRadial(path) { const A = this.cin(path); return this.draw('radial', this.tgt(path, A.w, A.h), { A, uCenter: [this.P(path, 'Centerx', .5), this.P(path, 'Centery', .5)], uStr: this.P(path, 'Strength', .1), uMix: this.P(path, 'Drywet', 1) }); }
  mTunnel(path) { const A = this.cin(path); return this.draw('tunnel', this.tgt(path, A.w, A.h), { A, uRad: this.P(path, 'Radius', .3), uMix: this.P(path, 'Drywet', 1), uAsp: A.w / A.h, uC: [this.P(path, 'Center1', 0), this.P(path, 'Center2', 0)] }); }
  /* palette Pixelate: resolution = input / pixel size (Horsize x Vertsize px at 720p, or Horsize for both with Square Pixels) */
  mPixelate(path) { const A = this.cin(path), P = (k, d) => this.P(path, k, d), s = Math.min(this.w, this.h) / 720, hs = Math.max(1, P('Horsize', 10)), vs = P('Squarepixels', 0) > .5 ? hs : Math.max(1, P('Vertsize', 10));
    return this.draw('pixcell', this.tgt(path, A.w, A.h), { A, uCell: [Math.max(1, hs * s), Math.max(1, vs * s)], uMix: Math.min(1, Math.max(0, P('Drywet', 1))) }); }
  mSolar(path) { const A = this.cin(path), P = (k, d) => this.P(path, k, d);
    return this.draw('solar', this.tgt(path, A.w, A.h), { A, uLT: P('Lightthreshold', .5), uLS: P('Lightsoft', .25), uDT: P('Darkthreshold', .3), uDS: P('Darksoft', .4), uMix: P('Drywet', 1) }); }
  mRgbDelay(path, N, st) { const A = this.cin(path), d = ['Reddelay', 'Greendelay', 'Bluedelay'].map((k, i) => Math.min(29, Math.abs(Math.round(this.P(path, k, [-15, -10, -5][i]))))), K = Math.max(...d) + 1;
    st.head = ((st.head ?? -1) + 1) % K; st.n = Math.min(K, (st.n || 0) + 1);
    this.draw('copy', this.tgt(path + '#r' + st.head, A.w, A.h, true), { A });
    const fr = k => this.pool[path + '#r' + ((st.head - Math.min(k, st.n - 1) + K) % K)];
    return this.draw('rgbdelay', this.tgt(path, A.w, A.h), { A: fr(d[0]), B: fr(d[1]), C: fr(d[2]), D: A, uMix: this.P(path, 'Drywet', 1) }); }
  /* ---------- frame ---------- */
  resize(w, h) { w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2; if (w === this.w && h === this.h) return; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h; this.freeAll(); this.rt = {}; this.geo = {}; }
  frame(now) { const gl = this.gl, t = now / 1000; this.dt = Math.min(.1, Math.max(1e-3, t - (this.last || t - 1 / 60))); this.last = t; this.time += this.dt; this.fid++; this.remap = null;
    const s = this.source; let sw = s && (s.videoWidth || s.naturalWidth || s.width), sh = s && (s.videoHeight || s.naturalHeight || s.height);
    if (sw && sh && (s.readyState === undefined || s.readyState >= 2)) { gl.bindTexture(gl.TEXTURE_2D, this.srcTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s); this.srcOk = true; } catch (e) { } gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); }
    const ar = sw && sh ? (sw / sh) / (this.w / this.h) : 1;
    this.src = this.draw('src', this.tgt('#src', this.w, this.h, true), { A: this.srcOk ? { tex: this.srcTex } : this.black, uScale: ar > 1 ? [1 / ar, 1] : [1, ar], uMirror: this.mirror ? 1 : 0 });
    this.order = []; const target = this.view && this.g.nodes[this.view] ? this.view : this.out; const o = target ? this.ev(target) : this.src; this.lastOrder = this.order; this.order = null;
    this.draw('present', null, { A: this.intensity < 0.999 && target === this.out ? this.draw('mix', this.tgt('#wet', this.w, this.h, true), { A: this.src, B: o, uMix: Math.max(0, this.intensity) }) : o });
    for (const p in this.rt) { const N = this.g.nodes[p], r = this.rt[p]; if (!N || N.type !== 'feedback' || r.fid !== this.fid) continue;
      const tp = this.ref(p, this.S(p, 'top', '')); if (!tp) continue; const T = this.ev(tp); if (T === this.black) continue;
      this.draw('copy', this.tgt(p, T.w, T.h), { A: T }); r.st.primed = true; } }
}
Engine.prototype.OPS = (() => {
  const alias = function (p) { return this.in(p, 0); };
  const comp = fixed => function (p, N) { const I = this.ins(p); if (!I.length) return this.black; if (I.length === 1 && !fixed) return I[0];
    const op = fixed != null ? fixed : (COMP_OPS[this.S(p, 'operand', 'multiply')] ?? 2);
    return this.draw('comp', this.T(p, I[0]), { A: I[0], B: I[1], C: I[2], D: I[3], uOp: { i: op }, uN: { i: Math.min(4, I.length) }, uSwap: this.S(p, 'swaporder', 'off') === 'on' ? 1 : 0 }); };
  return {
    null: alias, in: function (p, N) { const par = dirname(p), pn = this.g.nodes[par], nm = par ? p.slice(par.length + 1) : p;
      if (pn && pn.compinputs && pn.compinputs[nm]) { const s = this.ref(par, pn.compinputs[nm]); return s ? this.ev(s) : this.black; } return this.in(p, 0); },
    out: alias, cache: alias, moviefileout: alias, fit: alias, select: function (p) { const s = this.ref(p, this.S(p, 'top', '')); return s ? this.ev(s) : this.black; },
    cacheselect: function (p) { const s = this.ref(p, this.S(p, 'cachetop', '')); return s ? this.ev(s) : this.black; },
    res: function (p) { const A = this.in(p, 0), [w, h] = this.size(p, A); if (Math.round(w) === A.w && Math.round(h) === A.h) return A; return this.draw('copy', this.tgt(p, w, h), { A }); },
    moviefilein: function (p, N, st) { const S = this.sourceFor(p, N), sp = N.params.speed; if (!sp || !sp.e || S !== this.src) return S;
      const K = 72, w = Math.min(this.w, 640), h = w * this.h / this.w, speed = this.P(p, 'speed', 1); st.k = (st.k ?? -1) + 1;
      this.draw('copy', this.tgt(p + '#f' + (st.k % K), w, h, true), { A: S });
      st.pos = (st.pos ?? st.k) + speed * this.dt * 60; const maxD = Math.min(K - 2, st.k); st.pos = Math.min(st.k, Math.max(st.k - maxD, st.pos));
      const i0 = Math.floor(st.pos), f = st.pos - i0, F = k => this.pool[p + '#f' + (Math.min(st.k, k) % K)]; this.remap = { delay: st.k - st.pos, speed };
      return this.draw('mix', this.tgt(p, w, h, true), { A: F(i0), B: F(i0 + 1), uMix: f }); },
    level: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d);
      return this.draw('level', this.T(p, A), { A, uClampIn: this.S(p, 'clampinput', '') === 'clamp' ? 1 : 0, uInvert: P('invert', 0), uBlack: P('blacklevel', 0), uB1: P('brightness1', 1), uG1: P('gamma1', 1), uCon: P('contrast', 1),
        uInLo: P('inlow', 0), uInHi: P('inhigh', 1), uOutLo: P('outlow', 0), uOutHi: P('outhigh', 1), uOpacity: P('opacity', 1), uB2: P('brightness2', 1), uG2: P('gamma2', 1), uClamp: P('clamp', 0), uCLo: P('clamplow2', 0), uCHi: P('clamphigh2', 1) }); },
    comp: comp(null), add: comp(1), multiply: comp(0), over: comp(2), screen: comp(8), difference: comp(9), subtract: comp(10), under: comp(11), inside: comp(12),
    noise: function (p, N) { const A = N.inputs[0] ? this.in(p, 0) : null, P = (k, d) => this.P(p, k, d), ty = this.S(p, 'type', 'sparse');
      return this.draw('noise', this.T(p, A), { A: A || this.black, uType: { i: /^random/.test(ty) ? 1 : 0 }, uHarm: { i: Math.round(P('harmon', 2)) }, uSeed: P('seed', 1), uPeriod: P('period', 1), uSpread: P('spread', 2), uGain: P('gain', .7),
        uExp: P('exp', 1), uAmp: P('amp', .5), uOffset: P('offset', .5), uMono: this.S(p, 'mono', 'on') === 'off' ? 0 : 1, uHasIn: A ? 1 : 0, uAspect: this.w / this.h, uT: [P('tx', 0), P('ty', 0), P('tz', 0)] }); },
    blur: function (p) { const A = this.in(p, 0); return this.blurPass(p, A, this.P(p, 'size', 8) * this.h / 720, Math.max(1, this.P(p, 'preshrink', 1)), true); },
    edge: function (p) { const A = this.in(p, 0); return this.draw('edge', this.T(p, A), { A, uStrength: this.P(p, 'strength', 1), uBlack: this.P(p, 'blacklevel', 0), uComp: this.S(p, 'compinput', 'off') === 'on' ? 1 : 0, uOff: 1,
      uSel: this.S(p, 'select', 'luminance') === 'max' ? 1 : 0, uCol: [this.P(p, 'edgecolorr', 1), this.P(p, 'edgecolorg', 1), this.P(p, 'edgecolorb', 1)] }); },
    antialias: function (p) { const A = this.in(p, 0); if (this.S(p, 'outputedges', 'off') !== 'on') return A; return this.draw('edge', this.T(p, A), { A, uStrength: 3, uBlack: .08, uComp: 0, uOff: 1, uSel: 0, uCol: [1, 1, 1] }); },
    thresh: function (p) { const A = this.in(p, 0), c = { greater: 0, greaterorequal: 0, less: 1, lessorequal: 1, equal: 2, notequal: 3 }[this.S(p, 'comparator', 'greater')] ?? 0;
      return this.draw('thresh', this.T(p, A), { A, uTh: this.P(p, 'threshold', .5), uSoft: this.P(p, 'soften', 0), uCmp: c, uMax: ({ luminance: 0, red: 1, green: 2, blue: 3, alpha: 4, rgbaverage: 5, average: 6, rgbmax: 7 })[this.S(p, 'rgb', 'luminance')] ?? 0, uA1: this.S(p, 'alpha', '') === 'one' ? 1 : 0 }); },
    slope: function (p) { const A = this.in(p, 0), k = { neutral: 0, hluminance: 1, vluminance: 2 }, c = (n, d) => k[this.S(p, n, d)] ?? 0;
      return this.draw('slope', this.T(p, A), { A, uCh: { iv: [c('red', 'hluminance'), c('green', 'vluminance'), c('blue', 'neutral')] }, uStr: this.P(p, 'strength', 1) }); },
    rectangle: function (p, N) { const A = N.inputs[0] ? this.in(p, 0) : null; return this.draw('rect', this.T(p, A), { A: A || this.black, uSize: [Math.abs(this.P(p, 'sizex', .5)), Math.abs(this.P(p, 'sizey', .5))], uSoft: this.P(p, 'softness', 0), uHasIn: A ? 1 : 0 }); },
    lensdistort: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d);
      return this.draw('lens', this.T(p, A), { A, uK: [P('k1', 0), P('k2', 0), P('k3', 0)], uPt: [P('p1', 0), P('p2', 0)], uC: [P('center1', 0), P('center2', 0)], uF: [P('focallength1', 1) || 1, P('focallength2', 1) || 1], uInv: this.S(p, 'invert', 'off') === 'on' ? 1 : 0 }); },
    tex3d: function (p, N, st) { const gl = this.gl, A = this.in(p, 0), K = Math.max(2, Math.min(160, Math.round(this.P(p, 'cachesize', 32)))), step = Math.max(1, Math.round(this.P(p, 'step', 1)));
      const asp = A.w / A.h, w = Math.max(16, Math.round(Math.min(A.w, Math.sqrt(1e7 / K * asp)))), h = Math.max(16, Math.round(w / asp));
      if (!st.arr || st.K !== K || st.w !== w || st.h !== h) { st.arr = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, st.arr); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, K);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, k, v);
        st.fbo = gl.createFramebuffer(); this.extra.push({ tex: st.arr, fbo: st.fbo }); Object.assign(st, { K, w, h, head: -1, n: 0, f: -1, step }); }
      if (++st.f % step === 0) { st.head = (st.head + 1) % K; st.n = Math.min(K, st.n + 1); gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, st.arr, 0, st.head); this.draw('copy', { fbo: st.fbo, w, h }, { A }); }
      return A; },
    tima: function (p, N) { const cp = this.ref(p, N.inputs[0]); if (!cp) return this.black; const live = this.ev(cp), st = (this.rt[cp] || {}).st || {}; if (!st.arr || !st.n) return live;
      const M = this.in(p, 1) || live; return this.draw('tima', this.tgt(p, live.w, live.h), { A: M, uArr: { arr: st.arr }, uHead: st.head, uK: st.K, uN: st.n, uBlack: this.P(p, 'blackoffset', 0) / st.step, uWhite: this.P(p, 'whiteoffset', 0) / st.step }); },
    text: function (p, N, st) { const gl = this.gl, A = N.inputs[0] ? this.in(p, 0) : null, t = this.tgt(p, this.w, this.h), str = this.S(p, 'text', '') || this.text;
      if (st.str !== str || st.w !== t.w || st.h !== t.h) { const c = document.createElement('canvas'); c.width = t.w; c.height = t.h; const x = c.getContext('2d'); let fs = t.h * .34; x.font = '700 ' + fs + 'px "Chakra Petch","Helvetica Neue",Arial,sans-serif';
        const mw = x.measureText(str).width; if (mw > t.w * .86) { fs *= t.w * .86 / mw; x.font = '700 ' + fs + 'px "Chakra Petch","Helvetica Neue",Arial,sans-serif'; }
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(str, t.w / 2, t.h / 2);
        if (!st.tex) { st.tex = this.mkTex(1, 1, true); this.extra.push({ tex: st.tex }); } gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); Object.assign(st, { str, w: t.w, h: t.h }); }
      const a = this.P(p, 'fontalpha', 1); return this.draw('tint', t, { A: { tex: st.tex }, B: A || this.black, uCol: [this.P(p, 'fontcolorr', 1) * a, this.P(p, 'fontcolorg', 1) * a, this.P(p, 'fontcolorb', 1) * a, a], uHasIn: A ? 1 : 0 }); },
    rgbkey: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d); const mn = [P('redmin', 0), P('greenmin', 0), P('bluemin', 0)], mx = [P('redmax', 1), P('greenmax', 1), P('bluemax', 1)];
      if (mn.every(v => v <= 0) && mx.every(v => v >= 1)) return A; return this.draw('rgbkey', this.T(p, A), { A, uMin: mn, uMax: mx }); },
    transform: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d), ba = P('bgcolora', 0);
      const ex = this.S(p, 'extend', 'hold');
      return this.draw('transform', this.T(p, A), { A, uT: [P('tx', 0), P('ty', 0)], uS: [P('sx', 1) || 1, P('sy', 1) || 1], uR: P('rotate', 0) * Math.PI / 180, uAsp: A.w / A.h, uHold: ex === 'zero' ? 0 : ex === 'repeat' || ex === 'mirror' ? 2 : 1,
        uBg: [P('bgcolorr', 0) * ba, P('bgcolorg', 0) * ba, P('bgcolorb', 0) * ba, ba] }); },
    mirror: function (p) { const A = this.in(p, 0); return this.draw('flip', this.T(p, A), { A, uFx: this.S(p, 'flipx', 'off') === 'on' ? 1 : 0, uFy: this.S(p, 'flipy', 'off') === 'on' ? 1 : 0 }); },
    flip: function (p) { const A = this.in(p, 0); return this.draw('flip', this.T(p, A), { A, uFx: this.S(p, 'flipx', 'off') === 'on' ? 1 : 0, uFy: this.S(p, 'flipy', 'off') === 'on' ? 1 : 0 }); },
    function: function (p) { const A = this.in(p, 0), f = this.S(p, 'funcrgb', 'input'), op = { powe: 0, powb: 1, sqrt: 2, abs: 3, sin: 4, cos: 5, exp: 6 }[f]; if (op == null) return A;
      return this.draw('func', this.T(p, A), { A, uOp: { i: op }, uBase: this.P(p, 'baseval', 2), uExpv: this.P(p, 'expval', 2), uR1: this.P(p, 'rerange1', 0), uR2: this.P(p, 'rerange2', 1) }); },
    switch: function (p, N) { const I = N.inputs.map((nm, k) => nm ? k : -1).filter(k => k >= 0); if (!I.length) return this.black;
      const x = Math.min(I.length - 1, Math.max(0, this.P(p, 'index', 0))), i0 = Math.floor(x), f = x - i0, A = this.in(p, I[i0]);
      if (this.S(p, 'blend', 'off') !== 'on' || f < 1e-3) return A; return this.draw('mix', this.T(p, A), { A, B: this.in(p, I[Math.min(I.length - 1, i0 + 1)]), uMix: f }); },
    cross: function (p) { const A = this.in(p, 0); return this.draw('mix', this.T(p, A), { A, B: this.in(p, 1) || A, uMix: this.P(p, 'cross', .5) }); },
    constant: function (p, N) { const kind = this.srcMap[p]; if (kind === 'camera') return this.src;
      const A = N.inputs[0] ? this.in(p, 0) : null, a = this.P(p, 'alpha', 1);
      return this.draw('constant', this.T(p, A), { A: A || this.black, uCol: [this.P(p, 'colorr', 1) * a, this.P(p, 'colorg', 1) * a, this.P(p, 'colorb', 1) * a, a], uHasIn: A ? 1 : 0 }); },
    circle: function (p) { return this.draw('circle', this.T(p, null), { uRad: this.P(p, 'radiusx', .25), uSoft: this.P(p, 'softness', 0), uAsp: this.w / this.h }); },
    ramp: function (p, N, st) { const gl = this.gl, ks = this.S(p, 'keys', ''), dn = this.S(p, 'dat', ''), t = this.T(p, null); let keys = null;
      if (ks) { try { keys = JSON.parse(ks); } catch (e) { } } else if (dn) { const d = this.g.nodes[join(dirname(p), dn)]; if (d && d.table) keys = d.table.slice(1).map(r => r.map(Number)); }
      keys = (keys || []).filter(r => r.length >= 5 && r.every(isFinite)); const ty = { horizontal: 0, vertical: 1, radial: 2, circular: 3 }[this.S(p, 'type', 'horizontal')] ?? 0;
      if (!keys.length) keys = [[0, 0, 0, 0, 1], [1, 1, 1, 1, 1]];
      const interp = this.S(p, 'interp', 'linear'), pre = this.S(p, 'multrgbbyalpha', 'on') !== 'off', sig = JSON.stringify(keys) + interp + pre;
      if (st.sig !== sig) { const K = keys.map((k, i) => [k, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(x => x[0]), n = 256, px = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) { const u = i / (n - 1); let j = 0; while (j < K.length - 1 && K[j + 1][0] <= u) j++; const a = K[j], b = K[Math.min(K.length - 1, j + 1)];
          let f = u <= a[0] || b[0] <= a[0] ? 0 : Math.min(1, (u - a[0]) / (b[0] - a[0])); if (interp === 'step') f = 0; else if (interp !== 'linear') f = f * f * (3 - 2 * f);
          const al = a[4] + (b[4] - a[4]) * f; for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, (a[c + 1] + (b[c + 1] - a[c + 1]) * f) * (pre ? al : 1)))); px[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, al))); }
        if (!st.tex) { st.tex = this.mkTex(n, 1, true); this.extra.push({ tex: st.tex }); } gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px); st.sig = sig; }
      return this.draw('rampk', t, { A: { tex: st.tex }, uType: ty, uPhase: this.P(p, 'phase', 0), uPeriod: this.P(p, 'period', 1) || 1, uAsp: t.w / t.h }); },
    lookup: function (p) { const A = this.in(p, 0), B = this.in(p, 1); if (!B) return A; const P = (k, d) => this.P(p, k, d);
      const ch = { luminance: 0, red: 1, green: 2, blue: 3, alpha: 4, rgbaverage: 5, average: 6, rgbmax: 7, max: 8, independent: 9 }[this.S(p, 'channel', 'independent')] ?? 9;
      return this.draw('lookup', this.T(p, A), { A, B, uIdx: [P('index1', 0), P('index2', 1)], uDark: [P('darkuv1', 0), P('darkuv2', .5)], uLight: [P('lightuv1', 1), P('lightuv2', .5)], uCh: { i: ch }, uIA: this.S(p, 'independentalpha', 'off') === 'on' ? 1 : 0 }); },
    lumalevel: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d);
      return this.draw('lumalevel', this.T(p, A), { A, uSrc: { i: { luminance: 0, red: 1, green: 2, blue: 3, alpha: 4, rgbaverage: 5, average: 6 }[this.S(p, 'source', 'luminance')] ?? 0 }, uInvert: P('invert', 0), uBlack: P('blacklevel', 0), uB1: P('brightness1', 1), uG1: P('gamma1', 1), uCon: P('contrast', 1),
        uInLo: P('inlow', 0), uInHi: P('inhigh', 1), uOutLo: P('outlow', 0), uOutHi: P('outhigh', 1), uOpacity: P('opacity', 1), uB2: P('brightness2', 1), uG2: P('gamma2', 1) }); },
    /* same as the palette Pixelate component, as a single operator for original presets */
    pixelate: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d), s = Math.min(this.w, this.h) / 720, hs = Math.max(1, P('horsize', 10)), vs = P('squarepixels', 0) > .5 ? hs : Math.max(1, P('vertsize', 10));
      return this.draw('pixcell', this.T(p, A), { A, uCell: [Math.max(1, hs * s), Math.max(1, vs * s)], uMix: Math.min(1, Math.max(0, P('drywet', 1))) }); },
    matte: function (p) { const A = this.in(p, 0), B = this.in(p, 1) || this.black, C = this.in(p, 2); if (!C) return A;
      return this.draw('matte', this.T(p, A), { A, B, C, uCh: { i: { luminance: 0, red: 1, green: 2, blue: 3, alpha: 4, rgbaverage: 5, average: 6 }[this.S(p, 'mattechannel', 'alpha')] ?? 4 } }); },
    reorder: function (p) { const I = [0, 1, 2, 3].map(k => this.in(p, k)), ch = { red: 0, green: 1, blue: 2, alpha: 3, zero: 4, one: 5, luminance: 6 }, nm = ['red', 'green', 'blue', 'alpha'];
      const src = nm.map(c => Math.max(0, parseInt(this.S(p, 'output' + c, 'input1').replace('input', '')) - 1)), cs = nm.map(c => ch[this.S(p, 'output' + c + 'chan', c)] ?? 0);
      return this.draw('reorder', this.T(p, I[0]), { A: I[0], B: I[1], C: I[2], D: I[3], uSrc: { iv: src }, uCh: { iv: cs } }); },
    displace: function (p) { const A = this.in(p, 0), B = this.in(p, 1) || this.black, ch = { red: 0, green: 1, blue: 2, alpha: 3 };
      return this.draw('displace', this.T(p, A), { A, B, uW: [this.P(p, 'displaceweightx', 1), this.P(p, 'displaceweighty', 1)], uSel: { iv: [ch[this.S(p, 'horzsource', 'red')] ?? -1, ch[this.S(p, 'vertsource', 'green')] ?? -1] },
        uMid: [this.P(p, 'midpointx', .5), this.P(p, 'midpointy', .5)], uUV: this.P(p, 'uvweight', 1) }); },
    hsvadj: function (p) { const A = this.in(p, 0); return this.draw('hsv', this.T(p, A), { A, uHue: this.P(p, 'hueoffset', 0), uSat: this.P(p, 'saturationmult', 1), uVal: this.P(p, 'valuemult', 1) }); },
    monochrome: function (p) { const A = this.in(p, 0); return this.draw('mono', this.T(p, A), { A, uAvg: 0, uA0: 0 }); },
    mono: function (p) { const A = this.in(p, 0); return this.draw('mono', this.T(p, A), { A, uAvg: this.S(p, 'rgb', '') === 'rgbaverage' ? 1 : 0, uA0: this.S(p, 'alpha', '') === 'zero' ? 1 : 0 }); },
    feedback: function (p, N, st) { return st.primed && this.pool[p] ? this.pool[p] : this.in(p, 0); },
    bloom: function (p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d);
      const g = this.glow(p, A, Math.min(.98, Math.max(0, P('bloomthreshold', 0) + P('preblacklevel', 0))), P('pregamma', 1), P('prebrightness', 1) || 1, 40 + P('maxbloomradius', .2) * 300);
      return this.draw('addmix', this.tgt(p, A.w, A.h), { A, B: g, uA: 1, uB: P('bloomintensity', 1) * P('bloomfill', 1), uTint: [1, 1, 1] }); },
    render: function (p, N) { return this.render(p, N); },
  };
})();
if (typeof module !== 'undefined') module.exports = { Engine, FS };
