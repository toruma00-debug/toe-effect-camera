/* FX — shader building blocks for original presets. Each one runs as a GLSL TOP node inside the same
   network engine that executes TouchDesigner graphs, so presets are ordinary operator networks. */
const FXPRE = `
#define TA(u) texture(A,u)
vec2 ASP(){ return vec2(uRes.x/uRes.y,1.); }
float RS(){ return uRes.y/720.; }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float h21(vec2 p){ return h13(vec3(p,3.7)); }
vec2 h22(vec2 p){ return vec2(h13(vec3(p,1.3)),h13(vec3(p,7.9))); }
vec3 hsv(float h,float s,float v){ vec3 k=clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); return v*mix(vec3(1.),k,s); }
vec3 tohsv(vec3 c){ float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)), d=mx-mn, h=0.;
  if(d>1e-5){ if(mx==c.r) h=mod((c.g-c.b)/d,6.); else if(mx==c.g) h=(c.b-c.r)/d+2.; else h=(c.r-c.g)/d+4.; h/=6.; } return vec3(h,mx>1e-5?d/mx:0.,mx); }
float bayer(vec2 p){ ivec2 i=ivec2(mod(p,4.)); const mat4 M=mat4(0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (M[i.x][i.y]+.5)/16.; }
vec2 mir(vec2 u){ return abs(mod(u+1.,2.)-1.); }
vec3 sobel(vec2 u,float px){ vec2 e=px/uRes; float tl=lum(TA(u+vec2(-e.x,e.y)).rgb),t=lum(TA(u+vec2(0.,e.y)).rgb),tr=lum(TA(u+e).rgb),l=lum(TA(u-vec2(e.x,0.)).rgb),r=lum(TA(u+vec2(e.x,0.)).rgb),bl=lum(TA(u-e).rgb),b=lum(TA(u-vec2(0.,e.y)).rgb),br=lum(TA(u+vec2(e.x,-e.y)).rgb);
  float gx=tr+2.*r+br-tl-2.*l-bl, gy=tl+2.*t+tr-bl-2.*b-br; return vec3(gx,gy,length(vec2(gx,gy))); }
`;
/* 5x5 glyphs, darkest to brightest, packed one bit per cell (bit = x + y*5, y from the top) */
const GLYPHS = ['00000 00000 00000 00000 00000', '00000 00000 00000 00000 00100', '00000 00100 00000 00100 00000', '00000 00000 01110 00000 00000', '00000 01110 00000 01110 00000',
  '00000 00100 01110 00100 00000', '00000 10101 01110 10101 00000', '00000 01110 01010 01110 00000', '11001 11010 00100 01011 10011', '01010 11111 01010 11111 01010',
  '01110 10001 01110 10001 01110', '01110 10001 10111 10110 01111'].map(g => { let v = 0; g.replace(/ /g, '').split('').forEach((c, i) => { if (c === '1') v |= 1 << i; }); return v; });
const GLY = `const int GL[12]=int[12](${GLYPHS.join(',')});
float glyph(int i,vec2 f){ ivec2 g=ivec2(floor(f*6.)); if(g.x>4||g.y>4||g.x<0||g.y<0) return 0.; return float((GL[i]>>(g.x+g.y*5))&1); }
`;
const VORO = `void voro(vec2 p,float jit,float spd,out float d1,out float d2,out vec2 best){ vec2 ip=floor(p); d1=9.; d2=9.; best=ip;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 n=ip+vec2(float(i),float(j)); vec2 pt=n+.5+.45*jit*sin(uTime*spd+6.2831*h22(n)); float d=length(p-pt); if(d<d1){ d2=d1; d1=d; best=pt; } else if(d<d2) d2=d; } }
`;
/* name: [uniform spec, body]. Spec items: name=default:min:max (float) or name=#rrggbb (colour). A trailing * marks the control shown first in the Adjust sheet. */
const FXLIB = {
  /* ---- colour ---- */
  grade: ['exposure*=0:-2:2 contrast=1:0.2:2.5 sat*=1:0:2.5 temp=0:-1:1 tint=0:-1:1 gamma=1:0.4:2.5 fade=0:0:1 sh=#808080 hi=#808080', `
void main(){ vec4 c=TA(vUV); vec3 x=c.rgb*exp2(u_exposure); x*=vec3(1.+u_temp*.22,1.-u_tint*.18,1.-u_temp*.22);
  x=pow(max(x,0.),vec3(1./u_gamma)); x=(x-.5)*u_contrast+.5; float l=lum(x); x=mix(vec3(l),x,u_sat); l=clamp(l,0.,1.);
  x+=(u_sh-.502)*(1.-l)*(1.-l)*.9+(u_hi-.502)*l*l*.9; x=x*(1.-u_fade*.3)+u_fade*.16; o=vec4(clamp(x,0.,1.),c.a); }`],
  duotone: ['amount*=1:0:1 contrast=1:0.5:3 mid=0.5:0.15:0.85 c1=#14143c c2=#e8466e c3=#fff2c8', `
void main(){ vec4 c=TA(vUV); float l=clamp((lum(c.rgb)-.5)*u_contrast+.5,0.,1.); vec3 d=l<u_mid?mix(u_c1,u_c2,l/u_mid):mix(u_c2,u_c3,(l-u_mid)/(1.-u_mid)); o=vec4(mix(c.rgb,d,u_amount),c.a); }`],
  hueshift: ['amount*=1:0:1 from=0.33:0:1 to=0.92:0:1 width=0.16:0.02:0.5 sat=1.2:0:2.5', `
void main(){ vec4 c=TA(vUV); vec3 h=tohsv(c.rgb); float d=abs(fract(h.x-u_from+.5)-.5); float m=smoothstep(u_width,u_width*.4,d)*u_amount*smoothstep(.04,.22,h.y);
  vec3 a=hsv(fract(u_to+(h.x-u_from)),min(1.,h.y*u_sat),h.z); o=vec4(mix(c.rgb,a,m),c.a); }`],
  hue: ['shift*=0:0:1 sat=1:0:3 val=1:0:2', `
void main(){ vec4 c=TA(vUV); float a=u_shift*6.28318; vec3 k=vec3(.57735); vec3 x=c.rgb*cos(a)+cross(k,c.rgb)*sin(a)+k*dot(k,c.rgb)*(1.-cos(a)); float l=lum(x); o=vec4(mix(vec3(l),x,u_sat)*u_val,c.a); }`],
  mixer: ['r=#ff0000 g=#00ff00 b=#0000ff', `void main(){ vec4 c=TA(vUV); o=vec4(clamp(c.r*u_r+c.g*u_g+c.b*u_b,0.,1.),c.a); }`],
  tint: ['gain*=1:0:4 c=#ffffff', `void main(){ vec4 c=TA(vUV); o=vec4(c.rgb*u_c*u_gain,c.a); }`],
  solar: ['thresh*=0.5:0:1 soft=0.25:0:1', `void main(){ vec4 c=TA(vUV); float t=smoothstep(u_thresh-u_soft*.5,u_thresh+u_soft*.5+1e-4,lum(c.rgb)); o=vec4(mix(c.rgb,1.-c.rgb,t),c.a); }`],
  poster: ['levels*=5:2:16 dither=0.5:0:1 px=1:1:24 gamma=1:0.4:2.5 sat=1:0:2', `
void main(){ float s=max(1.,u_px*RS()); vec2 p=floor(vUV*uRes/s); vec4 c=TA((p+.5)*s/uRes); vec3 x=pow(max(c.rgb,0.),vec3(u_gamma)); float l=lum(x); x=mix(vec3(l),x,u_sat);
  float n=u_levels-1.; x=floor(x*n+.5+(bayer(p)-.5)*u_dither)/n; o=vec4(clamp(x,0.,1.),1.); }`],
  palette4: ['px*=4:1:16 dither=0.6:0:1 contrast=1.2:0.5:3 p0=#10300f p1=#2f6030 p2=#86a81a p3=#c4d64a', `
void main(){ float s=max(1.,u_px*RS()); vec2 p=floor(vUV*uRes/s); vec3 c=TA((p+.5)*s/uRes).rgb; float l=clamp((lum(c)-.5)*u_contrast+.5,0.,1.);
  float q=clamp(floor(l*3.+.5+(bayer(p)-.5)*u_dither),0.,3.); o=vec4(q<.5?u_p0:q<1.5?u_p1:q<2.5?u_p2:u_p3,1.); }`],
  thermal: ['gain*=1:0.4:3 bias=0:-0.5:0.5 mode=0:0:3', `
vec3 pal(float t,float m){ t=clamp(t,0.,1.);
  if(m<.5){ vec3 c=mix(vec3(0.,0.,.08),vec3(.35,0.,.55),smoothstep(0.,.25,t)); c=mix(c,vec3(.9,.1,.2),smoothstep(.2,.5,t)); c=mix(c,vec3(1.,.6,0.),smoothstep(.45,.72,t)); c=mix(c,vec3(1.,.95,.3),smoothstep(.68,.88,t)); return mix(c,vec3(1.),smoothstep(.86,1.,t)); }
  if(m<1.5) return hsv(.72*(1.-t),1.,.25+.75*smoothstep(0.,.3,t));
  if(m<2.5) return mix(mix(vec3(.02,.03,.12),vec3(.1,.45,.9),smoothstep(0.,.55,t)),vec3(.95,1.,1.),smoothstep(.5,1.,t));
  return vec3(.12,1.,.3)*t*1.15+vec3(.55)*smoothstep(.82,1.,t); }
void main(){ o=vec4(pal(lum(TA(vUV).rgb)*u_gain+u_bias,u_mode),1.); }`],
  popquad: ['contrast*=1.5:0.5:3', `
void main(){ vec2 t=floor(vUV*2.), u=fract(vUV*2.); float id=t.x+t.y*2.; float l=clamp((lum(TA(u).rgb)-.5)*u_contrast+.5,0.,1.); float h=id<.5?.95:id<1.5?.14:id<2.5?.55:.33;
  o=vec4(l<.33?hsv(fract(h+.5),.85,.28):l<.66?hsv(h,.85,.95):hsv(fract(h+.1),.25,1.),1.); }`],
  /* ---- texture / film ---- */
  grain: ['amount*=0.14:0:0.6 size=1.6:1:6 color=0.2:0:1 luma=0.6:0:1 speed=1:0:1', `
void main(){ vec4 c=TA(vUV); float s=max(1.,u_size*RS()); vec2 p=floor(vUV*uRes/s); float t=u_speed>0.?floor(mod(uTime*24.,997.)):0.;
  vec3 n=vec3(h13(vec3(p,t)),h13(vec3(p+17.,t+3.)),h13(vec3(p+41.,t+7.)))-.5; n=n*.75+(h13(vec3(floor(p*.5),t+11.))-.5)*.5; n=mix(n.xxx,n,u_color);
  float l=clamp(lum(c.rgb),0.,1.); o=vec4(c.rgb+n*u_amount*mix(1.,.3+2.8*l*(1.-l),u_luma)*1.6,c.a); }`],
  vignette: ['amount*=0.5:0:1.5 radius=0.72:0.1:1.5 soft=0.4:0.02:1 round=0.6:0:1 tint=#000000', `
void main(){ vec4 c=TA(vUV); vec2 d=(vUV-.5)*2.; float a=uRes.x/uRes.y; d*=mix(vec2(1.),a>1.?vec2(a,1.):vec2(1.,1./a),u_round);
  float v=smoothstep(u_radius-u_soft,u_radius+u_soft,length(d)/1.4142)*u_amount; o=vec4(mix(c.rgb,u_tint,clamp(v,0.,1.)),c.a); }`],
  dust: ['density*=0.5:0:1 scratch=0.5:0:1 flicker=0.08:0:0.5 speed=1:0:2', `
void main(){ vec4 c=TA(vUV); float t=floor(uTime*16.*u_speed); vec3 x=c.rgb*(1.+(h13(vec3(t,1.,2.))-.5)*u_flicker);
  vec2 q=vUV*ASP()*7.; vec2 id=floor(q), f=fract(q); float r0=h13(vec3(id,t));
  if(r0<u_density*.07){ vec2 pp=h22(id+t)*.8+.1; float rad=.015+.05*h13(vec3(id,t+9.)); float d=length((f-pp)*vec2(1.,1.+2.*h13(vec3(id,t+5.)))); x=mix(x,r0<u_density*.045?vec3(.04):vec3(.95),smoothstep(rad,rad*.4,d)*.85); }
  for(int i=0;i<3;i++){ float fi=float(i), ts=floor(uTime*(1.5+fi)*u_speed); float on=step(1.-u_scratch*.5,h13(vec3(fi,ts,4.))); float sx=h13(vec3(fi,ts,8.))+sin(vUV.y*6.+fi)*.004;
    x+=smoothstep(1.8/uRes.x,0.,abs(vUV.x-sx))*on*(.4+.6*h13(vec3(floor(vUV.y*40.),t,fi)))*.55; }
  o=vec4(x,c.a); }`],
  leak: ['amount*=0.7:0:2 speed=0.12:0:1 scale=1.1:0.3:4 edge=0.6:0:1 c1=#ff4a12 c2=#ffc46b', `
void main(){ vec4 c=TA(vUV); vec2 p=vUV*ASP(); float t=uTime*u_speed; float n=gn(vec3(p*u_scale,t))*.5+.5, n2=gn(vec3(p*u_scale*.6+9.,t*.7))*.5+.5;
  float m=smoothstep(.35,.75,n*.6+n2*.6), e=mix(1.,smoothstep(.15,1.,abs(vUV.x-.5)*2.+(n2-.5)*.5),u_edge); vec3 L=clamp(mix(u_c1,u_c2,n2)*m*e*u_amount,0.,1.); o=vec4(1.-(1.-c.rgb)*(1.-L),c.a); }`],
  paper: ['amount*=0.6:0:1 scale=1:0.3:4 tint=#f4eee0', `
void main(){ vec4 c=TA(vUV); vec2 q=vUV*uRes/(700.*u_scale*RS()); float n=gn(vec3(q*3.,1.))*.5+gn(vec3(q*45.,3.))*.25+(h21(floor(vUV*uRes/max(1.,RS())))-.5)*.12; o=vec4(mix(c.rgb,c.rgb*u_tint*(.9+n*.14),u_amount),c.a); }`],
  scanlines: ['amount*=0.35:0:1 count=260:40:1200 roll=0:-3:3 soft=0.5:0:1', `
void main(){ vec4 c=TA(vUV); float s=.5+.5*cos((vUV.y*u_count+uTime*u_roll*8.)*6.28318); s=mix(step(.5,s),s,u_soft); o=vec4(c.rgb*(1.-u_amount*(1.-s)),c.a); }`],
  crt: ['curve*=0.18:0:0.6 scan=0.45:0:1 mask=0.35:0:1 lines=280:80:900 conv=0.0015:0:0.008 vig=0.5:0:1 bright=1.25:0.8:2', `
void main(){ vec2 d=vUV-.5; float r2=dot(d,d); vec2 u=.5+d*(1.+u_curve*r2*1.6)/(1.+u_curve*.4);
  if(u.x<0.||u.x>1.||u.y<0.||u.y>1.){ o=vec4(0.,0.,0.,1.); return; }
  vec3 c=vec3(TA(u+vec2(u_conv,0.)).r,TA(u).g,TA(u-vec2(u_conv,0.)).b); float s=.5+.5*cos(u.y*u_lines*6.28318); c*=1.-u_scan*(1.-s)*(1.-.5*lum(c));
  float mx=mod(gl_FragCoord.x,3.); c*=mix(vec3(1.),mx<1.?vec3(1.,.55,.55):mx<2.?vec3(.55,1.,.55):vec3(.55,.55,1.),u_mask); o=vec4(c*u_bright*(1.-u_vig*pow(r2*2.,1.5)),1.); }`],
  vhs: ['bleed*=0.006:0:0.03 noise=0.18:0:0.8 wobble=0.0015:0:0.01 track=0.5:0:1 sat=1.2:0:2.5 soft=1.5:0:5', `
vec3 yiq(vec3 c){ return vec3(dot(c,vec3(.299,.587,.114)),dot(c,vec3(.596,-.274,-.322)),dot(c,vec3(.211,-.523,.312))); }
vec3 rgbq(vec3 y){ return vec3(y.x+.956*y.y+.621*y.z,y.x-.272*y.y-.647*y.z,y.x-1.106*y.y+1.703*y.z); }
void main(){ vec2 u=vUV; float t=uTime, row=floor(u.y*uRes.y/2.);
  u.x+=sin(u.y*31.+t*2.3)*u_wobble+(h13(vec3(row,floor(t*30.),1.))-.5)*u_wobble*1.5;
  float band=smoothstep(.06,0.,abs(u.y-fract(t*.07+.3)))*u_track; u.x+=band*(h13(vec3(row,floor(t*60.),2.))-.5)*.08;
  u.x+=smoothstep(.035,0.,u.y)*u_track*(.02+.03*sin(t*50.+u.y*300.));
  float px=u_soft/uRes.x; vec3 a=yiq((TA(u).rgb*2.+TA(u+vec2(px,0.)).rgb+TA(u-vec2(px,0.)).rgb)*.25);
  vec3 ch=vec3(0.); for(int i=0;i<5;i++) ch+=yiq(TA(u+vec2(u_bleed*(float(i)*.5-.4),0.)).rgb); a.yz=ch.yz/5.*u_sat;
  float n=h13(vec3(floor(u.x*uRes.x/3.),row,floor(t*30.)))-.5; a.x+=n*u_noise*.35+band*n*.6;
  a.x+=step(1.-.004*u_track-band*.05,h13(vec3(row,floor(t*24.),5.)))*step(h13(vec3(row,7.,floor(t*24.))),u.x)*.5;
  o=vec4(clamp(rgbq(a)*.92+.03,0.,1.),1.); }`],
  bars: ['bars*=0.11:0:0.45', `void main(){ vec4 c=TA(vUV); o=vec4(c.rgb*step(u_bars,vUV.y)*step(vUV.y,1.-u_bars),1.); }`],
  sharpen: ['amount*=1:0:4 radius=1.5:0.5:6', `
void main(){ vec2 e=u_radius*RS()/uRes; vec4 c=TA(vUV); vec3 b=(TA(vUV+vec2(e.x,0.)).rgb+TA(vUV-vec2(e.x,0.)).rgb+TA(vUV+vec2(0.,e.y)).rgb+TA(vUV-vec2(0.,e.y)).rgb)*.25; o=vec4(c.rgb+(c.rgb-b)*u_amount,c.a); }`],
  /* ---- optics ---- */
  dirblur: ['len*=0.08:0:0.5 angle=0:0:180 decay=1:0:4 gain=1:0:4', `
void main(){ float a=radians(u_angle); vec2 d=vec2(cos(a),sin(a)*uRes.x/uRes.y)*u_len; vec4 s=vec4(0.); float ws=0.;
  for(int i=-14;i<=14;i++){ float t=float(i)/14., w=exp(-abs(t)*u_decay*2.); s+=TA(vUV+d*t)*w; ws+=w; } o=s/ws*u_gain; }`],
  zoom: ['amount*=0.18:0:0.8 cx=0.5:0:1 cy=0.5:0:1 gain=1:0:3', `
void main(){ vec2 c=vec2(u_cx,u_cy), d=vUV-c; float j=h13(vec3(gl_FragCoord.xy,1.)); vec4 s=vec4(0.); for(int i=0;i<28;i++) s+=TA(c+d*(1.-u_amount*(float(i)+j)/28.)); o=s/28.*u_gain; }`],
  bokeh: ['radius*=10:0:40 boost=3:0:10', `
void main(){ float R=u_radius*RS(); vec3 acc=vec3(0.); float ws=0.; for(int i=0;i<48;i++){ float fi=float(i), r=sqrt((fi+.5)/48.)*R, a=fi*2.39996; vec3 c=TA(vUV+vec2(cos(a),sin(a))*r/uRes).rgb; float w=1.+u_boost*pow(lum(c),4.); acc+=c*w; ws+=w; } o=vec4(acc/ws,1.); }`],
  focus: ['width*=0.16:0:0.6 pos=0.5:0:1 soft=0.2:0.01:0.6 radial=0:0:1', `
void main(){ float d=mix(abs(vUV.y-u_pos),length((vUV-vec2(.5,u_pos))*ASP()),u_radial); o=mix(TA(vUV),texture(B,vUV),smoothstep(u_width,u_width+u_soft,d)); }`],
  chroma: ['amount*=0.008:0:0.06 radial=1:0:1 angle=0:0:360 spectral=0:0:1', `
void main(){ float a=radians(u_angle); vec2 dir=mix(vec2(cos(a),sin(a)),(vUV-.5)*2.,u_radial)*u_amount;
  if(u_spectral<.5){ o=vec4(TA(vUV+dir).r,TA(vUV).g,TA(vUV-dir).b,1.); return; }
  vec3 s=vec3(0.),ws=vec3(0.); for(int i=0;i<12;i++){ float t=float(i)/11.; vec3 w=clamp(1.-abs(t-vec3(1.,.5,0.))*2.,0.,1.); s+=TA(vUV+dir*(t*2.-1.)).rgb*w; ws+=w; } o=vec4(s/ws,1.); }`],
  prism: ['amount*=0.035:0:0.2 n=6:3:8 rot=0:0:6.28 spin=0.2:-2:2', `
void main(){ vec3 s=vec3(0.); float n=floor(u_n); for(int i=0;i<8;i++){ if(float(i)>=n) break; float a=float(i)/n*6.28318+u_rot+u_spin*uTime; s+=TA(mir(vUV+vec2(cos(a),sin(a)*uRes.x/uRes.y)*u_amount)).rgb*hsv(float(i)/n,.85,1.); } o=vec4(s*1.8/n,1.); }`],
  thinfilm: ['amount*=0.7:0:1.5 scale=3:0.5:10 speed=0.25:0:2', `
void main(){ vec4 c=TA(vUV); vec3 g=sobel(vUV,2.*RS()); float l=lum(c.rgb); float ph=l*u_scale+atan(g.y,g.x+1e-5)*.16+g.z*.8+uTime*u_speed; vec3 ir=.5+.5*cos(6.28318*(ph+vec3(0.,.33,.67)));
  o=vec4(mix(c.rgb,c.rgb*.4+ir*(.35+l*.9),clamp(u_amount*(.35+g.z*1.5),0.,1.)),1.); }`],
  lights: ['amount*=1:0:2 speed=0.5:0:3 size=0.35:0.1:1 sat=0.9:0:1 ambient=0.25:0:1', `
void main(){ vec4 c=TA(vUV); vec2 p=(vUV-.5)*ASP(); vec3 L=vec3(u_ambient); float t=uTime*u_speed;
  for(int i=0;i<5;i++){ float fi=float(i); vec2 q=.45*ASP()*vec2(sin(t*(.7+fi*.23)+fi*2.1),cos(t*(.9-fi*.17)+fi*1.3)); float d=length(p-q)/u_size; L+=hsv(fract(fi*.21+t*.05),u_sat,1.)*exp(-d*d*2.)*u_amount; } o=vec4(c.rgb*L,1.); }`],
  /* ---- line / print ---- */
  edges: ['strength*=2:0:12 thick=1:0.5:4 thresh=0.06:0:0.6 invert=0:0:1 color=0:0:1', `
void main(){ vec3 g=sobel(vUV,u_thick*RS()); float e=smoothstep(u_thresh,u_thresh+.2,g.z*u_strength*.5); vec3 c=mix(vec3(e),TA(vUV).rgb*e*1.6,u_color); o=vec4(mix(c,1.-c,u_invert),1.); }`],
  dog: ['sharp*=22:1:80 eps=0.01:-0.1:0.2 tau=0.98:0.8:1 ink=#17130f paper=#f2ecdf', `
void main(){ float d=lum(TA(vUV).rgb)-u_tau*lum(texture(B,vUV).rgb); float e=d>u_eps?1.:1.+tanh(u_sharp*(d-u_eps)); o=vec4(mix(u_ink,u_paper,clamp(e,0.,1.)),1.); }`],
  colorize: ['gain*=1.5:0:5 h0=0:0:1 range=0.6:0:2 speed=0.1:-1:1 sat=0.9:0:1', `
void main(){ vec4 c=TA(vUV); o=vec4(hsv(fract(u_h0+u_range*(vUV.x*.6+vUV.y*.4)+uTime*u_speed),u_sat,1.)*max(c.r,max(c.g,c.b))*u_gain,1.); }`],
  contour: ['levels*=8:2:30 width=1.2:0.5:4 fill=0.15:0:1 ink=#f2efe9 bg=#0c0c0d', `
void main(){ vec3 c=TA(vUV).rgb; float v=lum(c)*u_levels; float d=abs(fract(v-.5)-.5)/(fwidth(v)+1e-4); o=vec4(mix(mix(u_bg,c,u_fill),u_ink,1.-smoothstep(u_width*.5,u_width,d)),1.); }`],
  blueprint: ['grid=28:8:80 bg=#0d3b8e line=#eaf2ff', `
void main(){ float e=TA(vUV).r; vec2 p=vUV*uRes/(u_grid*RS()); vec2 f=abs(fract(p)-.5), f5=abs(fract(p/5.)-.5); float gl=smoothstep(.47,.5,max(f.x,f.y))*.18+smoothstep(.49,.5,max(f5.x,f5.y))*.2;
  o=vec4(mix(u_bg*(1.-.25*length(vUV-.5))+gl*u_line,u_line,clamp(e,0.,1.)),1.); }`],
  halftone: ['scale*=7:3:40 angle=0.4:0:1.57 soft=0.2:0.02:0.8 mode=0:0:2 gain=1:0.4:2.5 ink=#161412 paper=#f1ece2', `
float dotc(vec2 px,float ang,float sc,out vec2 suv){ vec2 p=rot(ang)*px/sc; suv=(rot(-ang)*((floor(p)+.5)*sc))/uRes; return length(fract(p)-.5); }
void main(){ float sc=u_scale*RS(); vec2 px=vUV*uRes, suv; float w=u_soft*.2;
  if(u_mode<.5){ float d=dotc(px,u_angle,sc,suv); float r=sqrt(1.-clamp(lum(TA(suv).rgb)*u_gain,0.,1.))*.74; o=vec4(mix(u_paper,u_ink,smoothstep(r+w,r-w,d)),1.); }
  else if(u_mode<1.5){ vec3 oc=u_paper; float angs[4]=float[4](.2618,1.309,0.,.7854); vec3 inks[4]=vec3[4](vec3(0.,.62,.86),vec3(.86,.05,.5),vec3(.98,.9,.05),vec3(.08));
    for(int i=0;i<4;i++){ float d=dotc(px,angs[i]+u_angle,sc,suv); vec3 c=clamp(TA(suv).rgb*u_gain,0.,1.); float k=1.-max(c.r,max(c.g,c.b)); vec3 cmy=(1.-c-k)/max(1.-k,1e-3);
      float v=i==0?cmy.x:i==1?cmy.y:i==2?cmy.z:k; float r=sqrt(clamp(v,0.,1.))*.74; oc=mix(oc,oc*inks[i],smoothstep(r+w,r-w,d)); } o=vec4(oc,1.); }
  else { float d=dotc(px,0.,sc,suv); vec3 c=TA(suv).rgb*u_gain; o=vec4(c*1.35*smoothstep(.44+w,.44-w,d),1.); } }`],
  linescreen: ['freq*=90:20:320 angle=0.5:-1.57:1.57 contrast=1.3:0.5:3 wave=0:0:1 ink=#12100e paper=#efe9dc', `
void main(){ vec2 p=(vUV-.5)*ASP(); vec2 n=vec2(-sin(u_angle),cos(u_angle)); float v=dot(p,n)*u_freq+u_wave*sin(dot(p,vec2(n.y,-n.x))*18.)*1.2;
  float l=clamp((lum(TA(vUV).rgb)-.5)*u_contrast+.5,0.,1.), s=abs(fract(v)-.5)*2., w=1.-l, aa=fwidth(v)*1.5+.02; o=vec4(mix(u_paper,u_ink,smoothstep(w+aa,w-aa,s)),1.); }`],
  hatch: ['freq*=120:30:320 contrast=1.2:0.5:3 wobble=0.4:0:1 ink=#1b1814 paper=#f3eee2', `
float ln(vec2 p,float a,float f,float th){ float v=dot(p,vec2(-sin(a),cos(a)))*f; float s=abs(fract(v)-.5)*2., aa=fwidth(v)*1.5+.02; return smoothstep(th+aa,th-aa,s); }
void main(){ vec2 p=(vUV-.5)*ASP(); p+=u_wobble*.004*vec2(gn(vec3(p*9.,1.)),gn(vec3(p*9.,5.))); float l=clamp((lum(TA(vUV).rgb)-.5)*u_contrast+.5,0.,1.);
  float m=ln(p,.785,u_freq,.32)*step(l,.82); m=max(m,ln(p,-.785,u_freq,.32)*step(l,.6)); m=max(m,ln(p,0.,u_freq*1.1,.36)*step(l,.4)); m=max(m,ln(p,1.571,u_freq*1.1,.4)*step(l,.22)); m=max(m,step(l,.08));
  o=vec4(mix(u_paper,u_ink,m),1.); }`],
  dither: ['px*=2:1:10 contrast=1.1:0.5:3 bias=0:-0.5:0.5 mode=0:0:1 c0=#101010 c1=#ebe6da', `
void main(){ float s=max(1.,u_px*RS()); vec2 p=floor(vUV*uRes/s); float l=clamp((lum(TA((p+.5)*s/uRes).rgb)-.5)*u_contrast+.5+u_bias,0.,1.); o=vec4(l>(u_mode<.5?bayer(p):h21(p))?u_c1:u_c0,1.); }`],
  riso: ['offset*=0.006:0:0.03 grain=0.5:0:1 scale=1.6:1:6 c1=#ff4f8b c2=#2747d9 paper=#f3ecdc', `
void main(){ float s=max(1.,u_scale*RS()); vec2 p=floor(vUV*uRes/s); vec3 a=TA(vUV).rgb, b=TA(vUV+vec2(u_offset,-u_offset*.6)).rgb;
  float d1=1.-smoothstep(.15,.95,a.r*.6+lum(a)*.4), d2=1.-smoothstep(.05,.8,lum(b)); d1=mix(d1,step(h21(p),d1),u_grain); d2=mix(d2,step(h21(p+31.),d2*.9),u_grain);
  o=vec4(u_paper*mix(vec3(1.),u_c1,d1*.9)*mix(vec3(1.),u_c2,d2*.95),1.); }`],
  stipple: ['cell*=7:3:26 jitter=0.7:0:1 color=0:0:1 gain=1:0.4:2.5 ink=#191919 paper=#f4efe4', `
void main(){ float s=u_cell*RS(); vec2 p=vUV*uRes/s, ip=floor(p); float m=0.; vec3 col=u_ink;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 n=ip+vec2(float(i),float(j)); vec2 pt=n+.5+(h22(n)-.5)*u_jitter; vec3 c=TA(pt*s/uRes).rgb; float r=sqrt(1.-clamp(lum(c)*u_gain,0.,1.))*.62;
    float k=smoothstep(r,r-.12,length(p-pt)); if(k>m){ m=k; col=mix(u_ink,c*.9,u_color); } } o=vec4(mix(u_paper,col,m),1.); }`],
  dotgrid: ['cell*=7:3:24 gain=2.5:0:10 c1=#00ffa8 c2=#eafff6', `
void main(){ float s=u_cell*RS(); vec2 p=vUV*uRes/s; vec2 f=fract(p)-.5; vec2 cu=(floor(p)+.5)*s/uRes; float e=clamp(sobel(cu,1.5*RS()).z*u_gain,0.,1.); float r=.12+.38*e;
  o=vec4(mix(u_c1,u_c2,lum(TA(cu).rgb))*smoothstep(r,r-.12,length(f))*(.15+e),1.); }`],
  ascii: ['cell*=11:6:36 color=0:0:1 gain=1.3:0.5:3 fg=#3dff7a bg=#020704', GLY + `
void main(){ float ch=u_cell*RS(); vec2 cs=vec2(ch*.72,ch); vec2 p=vec2(vUV.x,1.-vUV.y)*uRes; vec2 id=floor(p/cs), f=fract(p/cs); vec3 c=TA(vec2((id.x+.5)*cs.x/uRes.x,1.-(id.y+.5)*cs.y/uRes.y)).rgb;
  int i=int(clamp(floor(clamp(lum(c)*u_gain,0.,1.)*12.),0.,11.)); o=vec4(mix(u_bg,mix(u_fg,c*1.4+.1,u_color),glyph(i,f)),1.); }`],
  matrix: ['cell*=13:6:36 speed=1:0:4 gain=1.8:0.3:4 fg=#4dff88', GLY + `
void main(){ float ch=u_cell*RS(); vec2 cs=vec2(ch*.72,ch); vec2 p=vec2(vUV.x,1.-vUV.y)*uRes; vec2 id=floor(p/cs), f=fract(p/cs); float rows=uRes.y/cs.y;
  float sp=(.35+h21(vec2(id.x,3.)))*u_speed; float dist=fract(h21(vec2(id.x,9.))+uTime*sp*.12)*(rows*1.4)-id.y; if(dist<0.) dist+=rows*1.4;
  float l=lum(TA(vec2((id.x+.5)*cs.x/uRes.x,1.-(id.y+.5)*cs.y/uRes.y)).rgb); int gi=1+int(floor(h13(vec3(id,floor(uTime*(2.+6.*h21(id)))))*10.99));
  vec3 col=u_fg*(exp(-dist*.14)*.8+.1+smoothstep(.12,.75,l)*.75)*(.3+l*u_gain); col=mix(col,vec3(.85,1.,.9),step(dist,1.)*.8); o=vec4(col*glyph(gi,f),1.); }`],
  /* ---- stylise ---- */
  pixelate: ['px*=14:2:90 mode=0:0:3 gap=0:0:0.5 stud=0:0:1 round=0:0:1', `
void main(){ float s=u_px*RS(); vec2 p=vUV*uRes/s, cuv, f; float edge;
  if(u_mode<.5){ f=fract(p)-.5; cuv=floor(p)+.5; edge=max(abs(f.x),abs(f.y))*2.; }
  else if(u_mode<1.5){ vec2 r=vec2(1.,1.7320508), h=r*.5; vec2 a=mod(p,r)-h, b=mod(p-h,r)-h; f=dot(a,a)<dot(b,b)?a:b; cuv=p-f; edge=max(abs(f.x),abs(f.x)*.5+abs(f.y)*.866025)*2.; }
  else if(u_mode<2.5){ vec2 q=vec2(p.x-p.y*.57735,p.y*1.1547), fr=fract(q); float up=step(1.,fr.x+fr.y); vec2 cq=floor(q)+mix(vec2(1./3.),vec2(2./3.),up); cuv=vec2(cq.x+cq.y*.5,cq.y*.866025);
    f=p-cuv; edge=1.-3.*(up>.5?min(min(1.-fr.x,1.-fr.y),fr.x+fr.y-1.):min(min(fr.x,fr.y),1.-fr.x-fr.y)); }
  else { float odd=mod(floor(p.y),2.); vec2 q=vec2(p.x*.5+odd*.5,p.y); f=fract(q)-.5; cuv=vec2((floor(q.x)+.5-odd*.5)*2.,floor(q.y)+.5); edge=max(abs(f.x),abs(f.y))*2.; }
  vec3 c=TA(cuv*s/uRes).rgb; c*=1.-smoothstep(1.-u_gap,1.-u_gap*.5,edge)*step(.001,u_gap); c*=mix(1.,smoothstep(.98,.8,length(f)*2.),u_round);
  float d=length(f); c*=1.+u_stud*((smoothstep(.34,.3,d)-smoothstep(.3,.26,d))*dot(normalize(f+1e-4),vec2(-.707,.707))*.4+smoothstep(.32,.28,d)*.1); o=vec4(c,1.); }`],
  kuwahara: ['radius*=3:1:6 step=1.5:0.5:4', `
void main(){ int R=int(u_radius); vec2 st=u_step*RS()/uRes; vec3 m[4]; vec3 q[4]; for(int k=0;k<4;k++){ m[k]=vec3(0.); q[k]=vec3(0.); }
  for(int j=-6;j<=6;j++) for(int i=-6;i<=6;i++){ if(abs(i)>R||abs(j)>R) continue; vec3 c=TA(vUV+vec2(float(i),float(j))*st).rgb, cc=c*c;
    if(i<=0&&j<=0){ m[0]+=c; q[0]+=cc; } if(i>=0&&j<=0){ m[1]+=c; q[1]+=cc; } if(i<=0&&j>=0){ m[2]+=c; q[2]+=cc; } if(i>=0&&j>=0){ m[3]+=c; q[3]+=cc; } }
  float n=float((R+1)*(R+1)), best=1e9; vec3 res=vec3(0.); for(int k=0;k<4;k++){ vec3 mu=m[k]/n, v=abs(q[k]/n-mu*mu); float sg=v.r+v.g+v.b; if(sg<best){ best=sg; res=mu; } } o=vec4(res,1.); }`],
  toon: ['levels*=4:2:10 edge=2:0:8 thresh=0.25:0:1 sat=1.3:0:2.5 ink=#0e0e10', `
void main(){ vec3 h=tohsv(TA(vUV).rgb); h.z=floor(h.z*u_levels+.5)/u_levels; vec3 q=hsv(h.x,min(1.,h.y*u_sat),h.z); o=vec4(mix(q,u_ink,smoothstep(u_thresh,u_thresh+.25,sobel(vUV,1.5*RS()).z*u_edge*.5)),1.); }`],
  cutout: ['levels*=5:2:9 shadow=0.4:0:1 dist=4:0:16 sat=1.2:0:2', `
float lv(vec2 u){ return floor(lum(TA(u).rgb)*u_levels); }
void main(){ vec3 q=floor(TA(vUV).rgb*u_levels+.5)/u_levels; float l=lum(q); q=mix(vec3(l),q,u_sat); float a=lv(vUV), b=lv(vUV+vec2(-1.,1.)*u_dist*RS()/uRes);
  o=vec4(q*(1.-step(a+.5,b)*u_shadow*.55)+step(b+.5,a)*u_shadow*.05,1.); }`],
  voronoi: ['cell*=30:8:140 edge=0.08:0:0.4 jitter=0.9:0:1 speed=0:0:1 shade=0.35:0:1 lead=#0b0b0c', VORO + `
void main(){ float s=u_cell*RS(), d1, d2; vec2 best; voro(vUV*uRes/s,u_jitter,u_speed,d1,d2,best); vec3 c=TA(best*s/uRes).rgb; c*=(1.-u_shade*d1*.9)*(1.+.25*(h21(floor(best*7.))-.5)*u_shade);
  o=vec4(mix(c,u_lead,smoothstep(u_edge,u_edge*.45,d2-d1)*step(.001,u_edge)),1.); }`],
  shards: ['amount*=0.06:0:0.3 cell=110:20:400 edge=0.5:0:1 spin=0.2:0:1', VORO + `
void main(){ float s=u_cell*RS(), d1, d2; vec2 best; voro(vUV*uRes/s,1.,0.,d1,d2,best); vec2 r=h22(floor(best*3.1)); vec2 cu=best*s/uRes;
  vec2 u=cu+rot((r.x-.5)*u_spin)*(vUV-cu)+(r-.5)*u_amount*2.; o=vec4(TA(mir(u)).rgb*(.85+.3*r.y)+smoothstep(.06,0.,d2-d1)*u_edge*.5,1.); }`],
  emboss: ['strength*=2.5:0:10 angle=0.8:0:6.28 mix=1:0:1', `
void main(){ vec2 d=vec2(cos(u_angle),sin(u_angle))*RS()*1.5/uRes; vec4 c=TA(vUV); float e=(lum(TA(vUV+d).rgb)-lum(TA(vUV-d).rgb))*u_strength; o=vec4(mix(c.rgb+e,vec3(.5+e),u_mix),1.); }`],
  /* ---- glitch ---- */
  blockglitch: ['amount*=0.45:0:1 block=0.09:0.01:0.4 speed=7:0:30 shift=0.06:0:0.4 rgb=0.012:0:0.06', `
void main(){ float t=floor(uTime*u_speed); vec2 u=vUV; vec2 b1=floor(u/vec2(u_block*2.5,u_block)); float on1=step(h13(vec3(b1,t)),u_amount*.3); u.x+=on1*(h13(vec3(b1,t+1.7))-.5)*u_shift*2.;
  vec2 b2=floor(u/vec2(u_block*.5,u_block*.25)); float on2=step(h13(vec3(b2,t+5.)),u_amount*.12); u+=on2*(h22(b2+t)-.5)*u_shift;
  float sp=u_rgb*(on1+on2*2.+u_amount*.3*step(.93,h13(vec3(t,2.,3.)))); vec3 c=vec3(TA(u+vec2(sp,0.)).r,TA(u).g,TA(u-vec2(sp,0.)).b);
  c=mix(c,floor(c*3.)/3.,step(h13(vec3(b2,t+9.)),u_amount*.05)); o=vec4(mix(c,1.-c,step(h13(vec3(b1,t+13.)),u_amount*.03)),1.); }`],
  tear: ['amount*=0.04:0:0.3 band=0.05:0.004:0.4 speed=4:0:24 roll=0:0:1 fine=0.3:0:1', `
void main(){ vec2 u=vUV; float t=floor(uTime*u_speed); u.y=fract(u.y+u_roll*uTime*.25); float id=floor(u.y/u_band); u.x+=step(.55,h13(vec3(id,t,1.)))*(h13(vec3(id,t,2.))-.5)*u_amount*2.;
  u.x+=(h13(vec3(floor(u.y*uRes.y),floor(uTime*60.),3.))-.5)*u_amount*.15*u_fine; o=TA(vec2(fract(u.x),u.y)); }`],
  jpeg: ['block*=10:4:40 q=5:2:24 chroma=2:1:4', `
void main(){ float bs=u_block*RS(); vec2 p=vUV*uRes, b=floor(p/bs), f=fract(p/bs); vec3 dc=TA((b+.5)*bs/uRes).rgb, ac=TA((b+(floor(f*2.)+.5)*.5)*bs/uRes).rgb;
  float y=floor(lum(mix(dc,ac,.75))*u_q+.5)/u_q; float cb=bs*u_chroma; vec3 cc=TA((floor(p/cb)+.5)*cb/uRes).rgb; vec3 c=mix(vec3(y),cc/max(lum(cc),1e-3)*y,.9);
  o=vec4(clamp(c-(1.-smoothstep(0.,.12,min(f.x,f.y)))*.04,0.,1.),1.); }`],
  interlace: ['amount*=1:0:1 lines=2:1:6', `void main(){ o=mix(TA(vUV),texture(B,vUV),mod(floor(gl_FragCoord.y/max(1.,u_lines*RS())),2.)*u_amount); }`],
  pixelstretch: ['thresh*=0.55:0:1 len=0.35:0:1 dir=0:0:1 invert=0:0:1', `
bool msk(vec3 c){ float l=lum(c); return u_invert>.5?l<u_thresh:l>u_thresh; }
void main(){ vec2 d=u_dir<.5?vec2(0.,1.):vec2(1.,0.); float st=u_len/48.; vec3 c=TA(vUV).rgb;
  if(msk(c)){ for(int i=1;i<=48;i++){ vec2 q=vUV-d*st*float(i); if(q.x<0.||q.y<0.||q.x>1.||q.y>1.) break; vec3 s=TA(q).rgb; if(!msk(s)) break; c=s; } } o=vec4(c,1.); }`],
  static: ['amount*=0.5:0:1 size=2:1:8 bars=0:0:1 color=0.1:0:1', `
void main(){ vec4 c=TA(vUV); float s=max(1.,u_size*RS()); vec2 p=floor(vUV*uRes/s); float t=floor(uTime*30.); vec3 n=vec3(h13(vec3(p,t)),h13(vec3(p,t+1.)),h13(vec3(p,t+2.))); n=mix(n.xxx,n,u_color);
  o=vec4(mix(mix(c.rgb,hsv(floor(vUV.x*7.)/7.,.9,.9-.25*step(vUV.y,.25)),u_bars),n,u_amount),1.); }`],
  holo: ['jitter*=0.012:0:0.06 lines=200:60:800 flicker=0.2:0:1 tint=#3ad7ff', `
void main(){ float t=uTime; vec2 u=vUV; float row=floor(u.y*u_lines*.25); u.x+=(h13(vec3(row,floor(t*20.),1.))-.5)*u_jitter*step(.7,h13(vec3(floor(t*6.),row*.1,2.)))*3.+sin(u.y*40.+t*6.)*u_jitter*.2;
  vec3 c=vec3(TA(u+vec2(.004,0.)).r,TA(u).g,TA(u-vec2(.004,0.)).b); vec3 h=u_tint*(lum(c)*1.+.03)*(.55+.45*(.5+.5*sin(u.y*u_lines*6.28318+t*4.)));
  h+=u_tint*smoothstep(.08,0.,abs(fract(u.y+t*.15)-.5))*.18; h*=1.-u_flicker*.5*h13(vec3(floor(t*24.),3.,4.)); o=vec4(h+u_tint*sobel(u,1.5).z*.6,1.); }`],
  framediff: ['gain*=6:1:40 thresh=0.02:0:0.3 mode=0:0:1 c1=#ffffff', `
void main(){ vec3 d=abs(TA(vUV).rgb-texture(B,vUV).rgb); float l=max(0.,lum(d)-u_thresh)*u_gain; o=vec4(clamp(u_mode<.5?u_c1*l:d*u_gain,0.,1.),1.); }`],
  flow: ['gain=1:0.2:4', `
float LA(vec2 u){ return lum(TA(u).rgb); } float LB(vec2 u){ return lum(texture(B,u).rgb); }
void main(){ vec2 e=1./uRes; float it=LA(vUV)-LB(vUV); vec2 g=vec2(LA(vUV+vec2(e.x,0.))-LA(vUV-vec2(e.x,0.))+LB(vUV+vec2(e.x,0.))-LB(vUV-vec2(e.x,0.)),LA(vUV+vec2(0.,e.y))-LA(vUV-vec2(0.,e.y))+LB(vUV+vec2(0.,e.y))-LB(vUV-vec2(0.,e.y)))*.25;
  vec2 fl=clamp(-it*g/(dot(g,g)+.0006)*u_gain,-8.,8.); o=vec4(fl/16.+.5,clamp(abs(it)*6.,0.,1.),1.); }`],
  mosh: ['carry*=1.5:0:5 refresh=0.01:0:1 key=0:0:1 block=0:0:48', `
void main(){ vec2 fu=vUV; if(u_block>1.){ float bs=u_block*RS(); fu=(floor(vUV*uRes/bs)+.5)*bs/uRes; } vec2 fl=(texture(B,fu).rg-.5)*16.;
  vec3 prev=TA(vUV-fl/vec2(textureSize(B,0))*u_carry).rgb; o=vec4(mix(prev,texture(C,vUV).rgb,clamp(max(u_refresh,u_key),0.,1.)),1.); }`],
  /* ---- maps, mixing ---- */
  gen: ['mode=0:0:6 scale=8:1:64 speed=0:0:4 seed=1:0:99', `
void main(){ float v, t=floor(uTime*u_speed*4.); vec2 p=vUV;
  if(u_mode<.5) v=p.x; else if(u_mode<1.5) v=p.y; else if(u_mode<2.5) v=length((p-.5)*ASP())*1.6; else if(u_mode<3.5) v=h13(vec3(floor(p.y*u_scale),t,u_seed));
  else if(u_mode<4.5) v=h13(vec3(floor(p*ASP()*u_scale),u_seed+t)); else if(u_mode<5.5) v=gn(vec3(p*ASP()*u_scale*.3,uTime*u_speed*.3+u_seed))*.6+.5; else v=atan(p.y-.5,p.x-.5)/6.28318+.5;
  o=vec4(vec3(clamp(v,0.,1.)),1.); }`],
  blend: ['opacity*=1:0:1 mode=0:0:9', `
void main(){ vec3 a=TA(vUV).rgb, b=texture(B,vUV).rgb, r;
  if(u_mode<.5) r=b; else if(u_mode<1.5) r=a+b; else if(u_mode<2.5) r=1.-(1.-a)*(1.-b); else if(u_mode<3.5) r=a*b; else if(u_mode<4.5) r=mix(2.*a*b,1.-2.*(1.-a)*(1.-b),step(.5,a));
  else if(u_mode<5.5) r=max(a,b); else if(u_mode<6.5) r=min(a,b); else if(u_mode<7.5) r=abs(a-b); else if(u_mode<8.5) r=a-b; else r=a+(a-b)*1.5; o=vec4(mix(a,clamp(r,0.,1.),u_opacity),1.); }`],
  lumamix: ['lo=0.3:0:1 hi=0.6:0:1 invert=0:0:1', `void main(){ float m=smoothstep(u_lo,u_hi+1e-4,lum(texture(C,vUV).rgb)); o=mix(TA(vUV),texture(B,vUV),mix(m,1.-m,u_invert)); }`],
  sweep: ['speed*=0.25:0:2 width=0.04:0.005:0.3 angle=0:0:1', `
void main(){ float pos=fract(uTime*u_speed), co=mix(vUV.y,vUV.x,u_angle), d=pos-co; if(d<0.) d+=1.; o=vec4(TA(vUV).rgb*exp(-d/u_width)*step(d,.5)+vec3(smoothstep(.004,0.,abs(co-pos)))*.6,1.); }`],
  /* ---- space ---- */
  kaleido: ['seg*=6:2:24 rot=0:0:6.28 spin=0.05:-1:1 zoom=1:0.3:3 cx=0.5:0:1 cy=0.5:0:1', `
void main(){ vec2 c=vec2(u_cx,u_cy); vec2 p=(vUV-c)*ASP(); float a=atan(p.y,p.x)+u_rot+u_spin*uTime, r=length(p), sa=6.28318/floor(u_seg); a=abs(mod(a,sa)-sa*.5); o=TA(mir(r*vec2(cos(a),sin(a))/u_zoom/ASP()+c)); }`],
  mirror: ['mode*=0:0:3 pos=0.5:0.1:0.9', `
void main(){ vec2 u=vUV; if(u_mode<.5){ if(u.x>u_pos) u.x=2.*u_pos-u.x; } else if(u_mode<1.5){ if(u.x<u_pos) u.x=2.*u_pos-u.x; } else if(u_mode<2.5){ if(u.y<u_pos) u.y=2.*u_pos-u.y; } else u=.5-abs(u-.5); o=TA(mir(u)); }`],
  bulge: ['amount*=0.5:-1:1 radius=0.9:0.2:2 cx=0.5:0:1 cy=0.5:0:1', `
void main(){ vec2 c=vec2(u_cx,u_cy); vec2 p=(vUV-c)*ASP()*2.; float r=length(p)/u_radius; if(r<1.) p*=pow(r,max(.2,1.+u_amount*1.2))/max(r,1e-4); o=TA(mir(p/ASP()/2.+c)); }`],
  swirl: ['angle*=2.5:-10:10 radius=0.8:0.1:2 cx=0.5:0:1 cy=0.5:0:1', `
void main(){ vec2 c=vec2(u_cx,u_cy); vec2 p=(vUV-c)*ASP()*2.; float k=max(0.,1.-length(p)/u_radius); o=TA(mir(rot(u_angle*k*k)*p/ASP()/2.+c)); }`],
  ripple: ['amp*=0.012:0:0.08 freq=28:2:90 speed=3:0:12 decay=1.2:0:5 cx=0.5:0:1 cy=0.5:0:1', `
void main(){ vec2 p=(vUV-vec2(u_cx,u_cy))*ASP(); float r=length(p); o=TA(mir(vUV+p/max(r,1e-4)*sin(r*u_freq-uTime*u_speed)*u_amp*exp(-r*u_decay)/ASP())); }`],
  wave: ['ax*=0.02:0:0.15 fy=6:0.5:40 ay=0:0:0.15 fx=6:0.5:40 speed=1.5:0:10', `
void main(){ vec2 u=vUV; u.x+=sin(vUV.y*u_fy*6.28318+uTime*u_speed)*u_ax; u.y+=sin(vUV.x*u_fx*6.28318+uTime*u_speed*.8)*u_ay; o=TA(mir(u)); }`],
  polar: ['zoom*=1:0.4:3 mode=0:0:1 rot=0:0:6.28 spin=0:-1:1', `
void main(){ vec2 p=(vUV-.5)*ASP()*2.; float r=length(p)/u_zoom*.85, a=atan(p.x,-p.y)+u_rot+u_spin*uTime; o=TA(vec2(abs(fract(a/6.28318+.5)*2.-1.),clamp(u_mode<.5?r:1.-r,0.,1.))); }`],
  tiles: ['cells*=10:2:48 refract=0.35:0:1.5 gap=0.03:0:0.2 bevel=0.5:0:1', `
void main(){ vec2 g=max(floor(vec2(u_cells*uRes.x/uRes.y,u_cells)),1.); vec2 p=vUV*g; vec2 f=fract(p)-.5; vec2 u=(floor(p)+.5)/g+(f+f*abs(f)*2.*u_bevel)/g*(1.+u_refract*3.); vec3 c=TA(mir(u)).rgb;
  float e=max(abs(f.x),abs(f.y))*2.; c*=1.-smoothstep(1.-u_gap*2.,1.,e)*.85; o=vec4(c+smoothstep(.75,1.,e)*(-f.y-f.x)*.12*u_bevel,1.); }`],
  drops: ['size*=0.07:0.02:0.25 density=0.6:0:1 speed=0.25:0:2 refract=1:0:2', `
void main(){ vec2 a=ASP(); vec2 p=vUV*a/u_size; vec3 col=texture(B,vUV).rgb*.9;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ float cx=floor(p.x)+float(i); float yo=uTime*(.3+h21(vec2(cx,1.)))*u_speed+h21(vec2(cx,5.))*10.; float qy=p.y+yo; vec2 id=vec2(cx,floor(qy)+float(j));
    if(h21(id+.3)>u_density*.6) continue; vec2 ctr=id+.5+(h22(id)-.5)*.6; float rad=.18+.25*h21(id+7.); vec2 d=vec2(p.x,qy)-ctr; d.y*=.85; float r=length(d)/rad; if(r>=1.) continue;
    vec2 n=d/rad; vec2 cu=vec2(ctr.x,ctr.y-yo)*u_size/a; vec3 c=TA(mir(cu-n*rad*u_size/a*2.2*u_refract)).rgb*1.08+.03; c*=1.-smoothstep(.75,1.,r)*.45; c+=smoothstep(.5,.2,length(n-vec2(-.35,.4)))*.25; col=mix(col,c,smoothstep(1.,.92,r)); }
  o=vec4(col,1.); }`],
  stretch: ['pos*=0.5:0:1 width=0.06:0:0.5 dir=0:0:1 mode=0:0:1', `
void main(){ vec2 u=vUV; float c=u_dir<.5?u.x:u.y; float k=u_mode<.5?u_pos+clamp(c-u_pos,-u_width,u_width):min(c,u_pos); if(u_dir<.5) u.x=k; else u.y=k; o=TA(u); }`],
};
const FXSPEC = {};
for (const name in FXLIB) { const [spec, body] = FXLIB[name]; const u = spec.trim().split(/\s+/).map(it => { const [k, v] = it.split('='), key = k.replace('*', '');
    if (v[0] === '#') return { name: key, vec: true, def: v, star: k.endsWith('*') }; const [d, mn, mx] = v.split(':').map(Number); return { name: key, def: d, min: mn, max: mx, star: k.endsWith('*') }; });
  FXSPEC[name] = u; FS['fx_' + name] = u.map(x => `uniform ${x.vec ? 'vec3' : 'float'} u_${x.name};`).join(' ') + FXPRE + body; }

FS.flatc = `in vec4 vC; void main(){ vec2 d=gl_PointCoord-.5; if(dot(d,d)>.25) discard; o=vC; }`;
FS.flatl = `in vec4 vC; void main(){ o=vC; }`;
VS3.pts2 = `#version 300 es
precision highp float;
in vec2 aUV; uniform sampler2D A; uniform mat4 uPV; uniform vec2 uSize; uniform float uAmp,uPt,uTime,uWave,uColor; uniform vec3 uTint; out vec4 vC;` + NOISE + `
void main(){ vec3 c=textureLod(A,aUV,0.).rgb; float l=clamp(lum(c),0.,1.); vec2 q=(aUV-.5)*uSize; gl_Position=uPV*vec4(q,(l-.5)*uAmp+uWave*gn(vec3(q*.8,uTime*.3)),1.);
  gl_PointSize=max(1.,(.35+l)*uPt*5./gl_Position.w); vC=vec4(mix(uTint,c*1.3,uColor)*(.25+l),1.); }`;
VS3.mesh2 = `#version 300 es
precision highp float;
in vec2 aUV; uniform sampler2D A; uniform mat4 uPV; uniform vec2 uSize; uniform float uAmp,uColor; uniform vec3 uTint; out vec4 vC;` + NOISE + `
void main(){ vec3 c=textureLod(A,aUV,0.).rgb; float l=lum(c); gl_Position=uPV*vec4((aUV.x-.5)*uSize.x,(aUV.y-.5)*uSize.y,l*uAmp,1.); vC=vec4(mix(uTint,c*1.4,uColor)*(.35+.8*l),1.); }`;
const mul4 = (a, b) => { const r = new Float32Array(16); for (let c = 0; c < 4; c++) for (let w = 0; w < 4; w++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + w] * b[c * 4 + k]; r[c * 4 + w] = s; } return r; };
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };

/** colour parameter: '#rrggbb' from the node, or an override set by the Adjust sheet */
Engine.prototype.C = function (p, name, def) { const k = p + '.' + name; let v = k in this.ov ? this.ov[k] : this.S(p, name, def); if (typeof v !== 'string' || v[0] !== '#') v = def;
  const n = parseInt(v.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
/* ---- Blob Track TOP ------------------------------------------------------------------------------------------
   TouchDesigner hands the picture to OpenCV; here a low-resolution mask is rendered on the GPU, read back without
   stalling (pixel-pack buffer + fence, the "Next Frame" download type), and the rectangles are found on the CPU.
   With a second input the mask is the thresholded difference to that background; without one, the bright areas. */
function blobFind(st, o) { const gw = st.gw, gh = st.gh, data = st.data, on = st.on || (st.on = new Uint8Array(gw * gh)), stack = st.stack || (st.stack = new Int32Array(gw * gh)), rects = [];
  for (let i = 0; i < gw * gh; i++) on[i] = data[i * 4] >= 44 ? 1 : 0;
  for (let s = 0; s < gw * gh; s++) { if (on[s] !== 1) continue; let sp = 0, x0 = gw, y0 = gh, x1 = -1, y1 = -1, n = 0; stack[sp++] = s; on[s] = 2;
    while (sp) { const c = stack[--sp], x = c % gw, y = (c - x) / gw; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; const k = yy * gw + xx; if (on[k] === 1) { on[k] = 2; stack[sp++] = k; } } }
    const big = Math.max((x1 - x0 + 1) / gw, (y1 - y0 + 1) / gh); if (n < 2 || big < o.min || big > o.max) continue; rects.push({ x0: x0 / gw, y0: y0 / gh, x1: (x1 + 1) / gw, y1: (y1 + 1) / gh, n }); }
  rects.sort((a, b) => b.n - a.n); const keep = [];
  for (const r of rects) { if (keep.length >= o.count) break; if (keep.some(k => r.x0 >= k.x0 - .01 && r.x1 <= k.x1 + .01 && r.y0 >= k.y0 - .01 && r.y1 <= k.y1 + .01)) continue; keep.push(r); }
  /* tracking: a rectangle keeps its ID while its centre moves less than Max Move Distance; IDs only go up */
  const prev = st.blobs, used = new Set(), out = [];
  for (const r of keep) { const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2; let best = null, bd = o.move;
    for (const b of prev) { if (used.has(b)) continue; const d = Math.hypot((b.t.x0 + b.t.x1) / 2 - cx, (b.t.y0 + b.t.y1) / 2 - cy); if (d < bd) { bd = d; best = b; } }
    if (best) { used.add(best); best.t = r; best.lost = 0; best.age++; out.push(best); } else out.push({ id: ++st.next, t: r, d: Object.assign({}, r), lost: 0, age: 0, a: 0 }); }
  for (const b of prev) if (!used.has(b) && ++b.lost < 10) out.push(b);
  st.blobs = out; }
function blobDraw(x, W, H, blobs, o) { const u = Math.min(W, H) / 100, lw = Math.max(1, o.line * u * .14), col = 'rgb(' + o.col.map(v => Math.round(255 * Math.min(1, Math.max(0, v)))).join(',') + ')', z = n => String(n).padStart(2, '0');
  x.lineWidth = lw; x.strokeStyle = col; x.fillStyle = col; x.font = '600 ' + (2.5 * u) + 'px ui-monospace,Menlo,Consolas,monospace'; x.textBaseline = 'alphabetic'; x.lineJoin = 'miter';
  const R = blobs.map(b => { const g = o.grow, x0 = (b.d.x0 - g) * W, x1 = (b.d.x1 + g) * W, y0 = (1 - b.d.y1 - g) * H, y1 = (1 - b.d.y0 + g) * H; return { b, x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; });
  if (o.style === 'net') { const P = R.slice().sort((a, b) => a.cx - b.cx); x.globalAlpha = .75; x.beginPath(); P.forEach((r, i) => i ? x.lineTo(r.cx, r.cy) : x.moveTo(r.cx, r.cy)); x.stroke();
    x.globalAlpha = .35; x.beginPath(); for (let i = 0; i + 2 < P.length; i++) { x.moveTo(P[i].cx, P[i].cy); x.lineTo(P[i + 2].cx, P[i + 2].cy); } x.stroke(); }
  for (const r of R) { const a = r.b.a; if (a < .02) continue; x.globalAlpha = a;
    if (o.style === 'mask') { x.fillStyle = '#fff'; x.fillRect(r.x, r.y, r.w, r.h); continue; }
    if (o.style === 'bounds') { x.strokeRect(r.x, r.y, r.w, r.h); }
    else if (o.style === 'net') { const q = 1.1 * u; x.strokeRect(r.cx - q, r.cy - q, q * 2, q * 2); x.globalAlpha = a * .3; x.strokeRect(r.x, r.y, r.w, r.h); x.globalAlpha = a; }
    else { /* hud, cross, cctv: faint box, corner brackets, centre mark */
      const k = Math.max(1.6 * u, Math.min(r.w, r.h) * .2); x.globalAlpha = a * .35; x.strokeRect(r.x, r.y, r.w, r.h); x.globalAlpha = a; x.lineWidth = lw * 1.6; x.beginPath();
      for (const [px, py, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) { x.moveTo(px + sx * k, py); x.lineTo(px, py); x.lineTo(px, py + sy * k); } x.stroke(); x.lineWidth = lw;
      x.beginPath(); x.moveTo(r.cx - u, r.cy); x.lineTo(r.cx + u, r.cy); x.moveTo(r.cx, r.cy - u); x.lineTo(r.cx, r.cy + u); x.stroke();
      if (o.style === 'cross') { x.globalAlpha = a * .4; x.beginPath(); x.moveTo(0, r.cy); x.lineTo(W, r.cy); x.moveTo(r.cx, 0); x.lineTo(r.cx, H); x.stroke(); x.globalAlpha = a; } }
    if (o.label) { const ty = r.y > 4 * u ? r.y - 1.1 * u : r.y + r.h + 3.2 * u, cx = r.b.d.x0 / 2 + r.b.d.x1 / 2, cy = r.b.d.y0 / 2 + r.b.d.y1 / 2;
      x.fillStyle = col; x.fillText(o.style === 'cctv' ? 'MOTION ' + z(r.b.id % 100) : o.style === 'net' ? cx.toFixed(2) + ' ' + cy.toFixed(2) : 'ID ' + z(r.b.id % 100) + '  ' + cx.toFixed(2) + ',' + cy.toFixed(2), o.style === 'net' ? r.cx + 1.6 * u : r.x, o.style === 'net' ? r.cy - 1.4 * u : ty); } }
  x.globalAlpha = 1; }
Object.assign(Engine.prototype.OPS, {
  /* inputs: 0 picture to analyse, 1 background (optional), 2 picture to draw on (optional, not in TouchDesigner).
     Extra parameters for presets: style (bounds | hud | cross | net | cctv | mask), label, linewidth, grow, maxblobs */
  blobtrack(p, N, st) { const gl = this.gl, A = this.in(p, 0), B = N.inputs[1] ? this.in(p, 1) : null, onto = N.inputs[2] ? this.in(p, 2) : A, P = (k, d) => this.P(p, k, d), S = (k, d) => this.S(p, k, d);
    const land = A.w >= A.h, gw = land ? 96 : Math.max(24, Math.round(96 * A.w / A.h)), gh = land ? Math.max(24, Math.round(96 * A.h / A.w)) : 96;
    const an = this.draw('blobmask', this.tgt(p + '#an', gw, gh, true), { A, B: B || this.black, uBg: B ? 1 : 0, uTh: P('threshold', .1), uCell: [1 / gw, 1 / gh],
      uCh: { i: ({ luminance: 0, red: 1, green: 2, blue: 3, alpha: 4, rgbaverage: 5, average: 6 })[S('monosource', 'luminance')] ?? 0 } });
    if (!st.pbo || st.gw !== gw || st.gh !== gh) { if (st.sync) { gl.deleteSync(st.sync); st.sync = null; } if (!st.pbo) { st.pbo = gl.createBuffer(); this.extra.push({ buf: st.pbo, st }); }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, st.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, gw * gh * 4, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      Object.assign(st, { gw, gh, data: new Uint8Array(gw * gh * 4), on: null, stack: null, blobs: st.blobs || [], next: st.next || 0 }); }
    const find = { min: P('minblobsize', .02), max: P('maxblobsize', 1), move: P('maxmovedistance', .2), count: Math.max(1, Math.min(24, Math.round(P('maxblobs', 12)))) };
    if (st.sync) { const r = gl.clientWaitSync(st.sync, 0, 0);
      if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, st.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, st.data); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteSync(st.sync); st.sync = null;
        blobFind(st, find); }
      else if (r === gl.WAIT_FAILED || ++st.wait > 20) { gl.deleteSync(st.sync); st.sync = null; st.direct = true; } }   /* a browser whose fence never signals: read the small mask directly */
    if (!st.sync) { gl.bindFramebuffer(gl.FRAMEBUFFER, an.fbo);
      if (st.direct) { gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, st.data); blobFind(st, find); }
      else { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, st.pbo); gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); st.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); st.wait = 0; gl.flush(); } }
    /* the drawn rectangles ease towards the tracked ones and fade when a blob is lost */
    for (const b of st.blobs) { for (const k of ['x0', 'y0', 'x1', 'y1']) b.d[k] += (b.t[k] - b.d[k]) * .45; b.a += ((b.lost ? 0 : 1) - b.a) * (b.lost ? .22 : .4); }
    const style = S('style', 'bounds'), shown = st.blobs.filter(b => b.a >= .02); if (S('drawblobs', 'on') === 'off' && style !== 'mask') return onto;
    const t = this.tgt(p, onto.w, onto.h), k = Math.min(1, 1024 / Math.max(t.w, t.h)), cw = Math.max(2, Math.round(t.w * k)), chh = Math.max(2, Math.round(t.h * k));
    if (!st.cv) { st.cv = document.createElement('canvas'); st.cx = st.cv.getContext('2d'); st.tex = this.mkTex(1, 1, true); this.extra.push({ tex: st.tex }); st.dirty = true; }
    if (shown.length || st.dirty || st.cv.width !== cw || st.cv.height !== chh) { if (st.cv.width !== cw || st.cv.height !== chh) { st.cv.width = cw; st.cv.height = chh; } st.cx.clearRect(0, 0, cw, chh);
      blobDraw(st.cx, cw, chh, shown, { style, label: S('label', style === 'bounds' || style === 'mask' ? 'off' : 'on') !== 'off', line: P('linewidth', 2), grow: P('grow', 0), col: [P('blobcolorr', 1), P('blobcolorg', 0), P('blobcolorb', 0)] });
      gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, st.cv);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); st.dirty = shown.length > 0; }
    return this.draw('tint', t, { A: { tex: st.tex }, B: onto, uCol: [1, 1, 1, 1], uHasIn: style === 'mask' ? 0 : 1 }); },

  glsl(p, N) { const name = this.S(p, 'fx', ''), U = FXSPEC[name]; if (!U) return this.in(p, 0); const I = [0, 1, 2, 3].map(k => N.inputs[k] ? this.in(p, k) : null);
    const un = { A: I[0] || this.black, B: I[1] || this.black, C: I[2] || this.black, D: I[3] || this.black }; for (const u of U) un['u_' + u.name] = u.vec ? this.C(p, u.name, u.def) : this.P(p, u.name, u.def);
    return this.draw('fx_' + name, this.T(p, I[0]), un); },
  glow(p) { const A = this.in(p, 0), P = (k, d) => this.P(p, k, d); const g = this.glow(p, A, P('threshold', .6), P('gamma', 1), P('gain', 1), P('size', 24));
    return this.draw('addmix', this.tgt(p, A.w, A.h), { A, B: g, uA: P('dry', 1), uB: P('intensity', 1), uTint: this.C(p, 'tint', '#ffffff') }); },
  hold(p, N, st) { const A = this.in(p, 0), hi = this.P(p, 'trigger', 0) > .5; if (!st.has || (hi && !st.hi)) { this.draw('copy', this.tgt(p, A.w, A.h), { A }); st.has = true; } st.hi = hi; return this.pool[p] || A; },
  osd(p, N, st) { const gl = this.gl, A = this.in(p, 0), t = this.tgt(p, A.w, A.h), sec = Math.floor(Date.now() / 1000), style = this.S(p, 'style', 'cam');
    if (st.sec !== sec || st.w !== t.w || st.h !== t.h) { const c = st.cv || (st.cv = document.createElement('canvas')); c.width = t.w; c.height = t.h; const x = c.getContext('2d'), u = Math.min(t.w, t.h) / 100, d = new Date(), z = n => String(n).padStart(2, '0');
      x.clearRect(0, 0, c.width, c.height); x.font = '700 ' + (4.6 * u) + 'px ui-monospace,Menlo,Consolas,monospace'; x.textBaseline = 'alphabetic'; x.shadowColor = '#000'; x.shadowBlur = u * .6;
      if (style === 'play') { x.fillStyle = '#f4f4f4'; x.textAlign = 'left'; x.fillText('PLAY ▶', 6 * u, 10 * u); const s = Math.floor(this.time); x.fillText('SP  0:' + z(Math.floor(s / 60) % 60) + ':' + z(s % 60), 6 * u, t.h - 7 * u); }
      else { x.fillStyle = '#ffb21a'; x.textAlign = 'right'; const mo = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()], hh = d.getHours();
        x.fillText((hh < 12 ? 'AM ' : 'PM ') + z(hh % 12 || 12) + ':' + z(d.getMinutes()), t.w - 6 * u, t.h - 13 * u); x.fillText(mo + '. ' + z(d.getDate()) + ' ' + d.getFullYear(), t.w - 6 * u, t.h - 7 * u);
        if (sec % 2) { x.fillStyle = '#ff3b30'; x.textAlign = 'left'; x.fillText('● REC', 6 * u, 10 * u); } }
      if (!st.tex) { st.tex = this.mkTex(1, 1, true); this.extra.push({ tex: st.tex }); } gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); Object.assign(st, { sec, w: t.w, h: t.h }); }
    return this.draw('tint', t, { A: { tex: st.tex }, B: A, uCol: [1, 1, 1, 1], uHasIn: 1 }); },
  pointcloud(p) { const gl = this.gl, A = this.in(p, 0), P = (k, d) => this.P(p, k, d), t = this.tgt(p, this.w, this.h), cols = Math.max(16, Math.min(420, Math.round(P('cols', 240)))), rows = Math.max(8, Math.round(cols * this.h / this.w));
    const m = this.mesh('pc' + cols + 'x' + rows, () => { const v = new Float32Array(cols * rows * 2); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { v[(r * cols + c) * 2] = (c + .5) / cols; v[(r * cols + c) * 2 + 1] = (r + .5) / rows; } return { v }; });
    const vw = 2 * 5 * Math.tan(Math.PI / 8), vh = vw * this.h / this.w, f = P('fill', 1.08), M = mul4(mul4(this.pv(5), rotY(P('orbit', .3) * Math.sin(this.time * P('speed', .4)))), rotX(P('tilt', 0)));
    return this.draw3('pts2', t, { A, uPV: M, uSize: [vw * f, vh * f], uAmp: P('depth', 1), uPt: this.w / cols * P('ptsize', 1.1), uWave: P('wave', 0), uColor: P('color', 1), uTint: this.C(p, 'tint', '#ffffff'), __fs: 'flatc' }, m, gl.POINTS, 0, P('additive', 0) > .5); },
  scanmesh(p) { const gl = this.gl, A = this.in(p, 0), P = (k, d) => this.P(p, k, d), t = this.tgt(p, this.w, this.h), cols = Math.max(8, Math.min(400, Math.round(P('cols', 220)))), rows = Math.max(4, Math.min(240, Math.round(P('rows', 70))));
    const m = this.mesh('sm' + cols + 'x' + rows, () => { const v = new Float32Array(cols * rows * 2), ix = new Uint32Array((cols - 1) * rows * 2); let k = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { v[(r * cols + c) * 2] = c / (cols - 1); v[(r * cols + c) * 2 + 1] = r / (rows - 1); if (c < cols - 1) { ix[k++] = r * cols + c; ix[k++] = r * cols + c + 1; } } return { v, i: ix }; });
    const vw = 2 * 5 * Math.tan(Math.PI / 8), vh = vw * this.h / this.w, M = mul4(mul4(this.pv(5), rotY(P('orbit', 0) * Math.sin(this.time * P('speed', .3)))), rotX(P('tilt', 0)));
    return this.draw3('mesh2', t, { A, uPV: M, uSize: [vw * P('sx', 1.04), vh * P('sy', 1.03)], uAmp: P('depth', .25), uColor: P('color', 0), uTint: this.C(p, 'tint', '#f2efe9'), __fs: 'flatl' }, m, gl.LINES); },
});
