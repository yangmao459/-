"use strict";
(() => {
 const VERT=`#version 300 es
 precision highp float;out vec2 uv;
 void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
 const SIM=`#version 300 es
 precision highp float;in vec2 uv;out vec4 result;
 uniform sampler2D stateTex;uniform sampler2D waxTex;uniform sampler2D crackTex;uniform vec2 pixel;uniform float bath;uniform float strength;
 float permeability(vec2 q){float w=texture(waxTex,q).a,c=smoothstep(.015,.40,texture(crackTex,q).a);return 1.-smoothstep(.12,.65,w)*(1.-c);}
 void main(){vec2 s=texture(stateTex,uv).rg;float p=permeability(uv);vec2 dx=vec2(pixel.x,0),dy=vec2(0,pixel.y);
 float flux=.18*(min(p,permeability(uv+dx))*(texture(stateTex,uv+dx).r-s.r)+min(p,permeability(uv-dx))*(texture(stateTex,uv-dx).r-s.r));
 flux+=.09*(min(p,permeability(uv+dy))*(texture(stateTex,uv+dy).r-s.r)+min(p,permeability(uv-dy))*(texture(stateTex,uv-dy).r-s.r));
 float wet=1.-smoothstep(bath,bath+.035,uv.y);float absorb=.010*p*s.r*(1.-s.g);float source=.025*p*wet*(strength-s.r);
 float mobile=clamp(s.r+flux+source-absorb,0.,1.);float adsorbed=clamp(s.g+absorb,0.,1.);result=vec4(mobile,adsorbed,0,1);}`;
 const DISPLAY=`#version 300 es
 precision highp float;in vec2 uv;out vec4 color;
 uniform sampler2D stateTex;uniform sampler2D waxTex;uniform sampler2D crackTex;uniform float waxVisible;uniform vec2 light;uniform float dyeActive;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 vec2 smoothField(vec2 q){vec2 size=vec2(textureSize(stateTex,0)),p=q*size-.5,i=floor(p),f=fract(p);vec2 a=texture(stateTex,(i+vec2(.5,.5))/size).rg,b=texture(stateTex,(i+vec2(1.5,.5))/size).rg,c=texture(stateTex,(i+vec2(.5,1.5))/size).rg,d=texture(stateTex,(i+vec2(1.5,1.5))/size).rg;return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
 void main(){float wax=texture(waxTex,uv).a;float crack=smoothstep(.015,.40,texture(crackTex,uv).a);vec2 dye=smoothField(uv);
 float grain=hash(floor(uv*1800.))-.5;float weave=sin(uv.x*2262.)*sin(uv.y*2262.);float slow=sin(uv.x*17.+uv.y*7.)*.5+sin(uv.y*21.-uv.x*4.)*.25;
 vec3 paper=vec3(.942,.916,.839),blue=vec3(.061,.191,.287);float density=1.-exp(-3.6*dye.g);vec3 base=mix(paper,blue,density);base=mix(base,blue,dye.r*.045*dyeActive);
 float coating=wax*waxVisible*(1.-crack*.98);vec3 waxColor=vec3(.814,.698,.455);float rim=clamp(length(vec2(dFdx(wax),dFdy(wax)))*2.,0.,1.);waxColor+=rim*.055;
 base=mix(base,waxColor,coating*.88);vec3 normal=normalize(vec3(.035*cos(uv.x*2262.)+.025*slow,.030*cos(uv.y*2262.)-.02*slow,1.));vec3 lamp=normalize(vec3(light.x,light.y,1.6));float diffuse=dot(normal,lamp);float sheen=pow(max(0.,dot(reflect(-lamp,normal),vec3(0,0,1))),25.)*.055;
 base*=.94+diffuse*.065+weave*.014+grain*.035+slow*.008;base+=sheen;float edge=1.-smoothstep(0.,.75,distance(uv,vec2(.5)));base*=.985+.015*edge;color=vec4(base,1);}`;
 function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
 function program(gl,frag){const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,frag));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 class Material{
  constructor(canvas,wax,cracks){
   this.canvas=canvas;this.wax=wax;this.cracks=cracks;this.n=matchMedia('(max-width: 640px)').matches?320:512;this.light=[-.4,.4];this.iterations=0;this.gpu=false;this.lost=false;this.waxVisible=1;this.active=false;
   try{
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Floating-point WebGL 2 unavailable');this.gl=gl;
    this.sim=program(gl,SIM);this.display=program(gl,DISPLAY);this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.waxTexture=this.texture(false);this.crackTexture=this.texture(false);this.targets=[this.target(),this.target()];this.front=0;this.gpu=true;this.reset();
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.active=false;if(this.onLost)this.onLost();});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
   }catch(e){
    this.fallbackReason=e.message;
    if(this.gl){const ext=this.gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();}
    const replacement=canvas.cloneNode();canvas.replaceWith(replacement);this.canvas=replacement;this.ctx=replacement.getContext('2d');this.n=192;this.cpuCanvas=document.createElement('canvas');this.cpuCanvas.width=this.cpuCanvas.height=this.n;this.cpuCtx=this.cpuCanvas.getContext('2d');this.cpuImage=this.cpuCtx.createImageData(this.n,this.n);this.reset();
   }
   this.updateMasks();
  }
  texture(float){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,float?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,float?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  target(){const gl=this.gl,t=this.texture(true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,this.n,this.n,0,gl.RGBA,gl.HALF_FLOAT,null);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float framebuffer unsupported');return {texture:t,buffer:f};}
  bind(p,name,unit,texture){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(p,name),unit);}
  uniform1(p,name,value){this.gl.uniform1f(this.gl.getUniformLocation(p,name),value);}
  reset(){this.iterations=0;if(this.gpu){const gl=this.gl;for(const t of this.targets){gl.bindFramebuffer(gl.FRAMEBUFFER,t.buffer);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}gl.bindFramebuffer(gl.FRAMEBUFFER,null);}else{const len=this.n*this.n;this.mobile=new Float32Array(len);this.absorbed=new Float32Array(len);this.nextMobile=new Float32Array(len);this.nextAbsorbed=new Float32Array(len);}}
  updateMasks(){
   if(this.gpu){const gl=this.gl;gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);for(const [texture,image] of [[this.waxTexture,this.wax],[this.crackTexture,this.cracks]]){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}else{
    const c=document.createElement('canvas');c.width=c.height=this.n;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(this.wax,0,0,this.n,this.n);const w=ctx.getImageData(0,0,this.n,this.n).data;ctx.clearRect(0,0,this.n,this.n);ctx.drawImage(this.cracks,0,0,this.n,this.n);const k=ctx.getImageData(0,0,this.n,this.n).data;this.perm=new Float32Array(this.n*this.n);this.waxLow=new Float32Array(this.n*this.n);this.crackLow=new Float32Array(this.n*this.n);
    const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};for(let i=0;i<this.n*this.n;i++){this.waxLow[i]=w[i*4+3]/255;this.crackLow[i]=smooth(.015,.40,k[i*4+3]/255);this.perm[i]=1-smooth(.12,.65,this.waxLow[i])*(1-this.crackLow[i]);}
   }
  }
  step(bath,strength,count){
   if(this.lost)return;
   if(this.gpu){const gl=this.gl,p=this.sim;gl.useProgram(p);gl.bindVertexArray(this.vao);gl.viewport(0,0,this.n,this.n);this.bind(p,'waxTex',1,this.waxTexture);this.bind(p,'crackTex',2,this.crackTexture);gl.uniform2f(gl.getUniformLocation(p,'pixel'),1/this.n,1/this.n);this.uniform1(p,'bath',bath);this.uniform1(p,'strength',strength);
    for(let i=0;i<count;i++){const next=1-this.front;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[next].buffer);this.bind(p,'stateTex',0,this.targets[this.front].texture);gl.drawArrays(gl.TRIANGLES,0,3);this.front=next;this.iterations++;}gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   }else{
    const n=this.n,p=this.perm;for(let iter=0;iter<count;iter++){
     for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,d=this.mobile[i],a=this.absorbed[i],pi=p[i],l=x?i-1:i,r=x<n-1?i+1:i,u=y?i-n:i,b=y<n-1?i+n:i;
      const flux=.18*(Math.min(pi,p[l])*(this.mobile[l]-d)+Math.min(pi,p[r])*(this.mobile[r]-d))+.09*(Math.min(pi,p[u])*(this.mobile[u]-d)+Math.min(pi,p[b])*(this.mobile[b]-d));
      const wet=Math.max(0,Math.min(1,(bath-(1-y/n))/.035+1)),absorb=.010*pi*d*(1-a);this.nextMobile[i]=Math.max(0,Math.min(1,d+flux+.025*pi*wet*(strength-d)-absorb));this.nextAbsorbed[i]=Math.min(1,a+absorb);
     }[this.mobile,this.nextMobile]=[this.nextMobile,this.mobile];[this.absorbed,this.nextAbsorbed]=[this.nextAbsorbed,this.absorbed];this.iterations++;
    }
   }
  }
  render(waxVisible=this.waxVisible,active=this.active){
   if(this.lost)return;this.waxVisible=waxVisible;this.active=active;
   if(this.gpu){const gl=this.gl,p=this.display;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(p);gl.bindVertexArray(this.vao);this.bind(p,'stateTex',0,this.targets[this.front].texture);this.bind(p,'waxTex',1,this.waxTexture);this.bind(p,'crackTex',2,this.crackTexture);this.uniform1(p,'waxVisible',waxVisible);this.uniform1(p,'dyeActive',active?1:0);gl.uniform2f(gl.getUniformLocation(p,'light'),...this.light);gl.drawArrays(gl.TRIANGLES,0,3);
   }else{
    const data=this.cpuImage.data,n=this.n;for(let i=0;i<n*n;i++){const dye=1-Math.exp(-3.6*this.absorbed[i]),w=this.waxLow[i]*waxVisible*(1-this.crackLow[i]*.98)*.88;const grain=(Math.sin(i*12.9898)*43758.54%1)*1.3;const color=[240+(16-240)*dye,234+(49-234)*dye,214+(73-214)*dye];for(let k=0;k<3;k++)data[i*4+k]=color[k]*(1-w)+[208,178,116][k]*w+grain;data[i*4+3]=255;}this.cpuCtx.putImageData(this.cpuImage,0,0);this.ctx.imageSmoothingEnabled=true;this.ctx.drawImage(this.cpuCanvas,0,0,this.canvas.width,this.canvas.height);
    // High-resolution wax coverage keeps the fallback composition readable.
    if(this.iterations===0){this.ctx.fillStyle='#f0ead6';this.ctx.fillRect(0,0,1024,1024);const tint=document.createElement('canvas');tint.width=tint.height=1024;const c=tint.getContext('2d');c.drawImage(this.wax,0,0);c.globalCompositeOperation='destination-out';c.drawImage(this.cracks,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#d4b77b';c.fillRect(0,0,1024,1024);this.ctx.drawImage(tint,0,0);}
   }
  }
  capture(){this.render();const c=document.createElement('canvas');c.width=c.height=1024;c.getContext('2d').drawImage(this.canvas,0,0);return c;}
  sample(){
   if(!this.gpu)return {n:this.n,absorbed:Array.from(this.absorbed),mobile:Array.from(this.mobile)};
   const gl=this.gl,data=new Float32Array(this.n*this.n*4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[this.front].buffer);gl.readPixels(0,0,this.n,this.n,gl.RGBA,gl.FLOAT,data);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {n:this.n,absorbed:Array.from({length:this.n*this.n},(_,i)=>data[i*4+1]),mobile:Array.from({length:this.n*this.n},(_,i)=>data[i*4])};
  }
 }
 window.BatikMaterial=Material;
})();
