import{a as Bo,b as w,d as Go}from"./chunk-MDSO6NQ5.js";import{Aa as Io,C as u,D as Ne,E as me,F as kt,G as Pe,H as de,J as pe,K as F,L as xo,M as rt,N as wo,O as bo,P as yo,Q as Eo,R as Oe,S as To,T as Co,U as At,X as So,Y as Ro,Z as at,a as _e,aa as Dt,b as no,ba as _t,ca as Ht,d as so,da as Mo,e as et,ea as ko,f as tt,fa as Ao,g as He,ga as Do,h as lo,i as co,j as uo,ja as Pt,k as ot,ka as _o,l as fo,la as Ho,m as ho,n as Ct,na as zt,o as St,oa as Ut,p as ue,pa as Po,q as mo,qa as We,r as Rt,ra as Ve,s as po,sa as zo,t as W,ta as Z,u as vo,v as go,va as Uo,w as Mt,x as se,ya as Lo,z as X,za as Fo}from"./chunk-FWWTYKYO.js";var it={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};var V=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},Rr=new wo(-1,1,1,-1,0,1),Lt=class extends Pe{constructor(){super(),this.setAttribute("position",new kt([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new kt([0,2,0,0,2,0],2))}},Mr=new Lt,re=class{constructor(e){this._mesh=new de(Mr,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Rr)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var Se=class extends V{constructor(e,o){super(),this.textureID=o!==void 0?o:"tDiffuse",e instanceof F?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=pe.clone(e.uniforms),this.material=new F({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this.fsQuad=new re(this.material)}render(e,o,r){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=r.texture),this.fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(o),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this.fsQuad.render(e))}dispose(){this.material.dispose(),this.fsQuad.dispose()}};var qe=class extends V{constructor(e,o){super(),this.scene=e,this.camera=o,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,o,r){let i=e.getContext(),a=e.state;a.buffers.color.setMask(!1),a.buffers.depth.setMask(!1),a.buffers.color.setLocked(!0),a.buffers.depth.setLocked(!0);let n,c;this.inverse?(n=0,c=1):(n=1,c=0),a.buffers.stencil.setTest(!0),a.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),a.buffers.stencil.setFunc(i.ALWAYS,n,4294967295),a.buffers.stencil.setClear(c),a.buffers.stencil.setLocked(!0),e.setRenderTarget(r),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(o),this.clear&&e.clear(),e.render(this.scene,this.camera),a.buffers.color.setLocked(!1),a.buffers.depth.setLocked(!1),a.buffers.color.setMask(!0),a.buffers.depth.setMask(!0),a.buffers.stencil.setLocked(!1),a.buffers.stencil.setFunc(i.EQUAL,1,4294967295),a.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),a.buffers.stencil.setLocked(!0)}},nt=class extends V{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}};var st=class{constructor(e,o){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),o===void 0){let r=e.getSize(new W);this._width=r.width,this._height=r.height,o=new se(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:ue}),o.texture.name="EffectComposer.rt1"}else this._width=o.width,this._height=o.height;this.renderTarget1=o,this.renderTarget2=o.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Se(it),this.copyPass.material.blending=tt,this.clock=new Ho}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,o){this.passes.splice(o,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let o=this.passes.indexOf(e);o!==-1&&this.passes.splice(o,1)}isLastEnabledPass(e){for(let o=e+1;o<this.passes.length;o++)if(this.passes[o].enabled)return!1;return!0}render(e){e===void 0&&(e=this.clock.getDelta());let o=this.renderer.getRenderTarget(),r=!1;for(let i=0,a=this.passes.length;i<a;i++){let n=this.passes[i];if(n.enabled!==!1){if(n.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),n.render(this.renderer,this.writeBuffer,this.readBuffer,e,r),n.needsSwap){if(r){let c=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(c.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),l.setFunc(c.EQUAL,1,4294967295)}this.swapBuffers()}qe!==void 0&&(n instanceof qe?r=!0:n instanceof nt&&(r=!1))}}this.renderer.setRenderTarget(o)}reset(e){if(e===void 0){let o=this.renderer.getSize(new W);this._pixelRatio=this.renderer.getPixelRatio(),this._width=o.width,this._height=o.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,o){this._width=e,this._height=o;let r=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(r,i),this.renderTarget2.setSize(r,i);for(let a=0;a<this.passes.length;a++)this.passes[a].setSize(r,i)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}};var lt=class extends V{constructor(e,o,r=null,i=null,a=null){super(),this.scene=e,this.camera=o,this.overrideMaterial=r,this.clearColor=i,this.clearAlpha=a,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new u}render(e,o,r){let i=e.autoClear;e.autoClear=!1;let a,n;this.overrideMaterial!==null&&(n=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(a=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:r),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(a),this.overrideMaterial!==null&&(this.scene.overrideMaterial=n),e.autoClear=i}};var No={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new u(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};var ze=class t extends V{constructor(e,o,r,i){super(),this.strength=o!==void 0?o:1,this.radius=r,this.threshold=i,this.resolution=e!==void 0?new W(e.x,e.y):new W(256,256),this.clearColor=new u(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let a=Math.round(this.resolution.x/2),n=Math.round(this.resolution.y/2);this.renderTargetBright=new se(a,n,{type:ue}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let h=0;h<this.nMips;h++){let m=new se(a,n,{type:ue});m.texture.name="UnrealBloomPass.h"+h,m.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(m);let v=new se(a,n,{type:ue});v.texture.name="UnrealBloomPass.v"+h,v.texture.generateMipmaps=!1,this.renderTargetsVertical.push(v),a=Math.round(a/2),n=Math.round(n/2)}let c=No;this.highPassUniforms=pe.clone(c.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new F({uniforms:this.highPassUniforms,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader}),this.separableBlurMaterials=[];let l=[3,5,7,9,11];a=Math.round(this.resolution.x/2),n=Math.round(this.resolution.y/2);for(let h=0;h<this.nMips;h++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[h])),this.separableBlurMaterials[h].uniforms.invSize.value=new W(1/a,1/n),a=Math.round(a/2),n=Math.round(n/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=o,this.compositeMaterial.uniforms.bloomRadius.value=.1;let g=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=g,this.bloomTintColors=[new X(1,1,1),new X(1,1,1),new X(1,1,1),new X(1,1,1),new X(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;let s=it;this.copyUniforms=pe.clone(s.uniforms),this.blendMaterial=new F({uniforms:this.copyUniforms,vertexShader:s.vertexShader,fragmentShader:s.fragmentShader,blending:He,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new u,this.oldClearAlpha=1,this.basic=new Ne,this.fsQuad=new re(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(e,o){let r=Math.round(e/2),i=Math.round(o/2);this.renderTargetBright.setSize(r,i);for(let a=0;a<this.nMips;a++)this.renderTargetsHorizontal[a].setSize(r,i),this.renderTargetsVertical[a].setSize(r,i),this.separableBlurMaterials[a].uniforms.invSize.value=new W(1/r,1/i),r=Math.round(r/2),i=Math.round(i/2)}render(e,o,r,i,a){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();let n=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),a&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=r.texture,e.setRenderTarget(null),e.clear(),this.fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this.fsQuad.render(e);let c=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this.fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=c.texture,this.separableBlurMaterials[l].uniforms.direction.value=t.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[l]),e.clear(),this.fsQuad.render(e),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=t.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[l]),e.clear(),this.fsQuad.render(e),c=this.renderTargetsVertical[l];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(r),this.fsQuad.render(e)),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=n}getSeperableBlurMaterial(e){let o=[];for(let r=0;r<e;r++)o.push(.39894*Math.exp(-.5*r*r/(e*e))/e);return new F({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new W(.5,.5)},direction:{value:new W(.5,.5)},gaussianCoefficients:{value:o}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(e){return new F({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}};ze.BlurDirectionX=new W(1,0);ze.BlurDirectionY=new W(0,1);var Oo={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
	
		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};var ct=class extends V{constructor(){super();let e=Oo;this.uniforms=pe.clone(e.uniforms),this.material=new Mo({name:e.name,uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader}),this.fsQuad=new re(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,o,r){this.uniforms.tDiffuse.value=r.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},vo.getTransfer(this._outputColorSpace)===po&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===lo?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===co?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===uo?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===ot?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===fo?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===ho&&(this.material.defines.NEUTRAL_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(o),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this.fsQuad.render(e))}dispose(){this.material.dispose(),this.fsQuad.dispose()}};var Wo={name:"BokehShader",defines:{DEPTH_PACKING:1,PERSPECTIVE_CAMERA:1},uniforms:{tColor:{value:null},tDepth:{value:null},focus:{value:1},aspect:{value:1},aperture:{value:.025},maxblur:{value:.01},nearClip:{value:1},farClip:{value:1e3}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		#include <common>

		varying vec2 vUv;

		uniform sampler2D tColor;
		uniform sampler2D tDepth;

		uniform float maxblur; // max blur amount
		uniform float aperture; // aperture - bigger values for shallower depth of field

		uniform float nearClip;
		uniform float farClip;

		uniform float focus;
		uniform float aspect;

		#include <packing>

		float getDepth( const in vec2 screenPosition ) {
			#if DEPTH_PACKING == 1
			return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
			#else
			return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		float getViewZ( const in float depth ) {
			#if PERSPECTIVE_CAMERA == 1
			return perspectiveDepthToViewZ( depth, nearClip, farClip );
			#else
			return orthographicDepthToViewZ( depth, nearClip, farClip );
			#endif
		}


		void main() {

			vec2 aspectcorrect = vec2( 1.0, aspect );

			float viewZ = getViewZ( getDepth( vUv ) );

			float factor = ( focus + viewZ ); // viewZ is <= 0, so this is a difference equation

			vec2 dofblur = vec2 ( clamp( factor * aperture, -maxblur, maxblur ) );

			vec2 dofblur9 = dofblur * 0.9;
			vec2 dofblur7 = dofblur * 0.7;
			vec2 dofblur4 = dofblur * 0.4;

			vec4 col = vec4( 0.0 );

			col += texture2D( tColor, vUv.xy );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur9 );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur7 );

			col += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.4,   0.0  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
			col += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur4 );

			gl_FragColor = col / 41.0;
			gl_FragColor.a = 1.0;

		}`};var ut=class extends V{constructor(e,o,r){super(),this.scene=e,this.camera=o;let i=r.focus!==void 0?r.focus:1,a=r.aperture!==void 0?r.aperture:.025,n=r.maxblur!==void 0?r.maxblur:1;this.renderTargetDepth=new se(1,1,{minFilter:St,magFilter:St,type:ue}),this.renderTargetDepth.texture.name="BokehPass.depth",this.materialDepth=new Eo,this.materialDepth.depthPacking=mo,this.materialDepth.blending=tt;let c=Wo,l=pe.clone(c.uniforms);l.tDepth.value=this.renderTargetDepth.texture,l.focus.value=i,l.aspect.value=o.aspect,l.aperture.value=a,l.maxblur.value=n,l.nearClip.value=o.near,l.farClip.value=o.far,this.materialBokeh=new F({defines:Object.assign({},c.defines),uniforms:l,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader}),this.uniforms=l,this.fsQuad=new re(this.materialBokeh),this._oldClearColor=new u}render(e,o,r){this.scene.overrideMaterial=this.materialDepth,e.getClearColor(this._oldClearColor);let i=e.getClearAlpha(),a=e.autoClear;e.autoClear=!1,e.setClearColor(16777215),e.setClearAlpha(1),e.setRenderTarget(this.renderTargetDepth),e.clear(),e.render(this.scene,this.camera),this.uniforms.tColor.value=r.texture,this.uniforms.nearClip.value=this.camera.near,this.uniforms.farClip.value=this.camera.far,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(o),e.clear(),this.fsQuad.render(e)),this.scene.overrideMaterial=null,e.setClearColor(this._oldClearColor),e.setClearAlpha(i),e.autoClear=a}setSize(e,o){this.materialBokeh.uniforms.aspect.value=e/o,this.renderTargetDepth.setSize(e,o)}dispose(){this.renderTargetDepth.dispose(),this.materialDepth.dispose(),this.materialBokeh.dispose(),this.fsQuad.dispose()}};var qo=new X(.3,.15,-1).normalize(),Re=qo.clone(),It={value:0},M={zenith:new u(197903),horizon:new u(1186879),moonGlow:new u(9414896),fog:new u(1450569),haze:new u(2372447),ground:new u(.085,.09,.115),groundLight:new u(.17,.175,.21),mist:new u(6123422),disc:new u(1,.99,.95),rim:new u(8229846).multiplyScalar(.8),band:new u(0)},Gt={band:new u(0),zenith:new u(2765890),horizon:new u(6779261),moonGlow:new u(16764822),haze:new u(6253176),mist:new u(10331826),disc:new u(2.6,2.15,1.5),rim:new u(14268815).multiplyScalar(.5),ridgeNear:new u(5200230),ridgeFar:new u(6252917),key:new u(16770244),fill:new u(11845844),hemiSky:new u(9016744),hemiGround:new u(2565151)},kr={band:new u(13662286),zenith:new u(1711410),horizon:new u(5127248),moonGlow:new u(16752736),fog:new u(71e5),haze:new u(5523030),mist:new u(9863306),disc:new u(1.3,.85,.55),rim:new u(16751196).multiplyScalar(.9),ridgeNear:new u(3813956),ridgeFar:new u(5390415),key:new u(16751194),fill:new u(11049144),hemiSky:new u(6182e3),hemiGround:new u(1380366)};Gt.fog=Gt.horizon.clone().multiplyScalar(1.35);function dt(t,e){let o=Math.sin(t*127.1+e*311.7)*43758.5453;return o-Math.floor(o)}function Ar(t,e){let o=Math.floor(t),r=Math.floor(e),i=t-o,a=e-r,n=i*i*(3-2*i),c=a*a*(3-2*a),l=dt(o,r),g=dt(o+1,r),s=dt(o,r+1),h=dt(o+1,r+1);return l+(g-l)*n+(s-l)*c+(l-g-s+h)*n*c}function $e(t,e,o=5){let r=0,i=.5,a=1;for(let n=0;n<o;n++)r+=i*Ar(t*a,e*a),a*=2.03,i*=.5;return r}var ft=(t,e,o)=>{let r=Math.min(Math.max((o-t)/(e-t),0),1);return r*r*(3-2*r)},pt=`
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*vn(p); p *= 2.03; a *= 0.5; } return s; }
`;function $o(){return new F({side:so,depthWrite:!1,fog:!1,uniforms:{uMoon:{value:Re},uDay:It,uZenith:{value:M.zenith},uHorizon:{value:M.horizon},uGlow:{value:M.moonGlow},uDisc:{value:M.disc},uBand:{value:M.band}},vertexShader:`
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`
      uniform vec3 uMoon, uZenith, uHorizon, uGlow, uDisc, uBand;
      uniform float uDay;
      varying vec3 vDir;
      ${pt}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, h));
        col += uHorizon * 0.35 * exp(-abs(h) * 14.0);
        col += uBand * exp(-abs(h) * 9.0); // dawn/dusk glow, black otherwise
        float m = max(dot(d, uMoon), 0.0);
        col += uGlow * (pow(m, 8.0) * 0.08 + pow(m, 90.0) * 0.14 + pow(m, 1400.0) * 0.3);
        // moon disc with soft maria; by day a larger, softer sun behind haze
        float disc = smoothstep(mix(0.99952, 0.99966, uDay), mix(0.99962, 0.99975, uDay), m);
        vec3 tang = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
        vec3 bit = cross(tang, uMoon);
        vec2 mp = vec2(dot(d, tang), dot(d, bit)) * 1300.0;
        float maria = smoothstep(0.45, 0.75, fbm(mp * 0.06 + 3.0)) * (1.0 - uDay);
        vec3 moon = uDisc * (1.3 - maria * 0.35);
        col = mix(col, moon, disc);
        // thin cloud bands drifting across the lower sky; a grey overcast by day
        float band = fbm(vec2(atan(d.z, d.x) * 3.0, h * 9.0)) * smoothstep(0.02, 0.18, h) * smoothstep(0.45, 0.15, h);
        float deck = smoothstep(0.35, 0.8, fbm(vec2(atan(d.z, d.x) * 2.0, h * 4.0) + 7.0)) * smoothstep(0.05, 0.5, h);
        col = mix(col, uHorizon * 0.55, band * mix(0.45, 0.6, uDay));
        col = mix(col, uZenith * 0.8, deck * uDay * 0.5);
        col += uGlow * band * pow(m, 4.0) * 0.25;
        // by day: a hot halo tight round the sun and faint rays, so it never reads as the moon
        float ray = 0.55 + 0.45 * sin(atan(dot(d, bit), dot(d, tang)) * 13.0) * sin(atan(dot(d, bit), dot(d, tang)) * 5.0 + 1.3);
        col += uGlow * uDay * (pow(m, 900.0) * 0.55 + pow(m, 60.0) * 0.07 + pow(m, 14.0) * ray * 0.05);
        gl_FragColor = vec4(col, 1.0);
      }`})}function Dr(t=1800){let e=new Float32Array(t*3),o=new Float32Array(t),r=new Float32Array(t);for(let n=0;n<t;n++){let c=Math.random(),l=Math.random()*.85+.1,g=c*Math.PI*2,s=l,h=Math.sqrt(1-s*s);e.set([Math.cos(g)*h*180,s*180,Math.sin(g)*h*180],n*3),o[n]=Math.pow(Math.random(),6)*2.6+.6,r[n]=Math.random()*100}let i=new Pe;i.setAttribute("position",new me(e,3)),i.setAttribute("aSize",new me(o,1)),i.setAttribute("aPhase",new me(r,1));let a=new F({transparent:!0,depthWrite:!1,fog:!1,blending:He,uniforms:{uTime:{value:0},uPR:{value:1},uMoon:{value:Re},uDay:It},vertexShader:`
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uPR, uDay; uniform vec3 uMoon;
      varying float vA;
      void main(){
        vec3 d = normalize(position);
        float tw = 0.65 + 0.35 * sin(uTime * (0.6 + fract(aPhase) * 1.8) + aPhase);
        float nearMoon = smoothstep(0.985, 0.94, dot(d, uMoon));
        vA = tw * smoothstep(0.08, 0.35, d.y) * nearMoon * (1.0 - smoothstep(0.0, 0.45, uDay));
        gl_PointSize = aSize * uPR;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,fragmentShader:`
      varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), vA * smoothstep(0.5, 0.0, r)); }`});return new at(i,a)}var jo=`
  uniform vec3 uHaze; uniform float uHazeA, uHazeT;
  void applyHaze(inout vec3 col, vec3 w){
    float h = exp(-max(w.y, 0.0) * 0.42) * smoothstep(12.0, 34.0, length(w.xz - cameraPosition.xz));
    h *= 0.55 + 0.6 * fbm(w.xz * 0.045 + 2.0 + vec2(uHazeT * 0.02, uHazeT * 0.004));
    float bank = vn(vec2(w.x * 0.035 + uHazeT * 0.03, w.z * 0.16 + 4.0));
    h *= 0.7 + 0.6 * smoothstep(0.35, 0.8, bank) * exp(-max(w.y, 0.0) * 0.25);
    col = mix(col, uHaze, clamp(h * uHazeA, 0.0, 1.0));
  }
`,mt={uHaze:{value:M.haze},uHazeA:{value:.85},uHazeT:{value:0}},_r=typeof createImageBitmap<"u"&&!/^((?!chrome|android).)*safari/i.test(navigator.userAgent);function ht(t,e,o){let r=new go;return r.userData.loaded=new Promise(i=>{let a=n=>{r.image=n,r.needsUpdate=!0,i()};_r?(r.flipY=!1,fetch(t).then(n=>n.ok?n.blob():Promise.reject(n.status)).then(n=>createImageBitmap(n,{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"})).then(a,i)):new Ao().load(t,a,void 0,i)}),r.wrapS=r.wrapT=Ct,r.anisotropy=o,e&&(r.colorSpace=Rt),r}var Hr=`
  vec3 groundShade(vec2 p){
    float n = fbm(vec2(p.x * 0.3 + 11.0, p.y * 0.3));
    return mix(uGShadeA, uGShadeB, smoothstep(0.35, 0.75, n) * 0.8);
  }
`,Pr=`
  uniform vec3 uCrackAt, uCrackCol; uniform float uCrackA, uCrackR;
  float ch(float x){ return fract(sin(x * 127.1 + uCrackAt.z) * 43758.5453); }
  // piecewise-linear zigzag: straight runs with sharp kinks, like split earth
  float zig(float x, float s){ float i = floor(x), f = fract(x); return mix(ch(i + s) - 0.5, ch(i + 1.0 + s) - 0.5, f); }
  vec3 crackGlow(vec2 w){
    vec2 p = (w - uCrackAt.xy) / 1.1; float r = length(p);
    if (uCrackA < 0.002 || r > 1.0) return vec3(0.0);
    float a = atan(p.y, p.x), c = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float ang = fi * 0.8976 + ch(fi) * 0.6;
      float off = zig(r * 9.0, fi * 13.0) * 0.07 + zig(r * 23.0, fi * 5.0) * 0.02;
      float da = abs(abs(mod(a - ang + 3.14159, 6.28318) - 3.14159) * r - off * r * 2.0);
      float len = 0.35 + ch(fi + 7.0) * 0.5;
      c += smoothstep(0.0075 * (1.0 - r * 0.5), 0.0, da) * smoothstep(len * uCrackR, len * uCrackR * 0.5, r);
    }
    return uCrackCol * min(c, 1.0) * smoothstep(0.05, 0.12, r) * uCrackA;
  }
`,je={at:new X,color:new u,amount:{value:0},reach:{value:1}};function Qo(t,e,o){t.onBeforeCompile=r=>{Object.assign(r.uniforms,e,mt),o&&(r.defines={...r.defines,GROUND_IMPACT:""}),r.vertexShader=r.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vGW;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`),r.fragmentShader=r.fragmentShader.replace("#include <common>",`#include <common>
        uniform sampler2D uGDiff, uGNor, uGArm;
        uniform vec3 uGShadeA, uGShadeB;
        uniform float uGNs, uEarthL, uGMapIn;
        varying vec3 vGW;
        ${pt}
        ${Hr}
        ${jo}
        ${Pr}`).replace("#include <fog_fragment>",`gl_FragColor.rgb += crackGlow(vGW.xz);
        applyHaze(gl_FragColor.rgb, vGW);
        #include <fog_fragment>`).replace("#include <map_fragment>",`
        vec2 gw = vGW.xz;
        const float GA = 2.4;
        mat2 gR = mat2(cos(GA), sin(GA), -sin(GA), cos(GA));
        vec2 gA = gw * 0.385;
        vec2 gB = gR * gw * 0.233 + vec2(0.37, 0.71);
        float gBl = smoothstep(0.32, 0.68, fbm(gw * 0.085 + 5.0));
        // before the maps are in: plain mid-grey earth and even roughness (uGMapIn 0)
        vec3 gAlb = mix(vec3(0.5), mix(texture2D(uGDiff, gA).rgb, texture2D(uGDiff, gB).rgb, gBl), uGMapIn);
        vec3 gArm = mix(vec3(1.0), mix(texture2D(uGArm, gA).rgb, texture2D(uGArm, gB).rgb, gBl), uGMapIn);
        float gL = dot(gAlb, vec3(0.2126, 0.7152, 0.0722));
        gAlb = mix(vec3(gL), gAlb, 0.8);
        gAlb *= 0.5 + 0.9 * smoothstep(0.25, 0.75, fbm(gw * 0.03 + 3.0));
        diffuseColor.rgb *= gAlb * mix(1.0, gArm.r, 0.75);`).replace("#include <color_fragment>",`
        #ifdef GROUND_IMPACT
          // crater vertex colours are earth/stone/crack shades: keep only their
          // brightness relative to plain earth, on top of the field's shade
          diffuseColor.rgb *= groundShade(gw) * clamp(dot(vColor.rgb, vec3(0.3333)) / uEarthL, 0.25, 1.8);
        #else
          #include <color_fragment>
        #endif`).replace("#include <roughnessmap_fragment>","float roughnessFactor = roughness * mix(0.85, 1.0, gArm.g);").replace("#include <normal_fragment_maps>",`
        {
          vec3 nA = texture2D(uGNor, gA).xyz * 2.0 - 1.0;
          vec3 nB = texture2D(uGNor, gB).xyz * 2.0 - 1.0;
          nB.xy = nB.xy * gR;
          vec3 gn = mix(vec3(0.0, 0.0, 1.0), mix(nA, nB, gBl), uGMapIn);
          gn.xy *= uGNs;
          gn = normalize(gn);
          vec3 gT = mat3(viewMatrix) * vec3(1.0, 0.0, 0.0);
          gT -= normal * dot(gT, normal); gT *= inversesqrt(max(dot(gT, gT), 1e-6));
          vec3 gBt = mat3(viewMatrix) * vec3(0.0, 0.0, 1.0);
          gBt -= normal * dot(gBt, normal); gBt *= inversesqrt(max(dot(gBt, gBt), 1e-6));
          normal = normalize(gT * gn.x + gBt * gn.y + normal * gn.z);
        }`)},t.customProgramCacheKey=()=>o?"ground-impact":"ground"}var zr="assets/textures/brown_mud_rocks_01/",Ur={uGDiff:["diff",!0],uGNor:["nor_gl",!1],uGArm:["arm",!1]},Lr={256:"webp",512:"webp","1k":"jpg","2k":"jpg"};function Br(t,e){return Object.fromEntries(Object.entries(Ur).map(([o,[r,i]])=>[o,ht(`${zr}${r}_${t}.${Lr[t]}`,i,e)]))}function Gr(){let t=(e,o,r,i)=>{let a=new So(new Uint8Array([e,o,r,255]),1,1);return a.wrapS=a.wrapT=Ct,i&&(a.colorSpace=Rt),a.needsUpdate=!0,a};return{uGDiff:{value:t(128,128,128,!0)},uGNor:{value:t(128,128,255,!1)},uGArm:{value:t(255,255,0,!1)},uGMapIn:{value:0},uGShadeA:{value:M.ground},uGShadeB:{value:M.groundLight},uGNs:{value:1.15},uEarthL:{value:(.0423+.0335+.0222)/3},uCrackAt:{value:je.at},uCrackCol:{value:je.color},uCrackA:je.amount,uCrackR:je.reach}}function Fr(t){let e=new rt(240,240,240,240);e.rotateX(-Math.PI/2);let o=e.attributes.position,r=new Float32Array(o.count*3),i=new u;for(let c=0;c<o.count;c++){let l=o.getX(c),g=o.getZ(c),s=Math.hypot(l,(g+2)*1.15),h=ft(9,24,s),m=($e(l*.045,g*.045)-.5)*2.4*h;m+=($e(l*.5,g*.5)-.5)*.07,m+=ft(30,110,s)*$e(l*.02+7,g*.02)*9,o.setY(c,m);let v=$e(l*.3+11,g*.3);i.copy(M.ground).lerp(M.groundLight,ft(.35,.75,v)*.8),r.set([i.r,i.g,i.b],c*3)}e.setAttribute("color",new me(r,3)),e.computeVertexNormals();let a=new ko({vertexColors:!0,roughness:1,metalness:0,side:et});Qo(a,t,!1);let n=new de(e,a);return n.receiveShadow=!0,n}function Ir(t,e){t.name!=="impact_earth"||t.userData.grounded||(t.userData.grounded=!0,t.vertexColors=!0,t.roughness=1,Qo(t,e,!0),t.needsUpdate=!0)}function Nr(){let t=new Oe;return[{z:-95,base:0,amp:12,f:.02,seed:5,color:1055293},{z:-150,base:4,amp:22,f:.012,seed:9,color:1253190}].reverse().forEach(o=>{let r=new Dt;r.moveTo(-320,-20);for(let a=-320;a<=320;a+=4)r.lineTo(a,o.base+$e(a*o.f+o.seed,o.seed)*o.amp);r.lineTo(320,-20);let i=new de(new _t(r),new Ne({color:o.color,fog:!1}));i.userData.near=o.z===-95,i.position.z=o.z,t.add(i)}),t}function Or(t,e=!1){t.onBeforeCompile=o=>{Object.assign(o.uniforms,mt),o.uniforms.uMoonW={value:Re},o.uniforms.uRim={value:M.rim},o.uniforms.uFogC={value:M.fog},o.uniforms.uRuinIn=Ue,o.vertexShader=o.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vRW; varying vec3 vRN;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
        vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRN = normalize(mat3(modelMatrix) * objectNormal);`),o.fragmentShader=o.fragmentShader.replace("#include <common>",`#include <common>
        uniform vec3 uMoonW, uRim, uFogC; uniform float uRuinIn;
        varying vec3 vRW; varying vec3 vRN;
        ${pt}
        ${jo}`).replace("#include <fog_fragment>",`applyHaze(gl_FragColor.rgb, vRW);
        #include <fog_fragment>
        gl_FragColor.rgb = mix(uFogC, gl_FragColor.rgb, uRuinIn * uRuinIn * (3.0 - 2.0 * uRuinIn));
        ${e?`{
          float d = length(vRW - cameraPosition);
          vec3 sil = uFogC * mix(0.6, 0.72, smoothstep(50.0, 95.0, d));
          sil = mix(sil, uFogC, exp(-max(vRW.y, 0.0) * 0.3) * 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, sil, smoothstep(36.0, 64.0, d));
        }`:""}`).replace("#include <color_fragment>",`#include <color_fragment>
        {
          float n = fbm(vRW.xz * 0.45 + vRW.y * 0.25);
          float up = smoothstep(0.55, 0.92, vRN.y);
          float moss = up * smoothstep(0.38, 0.62, n) + smoothstep(1.4, 0.0, vRW.y) * smoothstep(0.3, 0.7, n) * 0.8;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.55, 0.4), clamp(moss, 0.0, 1.0));
          float streak = vn(vec2((vRW.x + vRW.z) * 2.7, vRW.y * 0.12));
          diffuseColor.rgb *= 0.78 + 0.3 * streak;
        }`).replace("#include <lights_fragment_end>",`#include <lights_fragment_end>
        {
          vec3 mv = normalize(mat3(viewMatrix) * uMoonW);
          float fr = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
          reflectedLight.directDiffuse += uRim * fr * smoothstep(-0.05, 0.5, dot(normal, mv));
        }`)},t.customProgramCacheKey=()=>e?"ruin-far":"ruin"}var Ue={value:1},Wr=new Set(["stone","stone_dark","stone_moss","stone_pale"]);function Vr(t,e,o,r,i){let a=new Set,n=new X,c=null,l=()=>{if(c)return c;let m="assets/textures/rock_surface/";return c=[ht(m+"diff_512.webp",!0,o),ht(m+"nor_gl_512.webp",!1,o),ht(m+"arm_512.webp",!1,o)],c},g=Ut("assets/env/ruins-near.glb",5).then(m=>h(m,!0)).catch(m=>{r(),console.error("ruins failed to load",m)}),s=g.then(()=>Ut("assets/env/ruins-far.glb",6)).then(m=>h(m,!1)).catch(m=>{i(),console.error("far ruins failed to load",m)});return Promise.all([g,s]).then(([m])=>m);async function h(m,v){let[N,Y,B]=l(),_=m.scene;_.scale.setScalar(.6),_.position.z=-12,_.updateMatrixWorld(!0),_.traverse(y=>{if(!y.isMesh)return;y.receiveShadow=!0,y.geometry.computeBoundingSphere();let K=y.geometry.boundingSphere;n.copy(K.center).applyMatrix4(y.matrixWorld),y.castShadow=n.length()<26&&K.radius*y.matrixWorld.getMaxScaleOnAxis()<8;let k=y.material,T=k.name.endsWith("_flat"),j=T?k.name.slice(0,-5):k.name;if(j==="cold_glow"){k.emissiveIntensity=Math.min(k.emissiveIntensity,.12);return}a.has(k)||(a.add(k),T&&(k.flatShading=!0),Wr.has(j)&&(k.color.multiplyScalar(5.5),Object.assign(k,{map:N,normalMap:Y,roughnessMap:B,aoMap:B,aoMapIntensity:.8,roughness:1}),k.normalScale.set(1.3,1.3)),Or(k,j==="stone_far"),k.needsUpdate=!0)}),await Promise.all([N,Y,B].map(y=>y.userData.loaded));let J=Ve(t,_,{shadows:["depth"],depthPass:t.depthPass,stage:()=>{_.visible=!1,_.userData.landing=!0,e.add(_)}});return(v?r:i)(),await J,_.visible=!0,_.userData.landing=!1,!v&&t.shown&&(Ue.value=0),_}}var Yo=Array.from({length:6},()=>new Mt(0,0,0,0));function Vo(t,e,o,r){let i=new F({transparent:!0,depthWrite:!1,fog:!1,uniforms:{uTime:{value:0},uColor:{value:M.mist},uAlpha:{value:o},uSpeed:{value:r},uScale:{value:e},uHoles:{value:Yo}},vertexShader:`
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,fragmentShader:`
      uniform float uTime, uAlpha, uSpeed, uScale; uniform vec3 uColor; uniform vec4 uHoles[6];
      varying vec2 vUv; varying vec3 vW;
      ${pt}
      void main(){
        // parted around each blade: thinned in a soft ring and pushed outward
        float part = 1.0; vec2 push = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec2 dv = vW.xz - uHoles[i].xy; float r = uHoles[i].z;
          float d = length(dv);
          float k = r > 0.0 ? smoothstep(r, r * 0.25, d) : 0.0;
          part -= 0.75 * k;
          push += dv / max(d, 1e-3) * k * r * 0.5;
        }
        vec2 p = (vW.xz - push) * uScale;
        float n = fbm(p + vec2(uTime * uSpeed, uTime * uSpeed * 0.4));
        n = fbm(p * 1.3 + n * 1.8 - vec2(uTime * uSpeed * 0.6, 0.0));
        float edge = smoothstep(0.5, 0.18, length(vUv - 0.5));
        gl_FragColor = vec4(uColor, smoothstep(0.35, 0.85, n) * uAlpha * edge * max(part, 0.0));
      }`}),a=new de(new rt(70,50),i);return a.rotation.x=-Math.PI/2,a.position.set(0,t,-6),a.renderOrder=2,a}function qr(t=140){let e=new Float32Array(t*3),o=new Float32Array(t);for(let a=0;a<t;a++)e.set([(Math.random()-.5)*22,Math.random()*3.2+.2,Math.random()*-12+3],a*3),o[a]=Math.random()*100;let r=new Pe;r.setAttribute("position",new me(e,3)),r.setAttribute("aSeed",new me(o,1));let i=new F({transparent:!0,depthWrite:!1,blending:He,uniforms:{uTime:{value:0},uPR:{value:1},uAlpha:{value:1}},vertexShader:`
      attribute float aSeed; uniform float uTime, uPR, uAlpha; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.12 + fract(aSeed) * 0.15) + aSeed;
        p += vec3(sin(t * 1.3) * 0.6, sin(t * 0.9) * 0.35, cos(t * 1.1) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * 1.7 + aSeed * 3.0), 3.0)) * smoothstep(-28.0, -8.0, mv.z) * uAlpha;
        gl_PointSize = (3.0 + fract(aSeed * 7.0) * 3.0) * uPR * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.72, 0.9, 1.0), vA * pow(1.0 - r * 2.0, 2.0) * 0.85); }`});return new at(r,i)}function $r(t=44){let e=new Float32Array(t*3),o=new Float32Array(t);for(let a=0;a<t;a++)e.set([(Math.random()-.5)*24,Math.random()*3+.15,Math.random()*-13+4],a*3),o[a]=Math.random()*100;let r=new Pe;r.setAttribute("position",new me(e,3)),r.setAttribute("aSeed",new me(o,1));let i=new F({transparent:!0,depthWrite:!1,uniforms:{uTime:{value:0},uWind:{value:0},uPR:{value:1},uColor:{value:new u}},vertexShader:`
      attribute float aSeed; uniform float uTime, uWind, uPR; varying float vA;
      void main(){
        vec3 p = position;
        p.x = mod(p.x + uWind * (0.75 + fract(aSeed * 3.1) * 0.5) + 12.0, 24.0) - 12.0;
        p.y += sin(uTime * 0.8 + aSeed) * 0.22 + sin(uTime * 2.3 + aSeed * 5.0) * 0.04;
        p.z += sin(uTime * 0.5 + aSeed * 2.0) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(12.0, 9.5, abs(p.x)) * smoothstep(-26.0, -6.0, mv.z) * (0.45 + 0.55 * fract(aSeed * 7.3));
        gl_PointSize = (1.6 + fract(aSeed * 5.7) * 1.6) * uPR * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      uniform vec3 uColor; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.15, r) * 0.7); }`});return new at(r,i)}function jr(t=3){let e=new Dt;e.moveTo(0,-.05),e.quadraticCurveTo(.032,-.01,0,.05),e.quadraticCurveTo(-.032,-.01,0,-.05);let o=new _t(e,4),r=new _o().copy(o);r.instanceCount=t,r.setAttribute("aSeed",new Ro(new Float32Array(Array.from({length:t},(n,c)=>c*.37+Math.random()*.2)),1));let i=new F({side:et,uniforms:{uTime:{value:0},uWind:{value:0},uColor:{value:new u}},vertexShader:`
      attribute float aSeed; uniform float uTime, uWind; varying float vShade;
      mat3 rot(vec3 a){ vec3 s = sin(a), c = cos(a);
        return mat3(c.y*c.z, c.y*s.z, -s.y, s.x*s.y*c.z - c.x*s.z, s.x*s.y*s.z + c.x*c.z, s.x*c.y, c.x*s.y*c.z + s.x*s.z, c.x*s.y*s.z - s.x*c.z, c.x*c.y); }
      void main(){
        // each leaf crosses the 20 m field once per lap of 70-100 m of wind
        float L = 70.0 + fract(aSeed * 7.7) * 30.0;
        float x = mod(uWind * 1.3 + aSeed * 41.0, L) - 10.0;
        float on = step(x, 10.0);
        float u = (x + 10.0) / 20.0;
        vec3 a = vec3(uTime * 2.1 + aSeed * 9.0, uTime * 1.3 + aSeed * 3.0, uTime * 2.7);
        vec3 p = rot(a) * position * on;
        vShade = 0.55 + 0.45 * abs(rot(a)[2].z);
        p += vec3(x, 2.4 - u * 2.0 + sin(uTime * 1.7 + aSeed * 6.0) * 0.18, -5.0 + fract(aSeed * 3.3) * 7.0 + sin(uTime * 0.9 + aSeed) * 0.4);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,fragmentShader:`
      uniform vec3 uColor; varying float vShade;
      void main(){ gl_FragColor = vec4(uColor * vShade, 1.0); }`}),a=new de(r,i);return a.frustumCulled=!1,a}var Bt="varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",Ft=class extends V{constructor(){super(),this.needsSwap=!1,this.enabled=!1;let e={type:ue,depthBuffer:!1};this.rtA=new se(1,1,e),this.rtB=new se(1,1,e),this.light=new W(.5,.5),this.aspect=1,this.mask=new F({uniforms:{tColor:{value:null},tDepth:{value:null},uLight:{value:this.light},uAspect:{value:1},uFloor:{value:new u}},vertexShader:Bt,fragmentShader:`
        uniform sampler2D tColor, tDepth; uniform vec2 uLight; uniform float uAspect; uniform vec3 uFloor; varying vec2 vUv;
        void main(){
          float sky = step(0.99999, texture2D(tDepth, vUv).x);
          vec2 d = (vUv - uLight) * vec2(uAspect, 1.0);
          float near = exp(-dot(d, d) * 14.0);
          vec3 c = texture2D(tColor, vUv).rgb;
          // only what outshines the plain sky: the disc and its halo
          c = max(min(c, vec3(3.0)) - uFloor, 0.0);
          gl_FragColor = vec4(c * sky * near, 1.0);
        }`,depthTest:!1,depthWrite:!1});let o=r=>new F({uniforms:{tIn:{value:null},uLight:{value:this.light},uStep:{value:r}},vertexShader:Bt,fragmentShader:`
        uniform sampler2D tIn; uniform vec2 uLight; uniform float uStep; varying vec2 vUv;
        void main(){
          vec2 dv = (uLight - vUv) * uStep;
          float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 uv = vUv + dv * j;
          vec3 acc = vec3(0.0); float w = 1.0, sum = 0.0;
          for (int i = 0; i < 16; i++) { acc += texture2D(tIn, uv).rgb * w; sum += w; w *= 0.93; uv += dv; }
          gl_FragColor = vec4(acc / sum, 1.0);
        }`,depthTest:!1,depthWrite:!1});this.blurA=o(.045),this.blurB=o(.012),this.add=new F({uniforms:{tIn:{value:null},uTint:{value:new u},uStrength:{value:0},uLight:{value:this.light},uAspect:this.mask.uniforms.uAspect},vertexShader:Bt,fragmentShader:`
        uniform sampler2D tIn; uniform vec3 uTint; uniform float uStrength, uAspect; uniform vec2 uLight; varying vec2 vUv;
        void main(){
          vec2 d = (vUv - uLight) * vec2(uAspect, 1.0);
          float r = length(d);
          // kept off the disc itself, so the moon stays crisp and the shafts start beside it
          gl_FragColor = vec4(texture2D(tIn, vUv).rgb * uTint * uStrength * exp(-r * 1.6) * mix(0.18, 1.0, smoothstep(0.03, 0.16, r)), 1.0);
        }`,blending:He,transparent:!0,depthTest:!1,depthWrite:!1}),this.quad=new re(this.mask)}setSize(e,o){this.rtA.setSize(Math.max(1,e>>1),Math.max(1,o>>1)),this.rtB.setSize(Math.max(1,e>>1),Math.max(1,o>>1)),this.mask.uniforms.uAspect.value=e/Math.max(o,1)}render(e,o,r){let i=this.quad;this.mask.uniforms.tColor.value=r.texture,this.mask.uniforms.tDepth.value=r.depthTexture,i.material=this.mask,e.setRenderTarget(this.rtA),i.render(e),this.blurA.uniforms.tIn.value=this.rtA.texture,i.material=this.blurA,e.setRenderTarget(this.rtB),i.render(e),this.blurB.uniforms.tIn.value=this.rtB.texture,i.material=this.blurB,e.setRenderTarget(this.rtA),i.render(e),this.add.uniforms.tIn.value=this.rtA.texture,i.material=this.add;let a=e.autoClear;e.autoClear=!1,e.setRenderTarget(r),i.render(e),e.autoClear=a}};function Qr(t){let e=new At;e.add(new de(new Ht(50,48,24),$o()));let o=(a,n,c,l,g)=>{let s=new de(new rt(a,n),new Ne({color:new u(13162239).multiplyScalar(c),side:et}));s.position.set(...l),s.lookAt(...g),e.add(s)};o(30,6,1.4,[0,18,14],[0,0,0]),o(26,7,.9,[0,3,30],[0,1.5,0]),o(4,26,2.2,[-20,6,-16],[0,2,0]),o(4,20,.7,[22,5,6],[0,2,0]);let r=new bo(t),i=r.fromScene(e,.02,.1,100).texture;return r.dispose(),i}var Yr={uniforms:{tDiffuse:{value:null},uTime:{value:0},uRes:{value:new W(1,1)},uGrade:{value:1}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrade; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // grade (display space): a gentle filmic S that leaves the blacks where
      // they are, cool shadows, warm highlights
      vec3 gr = clamp(c.rgb, 0.0, 1.0);
      gr += 0.38 * gr * (1.0 - gr) * (gr - 0.2);
      float l = dot(gr, vec3(0.2126, 0.7152, 0.0722));
      gr += vec3(-0.006, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.35, l)) + vec3(0.018, 0.008, -0.012) * smoothstep(0.35, 0.95, l);
      c.rgb = mix(c.rgb, gr, uGrade);
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
      c.rgb *= mix(0.55, 1.0, smoothstep(1.05, 0.25, length(q)));
      float g = fract(sin(dot(floor(vUv * uRes) + floor(uTime * 24.0) * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * 0.022;
      gl_FragColor = c;
    }`},Kr={uniforms:{tDiffuse:{value:null},uRes:{value:new W(1,1)},uStrata:{value:new Mt(0,0,1,0)},uCamY:{value:0},uFlare:{value:new X(.5,.5,0)}},vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`
    uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    uniform vec4 uStrata; uniform float uCamY; uniform vec3 uFlare;
    float sh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float sn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(sh(i), sh(i+vec2(1,0)), u.x), mix(sh(i+vec2(0,1)), sh(i+vec2(1,1)), u.x), u.y); }
    // A cut through the ground at the camera's depth: soil, clay, gravel, bedrock,
    // warm near the smithy's roof. Drawn in world metres, so it slides past as the camera sinks.
    vec3 earth(vec2 uv){
      vec2 w = vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y - 0.5) * 4.2;
      float y = uCamY + w.y;
      float d = -y + (sn(vec2(w.x * 0.4, y * 0.3)) - 0.5) * 1.3;
      vec3 c = vec3(0.050, 0.042, 0.038);                                   // topsoil
      c = mix(c, vec3(0.105, 0.072, 0.052), smoothstep(1.0, 1.25, d));       // clay
      c = mix(c, vec3(0.068, 0.066, 0.068), smoothstep(3.4, 3.6, d));        // gravel
      c = mix(c, vec3(0.050, 0.054, 0.068), smoothstep(6.2, 6.5, d));        // bedrock
      c = mix(c, vec3(0.085, 0.050, 0.032), smoothstep(9.6, 11.6, d));       // warm above the smithy
      // sediment: thin bands, light and dark, gently wavy
      float band = fract(d * 1.6 + sn(vec2(w.x * 0.8, d)) * 0.5);
      c *= 1.0 + 0.35 * smoothstep(0.05, 0.0, abs(band - 0.5)) - 0.25 * smoothstep(0.1, 0.0, band);
      c *= 0.84 + 0.3 * sn(vec2(w.x, y) * 36.0);                             // grain
      // stones: thick in the gravel, scattered elsewhere; lit from the side the light comes from
      vec2 p = vec2(w.x, y) * 2.6;
      vec2 cell = floor(p), f = fract(p) - 0.5;
      float h = sh(cell);
      float dens = 0.05 + 0.4 * smoothstep(3.3, 3.7, d) * (1.0 - smoothstep(6.0, 6.6, d)) + 0.1 * smoothstep(6.6, 7.4, d);
      if (h < dens) {
        vec2 o = (vec2(sh(cell + 7.1), sh(cell + 3.3)) - 0.5) * 0.3;
        float r = 0.1 + 0.2 * sh(cell + 1.9);
        vec2 e = (f - o) / vec2(r * (1.0 + 0.5 * sh(cell + 4.4)), r);
        float k = dot(e, e) + (sn(f * 9.0 + cell) - 0.5) * 0.45;
        float from = mix(1.0, -1.0, smoothstep(8.5, 11.5, d));               // moon above, fire below
        float lit = clamp(0.5 + 0.6 * e.y * from, 0.0, 1.0);
        vec3 stone = mix(vec3(0.15, 0.15, 0.16), vec3(0.17, 0.13, 0.10), smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(3.4, 4.0, d)));
        stone *= (0.75 + 0.5 * sh(cell + 5.2)) * (0.4 + 0.8 * lit);
        vec2 sd = e + vec2(0.0, 0.45 * from);
        c *= 1.0 - 0.45 * smoothstep(1.7, 0.9, dot(sd, sd));                // its shadow on the earth
        c = mix(c, stone, smoothstep(1.0, 0.84, k));
      }
      return c;
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uFlare.z > 0.0) {
        vec2 fd = (vUv - uFlare.xy) * vec2(uRes.x / uRes.y, 1.0);
        float streak = exp(-abs(fd.y) * 110.0) * exp(-abs(fd.x) * 2.6);
        c.rgb += vec3(0.72, 0.84, 1.0) * uFlare.z * (streak * 0.6 + exp(-dot(fd, fd) * 70.0) * 0.4);
      }
      if (uStrata.w > 0.0) {
        // edge 1 enters first (the ground going down, the smithy's roof going up), edge 2 lets go
        bool down = uStrata.z > 0.0;
        float uy = down ? vUv.y : 1.0 - vUv.y;
        float a = uStrata.x * 1.3 - 0.15 + (sn(vec2(vUv.x * 9.0, 1.7)) - 0.5) * 0.07 + (sn(vec2(vUv.x * 37.0, 4.2)) - 0.5) * 0.025;
        float b = uStrata.y * 1.3 - 0.15 + (sn(vec2(vUv.x * 7.0, 8.3)) - 0.5) * 0.09 + (sn(vec2(vUv.x * 29.0, 2.6)) - 0.5) * 0.03;
        float m = smoothstep(a + 0.003, a - 0.003, uy) * smoothstep(b - 0.003, b + 0.003, uy);
        vec3 moonC = vec3(0.32, 0.42, 0.7), fireC = vec3(1.0, 0.42, 0.14);
        vec3 e = earth(vUv);
        e += (down ? moonC : fireC) * exp(-max(a - uy, 0.0) * 14.0) * 0.3;
        e += (down ? fireC : moonC) * exp(-max(uy - b, 0.0) * 10.0) * 0.32;
        c.rgb = mix(c.rgb, e, m);
      }
      gl_FragColor = c;
    }`};function Ko(t){let e=new To({canvas:t,antialias:!0,powerPreference:"high-performance"}),o=Math.min(window.devicePixelRatio,1.75);e.setPixelRatio(o),e.toneMapping=ot,e.toneMappingExposure=1.05,e.shadowMap.enabled=!0,e.shadowMap.type=no;let r=new At;r.fog=new Co(M.fog,.022),r.environment=Qr(e),r.environmentIntensity=1.35;let i=new xo(30,1,.1,400),a=new de(new Ht(300,64,32),$o());a.renderOrder=-2;let n=Dr();n.renderOrder=-1;let c=new Oe;c.add(a,n);let l=Math.min(8,e.capabilities.getMaxAnisotropy()),g=Gr(),s=0,h=new Oe,m=new Oe;m.visible=!1;let v=Nr();h.add(v,Fr(g)),r.add(c,h,m);let N=Vo(.14,.18,.16,.05),Y=Vo(.7,.1,.06,.03),B=qr(),_=$r(),J=jr();h.add(N,Y,B,_,J);let y=new Pt(12374271,2.6);y.position.copy(qo).multiplyScalar(30).setY(16),y.castShadow=!0,y.shadow.mapSize.set(2048,2048),Object.assign(y.shadow.camera,{left:-12,right:12,top:10,bottom:-6,near:1,far:70}),y.shadow.bias=-4e-4,y.shadow.normalBias=.02;let K=new Pt(10334440,1.25);K.position.set(3,4,9);let k=new Do(2899322,329228,.5);h.add(y,K,k),r.add(y.target);let T=new st(e);for(let f of[T.renderTarget1,T.renderTarget2])f.depthTexture=new yo(1,1);T.addPass(new lt(r,i));let j=new Ft;T.addPass(j);let O=new ut(r,i,{focus:4,aperture:0,maxblur:.006});O.materialDepth.name="dof-depth",O.enabled=!1,T.addPass(O);let E=new ze(new W(1,1),.5,.55,.88);T.addPass(E),T.addPass(new ct);let L=new Se(Kr);L.enabled=!1,T.addPass(L);let H=new Se(Yr);T.addPass(H);function I(){let f=window.innerWidth,b=window.innerHeight;e.setSize(f,b,!1),T.setSize(f,b),E.resolution.set(f,b),i.aspect=f/b,i.updateProjectionMatrix();let G=e.getPixelRatio();H.uniforms.uRes.value.set(f*G,b*G),L.uniforms.uRes.value.set(f*G,b*G),n.material.uniforms.uPR.value=G,B.material.uniforms.uPR.value=G*(b/900),_.material.uniforms.uPR.value=G*(b/900)}I();let S=new X,P=new X,q=0,ne=0;function Ze(f){let b=Math.min(Math.max(f-ne,0),.1);ne=f;let G=$.quality?.fx!==!1,oe=$.windPhase?.()??f*.07,he=.5+.5*Math.sin(oe*Math.PI*2);q+=b*(.35+.9*he),mt.uHazeT.value=f,_.visible=J.visible=G,_.material.uniforms.uTime.value=J.material.uniforms.uTime.value=f,_.material.uniforms.uWind.value=J.material.uniforms.uWind.value=q;let be=0;if(G&&!C&&Ce>0&&(i.getWorldDirection(P),P.dot(Re)>.2)){S.copy(Re).multiplyScalar(100).add(i.position).project(i);let Ie=Math.max(Math.abs(S.x),Math.abs(S.y));be=Ce*ft(1.5,.95,Ie),j.light.set(S.x*.5+.5,S.y*.5+.5)}j.enabled=be>.002,j.add.uniforms.uStrength.value=be,c.position.copy(i.position),n.material.uniforms.uTime.value=f,N.material.uniforms.uTime.value=f,Y.material.uniforms.uTime.value=f,Ue.value<1&&(Ue.value=Math.min(1,Ue.value+b/3.5)),s&&g.uGMapIn.value<1&&(g.uGMapIn.value=Math.min(1,g.uGMapIn.value+b/1.2)),B.material.uniforms.uTime.value=f,H.uniforms.uTime.value=f}function Et(f,b){O.enabled=b>.01,O.uniforms.focus.value=f,O.uniforms.aperture.value=b*.0035}let ke={zenith:M.zenith.clone(),horizon:M.horizon.clone(),moonGlow:M.moonGlow.clone(),fog:M.fog.clone(),haze:M.haze.clone(),mist:M.mist.clone(),disc:M.disc.clone(),rim:M.rim.clone(),band:M.band.clone(),ridgeNear:new u(1055293),ridgeFar:new u(1253190),key:y.color.clone(),fill:K.color.clone(),hemiSky:k.color.clone(),hemiGround:k.groundColor.clone()},Ae={key:[y.intensity,4.2,3.4],keyY:[16,24,6],elev:[.15,.17,.11],fill:[K.intensity,1.3,1],hemi:[k.intensity,1.25,.8],density:[r.fog.density,.0145,.02],hazeA:[.85,.5,.8],exposure:[e.toneMappingExposure,.86,.98],bloom:[E.strength,.3,.38],env:[r.environmentIntensity,1.1,1],motes:[1,.25,.6],shafts:[.85,.5,.7]},Ce=0,De={night:new u(.32,.36,.46),day:new u(.42,.4,.38)},Fe={night:new u(.035,.032,.035),day:new u(.16,.11,.07)},p=new u(722950),R=0,z=0,C=!1,ee=(f,b)=>f.copy(ke[b]).lerp(Gt[b],R).lerp(kr[b],z),te=f=>{let[b,G,oe]=Ae[f],he=b+(G-b)*R;return he+(oe-he)*z},Tr=v.children.map(f=>[f.material,f.userData.near?"ridgeNear":"ridgeFar"]);function to(){It.value=R;for(let f of["zenith","horizon","moonGlow","fog","haze","mist","disc","rim","band"])ee(M[f],f);for(let[f,b]of Tr)ee(f.color,b);ee(y.color,"key"),ee(K.color,"fill"),ee(k.color,"hemiSky"),ee(k.groundColor,"hemiGround"),Re.set(.3,te("elev"),-1).normalize(),y.position.copy(Re).multiplyScalar(30).setY(te("keyY")),mt.uHazeA.value=te("hazeA"),B.material.uniforms.uAlpha.value=te("motes"),Ce=te("shafts"),j.add.uniforms.uTint.value.copy(M.moonGlow).lerp(M.disc,.5),j.mask.uniforms.uFloor.value.copy(M.horizon).multiplyScalar(1.6),_.material.uniforms.uColor.value.copy(De.night).lerp(De.day,R),J.material.uniforms.uColor.value.copy(Fe.night).lerp(Fe.day,R),H.uniforms.uGrade.value=C?0:1,E.strength=C?Ae.bloom[0]:te("bloom"),r.environmentIntensity=C?Ae.env[0]:te("env"),e.toneMappingExposure=C?Ae.exposure[0]:te("exposure"),y.intensity=C?0:te("key"),K.intensity=C?0:te("fill"),k.intensity=C?0:te("hemi"),r.fog.color.copy(C?p:M.fog),r.fog.density=C?.06:te("density")}function Cr(f,b){R=Math.min(1,Math.max(0,f)),z=b??Math.pow(Math.sin(Math.PI*R),1.5)*.85,to()}function Tt(f){c.visible=h.visible=!f,m.visible=f,y.shadow.autoUpdate=!f,C=f,$.shadowHold=1,to()}function Sr(f=!1){let b=e.getRenderTarget(),G=C,oe=$.shadowHold,he=[],be=[],Ie=new Set;r.traverse(A=>{(A.isMesh||A.isPoints||A.isSprite)&&A.frustumCulled&&(A.frustumCulled=!1,he.push(A)),A.userData.landing&&!A.visible&&(A.visible=!0,be.push(A));for(let Je of[].concat(A.material||[]))Je.userData.baseOpacity!==void 0&&Ie.add(Je)});let ao=()=>Ie.forEach(A=>{A.transparent=!A.transparent,A.needsUpdate=!0}),io=[];r.traverse(A=>{A.isLight&&A.castShadow&&(io.push([A,A.shadow.autoUpdate]),A.shadow.autoUpdate=!0)});try{f!==C&&Tt(f),e.setRenderTarget(T.readBuffer),e.shadowMap.needsUpdate=!1,e.render(r,i),e.shadowMap.needsUpdate=!0,e.render(r,i),f||O.render(e,T.writeBuffer,T.readBuffer),L.render(e,T.writeBuffer,T.readBuffer),!f&&Ie.size&&(ao(),e.setRenderTarget(T.readBuffer),e.render(r,i),O.render(e,T.writeBuffer,T.readBuffer),ao())}finally{G!==C&&Tt(G),$.shadowHold=Math.max(oe,1),io.forEach(([A,Je])=>{A.shadow.autoUpdate=Je}),he.forEach(A=>{A.frustumCulled=!0}),be.forEach(A=>{A.visible=!1}),e.setRenderTarget(b)}}let $={renderer:e,scene:r,camera:i,composer:T,resize:I,update:Ze,setFocus:Et,setUnderground:Tt,setDaylight:Cr,mistHoles:Yo,crack:je,outdoor:h,underground:m,depthPass:O.materialDepth,rehearse:Sr,shadowHold:1,quality:{dof:!0,fx:!0},windPhase:null,render:()=>{let f=L.uniforms;L.enabled=f.uStrata.value.w>0||f.uFlare.value.z>0,T.render()},post:L.uniforms,groundImpact:f=>Ir(f,g),setShadowDetail(f){let b=f?2048:1024;y.shadow.mapSize.x!==b&&(y.shadow.mapSize.set(b,b),y.shadow.map?.dispose(),y.shadow.map=null,$.shadowHold=0)},async upgradeGround(f){let b=[0,256,512,"1k","2k"];if(!(b.indexOf(f)<=b.indexOf(s)||$.groundBusy)){$.groundBusy=!0;try{let G=Br(f,l);if(await Promise.all(Object.values(G).map(oe=>oe.userData.loaded)),Object.values(G).some(oe=>!oe.image))return;await Po($,Object.values(G));for(let[oe,he]of Object.entries(G)){let be=g[oe].value;g[oe].value=he,be.dispose()}s=f}finally{$.groundBusy=!1}}},shown:!1,ruins:null},oo,ro;return $.ruinsArrived=new Promise(f=>{oo=f}),$.farArrived=new Promise(f=>{ro=f}),$.ruins=Vr($,h,l,oo,ro).then(f=>(f&&$.shown&&(Ue.value=0),f)),$}var Xr={\u00E7:"c",\u011F:"g",\u0131:"i",\u00F6:"o",\u015F:"s",\u00FC:"u",\u00E2:"a",\u00EE:"i",\u00FB:"u"},Ot=t=>t.replace(/İ/g,"i").replace(/I/g,"\u0131").toLowerCase().replace(/[çğıöşüâîû]/g,e=>Xr[e]),le,ge,ye,Zo=[],ae=[],ve=0,Le=null,Jo=0;function er(t){le=document.querySelector(".palette"),ge=le.querySelector("input"),ye=le.querySelector("ul"),le.addEventListener("pointerdown",e=>{e.target===le&&vt()}),ge.addEventListener("input",()=>{ve=0,tr()}),ge.addEventListener("keydown",e=>{e.key==="ArrowDown"||e.key==="ArrowUp"?(e.preventDefault(),ae.length&&(ve=(ve+(e.key==="ArrowDown"?1:-1)+ae.length)%ae.length),Wt()):e.key==="Enter"?(e.preventDefault(),Xo(ae[ve])):e.key==="Escape"?(e.preventDefault(),e.stopPropagation(),vt()):e.key==="Tab"&&e.preventDefault()}),ye.addEventListener("click",e=>{let o=e.target.closest("li[data-i]");o&&Xo(ae[+o.dataset.i])}),ye.addEventListener("pointermove",e=>{let o=e.target.closest("li[data-i]");o&&+o.dataset.i!==ve&&(ve=+o.dataset.i,Wt())}),window.addEventListener("keydown",e=>{if(Be())return;let o=e.target.closest?.('input, textarea, [contenteditable="true"]');((e.key==="k"||e.key==="K")&&(e.ctrlKey||e.metaKey)&&!e.altKey||e.key==="/"&&!o&&!e.ctrlKey&&!e.metaKey&&!e.altKey)&&(e.preventDefault(),Nt(t()))}),document.querySelectorAll("[data-palette]").forEach(e=>e.addEventListener("click",()=>Nt(t())))}var Be=()=>le?.classList.contains("is-on");function Nt(t){clearTimeout(Jo),Zo=t.map(e=>({...e,hay:Ot(`${e.label} ${e.group||""} ${e.keys||""}`),head:Ot(e.label)})),Le=document.activeElement,ge.value="",ve=0,tr(),le.hidden=!1,le.getBoundingClientRect(),le.classList.add("is-on"),ge.focus({preventScroll:!0})}function vt(){Be()&&(le.classList.remove("is-on"),Jo=setTimeout(()=>{le.hidden=!0},160),Le&&document.contains(Le)&&Le!==document.body?Le.focus({preventScroll:!0}):ge.blur(),Le=null)}function tr(){let t=Ot(ge.value.trim()).split(/\s+/).filter(Boolean);if(ae=Zo.filter(e=>t.every(o=>e.hay.includes(o))),t.length&&(ae=[...ae.filter(e=>e.head.startsWith(t[0])),...ae.filter(e=>!e.head.startsWith(t[0]))]),ye.replaceChildren(...ae.map((e,o)=>{let r=document.createElement("li");r.id=`pal-${o}`,r.dataset.i=o,r.setAttribute("role","option"),e.small&&(r.className="is-small");let i=document.createElement("span");i.className="pal-l",i.textContent=e.label;let a=document.createElement("span");return a.className="pal-g",a.textContent=e.group||"",e.lang&&(a.lang=e.lang),r.append(i,a),r})),!ae.length){let e=document.createElement("li");e.className="pal-none",e.textContent=w("Bulunamad\u0131"),ye.append(e)}Wt()}function Wt(){[...ye.children].forEach(e=>e.setAttribute("aria-selected",String(+e.dataset.i===ve)));let t=ye.querySelector(`#pal-${ve}`);t?(ge.setAttribute("aria-activedescendant",t.id),t.scrollIntoView({block:"nearest"})):ge.removeAttribute("aria-activedescendant")}async function Xo(t){if(!t)return;let e=await t.run(t);if(e){let o=ye.querySelector(`#pal-${ae.indexOf(t)} .pal-l`);o&&typeof e=="string"&&(o.textContent=e),setTimeout(vt,700)}else vt()}var U=t=>document.querySelector(t),D=document.body,d={},x=null,Zr=-1,Me=null,Ee=null,Vt=null,xt=Z.filter(t=>t.slug),Yt="hakkimda",bt=[Yt,"yazilar"],Jr="referanslar",ce="demirhane",Te=t=>t?.place==="forge",ar=t=>xt.filter(e=>Te(e)===Te(Z.find(o=>o.slug===t))).map(e=>e.slug),fe=t=>Z[t]?.slug,ir=t=>Z.findIndex(e=>e.slug===t),Q=()=>location.hash.replace(/^#\/?/,""),Qe=t=>String(t).padStart(2,"0");function qt(t){if(!t)return;let e=o=>{for(let r of[...o.childNodes]){if(r.nodeType===1){r.classList.contains("sc")||e(r);continue}if(r.nodeType!==3)continue;let i=r.textContent.split(/(\p{Ll}+)/u);if(i.length<2)continue;let a=document.createDocumentFragment();i.forEach((n,c)=>{if(n)if(c%2){let l=document.createElement("span");l.className="sc",l.textContent=n,a.append(l)}else a.append(n)}),r.replaceWith(a)}};e(t),t.classList.add("has-sc")}function nr(){document.querySelectorAll(".brand-name, .entry h2, .writings b, .credits b").forEach(qt),Object.values(d.articles).forEach(t=>{let e=0;for(let o of t.children)(o.matches(".facts, .repos, .writings, .credits")?[...o.children]:[o]).forEach(i=>{i.classList.add("ln"),i.style.setProperty("--i",e++)})})}function sr(){d.buttons.forEach(t=>{t.querySelector(".l").textContent=w(Z.find(e=>e.slug===t.dataset.slug).label)}),d.dig.querySelector(".l").textContent=w("Demirhane"),d.dig.setAttribute("aria-label",w("Demirhane\u2019ye in"))}function ea(){nr(),sr(),wt(U("[data-sound-toggle]")?.getAttribute("aria-pressed")==="true"),U("[data-mode-toggle]").textContent=w(D.classList.contains("is-list")?"Sahne":"Liste"),Qt=""}var xe=()=>D.classList.contains("is-list")||D.classList.contains("no-webgl"),lr=t=>{try{return localStorage.getItem(t)==="1"}catch{return!1}},cr=t=>{try{localStorage.setItem(t,"1")}catch{}},ta=window.matchMedia("(hover: hover) and (pointer: fine)"),$t=window.matchMedia("(min-width: 761px)");function ie(t){if(t){let e=`#/${t}`;location.hash!==e?location.hash=e:Ge()}else location.hash&&(history.pushState(null,"",location.pathname+location.search),Ge())}function ur(){let t=U("details.sources");t&&(t.open=!0,t.querySelector("summary").focus())}function Ge(){if(Q()===Jr&&(history.replaceState(null,"",location.pathname+location.search),ur()),xe()){let r=d.articles[Q()];r?r.scrollIntoView():window.scrollTo(0,0);return}if(!x)return;let t=Q(),e=ir(t);if(d.buttons.forEach(r=>r.setAttribute("aria-current",r.dataset.slug===t?"true":"false")),bt.includes(t)){x.request(x.below||typeof x.asked=="string"?ce:-1),Ye(t);return}if(t===ce){Ke(),x.request(ce);return}let o=Z[e];if(Te(o)){x.request(`${ce}:${o.station}`);return}(e<0||x.below)&&Ke(),x.request(e),e>=0&&!x.isPlanted(e)&&Ye(t)}function dr(){bt.includes(Q())||Ke()}function wt(t){let e=U("[data-sound-toggle]");e&&(e.setAttribute("aria-pressed",String(t)),e.textContent=w(t?"Ses a\xE7\u0131k":"Ses kapal\u0131"))}function or(){ie(x?.below&&!bt.includes(Q())&&Q()!==ce?ce:null)}function gt(t){x&&x.state==="home"&&!x.portrait&&x.setHover(t)}function oa(t){x&&x.portrait&&x.state==="home"&&x.hovered!==t?x.setHover(t):ie(fe(t))}function fr(){d.list=U(".index ol"),d.tag=U(".tag"),d.tagNum=U(".tag-num"),d.tagTitle=U(".tag-title"),d.panel=U(".panel"),d.index=U(".index"),d.count=U(".step-count"),d.loaderBar=U(".loader-bar");let t=U("[data-credits]");Uo.forEach(s=>{let h=document.createElement("li"),m=document.createElement("b");m.textContent=s.name,m.lang="en";let v=document.createElement("a");v.href=s.url,v.rel="noopener",v.target="_blank",v.textContent=s.author;let N=document.createElement("span");N.textContent=s.license,h.append(m,N,v),t?.appendChild(h)});let e=U("details.sources");document.addEventListener("pointerdown",s=>{e?.open&&!e.contains(s.target)&&(e.open=!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&e?.open&&(e.open=!1,e.querySelector("summary").focus())}),d.articles=Object.fromEntries([...document.querySelectorAll(".entry")].map(s=>[s.id,s])),nr(),d.cue=U(".cue"),d.keys=U(".keys-hint"),d.announce=U("[data-announce]"),$t.addEventListener("change",()=>{D.classList.contains("is-open")&&(d.index.inert=!$t.matches)}),d.buttons=xt.filter(s=>!Te(s)).map(s=>{let h=Z.indexOf(s),m=document.createElement("li"),v=document.createElement("button");v.type="button",v.dataset.slug=s.slug,v.style.setProperty("--c",s.accent);let N=document.createElement("span");N.className="n",N.textContent=Qe(h+1);let Y=document.createElement("span");return Y.className="l",v.append(N,Y),v.addEventListener("click",()=>oa(h)),v.addEventListener("mouseenter",()=>gt(h)),v.addEventListener("focus",()=>gt(h)),v.addEventListener("mouseleave",()=>gt(-1)),v.addEventListener("blur",()=>gt(-1)),m.appendChild(v),d.list.appendChild(m),v});let o=document.createElement("li");o.className="dig",o.innerHTML='<button type="button"><span class="l"></span><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>',o.firstChild.addEventListener("click",()=>ie(ce)),d.dig=o.firstChild,sr(),d.list.appendChild(o),d.cue&&o.appendChild(d.cue),document.querySelectorAll("[data-home]").forEach(s=>s.addEventListener("click",h=>{h.preventDefault(),ie(null),xe()&&window.scrollTo(0,0)})),document.querySelectorAll("[data-back]").forEach(s=>s.addEventListener("click",h=>{h.preventDefault(),or()})),document.querySelectorAll("[data-about]").forEach(s=>s.addEventListener("click",h=>{h.preventDefault(),ie(Yt)}));let r=s=>{let h=ar(Q()),m=h.indexOf(Q());m<0||ie(h[(m+s+h.length)%h.length])};document.querySelectorAll("[data-step]").forEach(s=>s.addEventListener("click",()=>r(Number(s.dataset.step))));let i=null,a=0;d.panel.addEventListener("touchstart",s=>{i=s.touches[0].clientX,a=s.touches[0].clientY},{passive:!0}),d.panel.addEventListener("touchend",s=>{if(i===null||!D.classList.contains("is-open")||xe()){i=null;return}let h=s.changedTouches[0].clientX-i,m=s.changedTouches[0].clientY-a;i=null,Math.abs(h)>60&&Math.abs(h)>Math.abs(m)*1.5&&r(h<0?1:-1)},{passive:!0});let n=U("[data-mode-toggle]");n.setAttribute("aria-pressed",String(D.classList.contains("is-list"))),n.addEventListener("click",()=>{D.classList.remove("pre-intro","pre-ui");let s=!D.classList.contains("is-list");D.classList.toggle("is-list",s),n.setAttribute("aria-pressed",String(s)),n.textContent=w(s?"Sahne":"Liste"),Ke(),window.scrollTo(0,0),!s&&(Ge(),x&&d.articles[Q()]&&Ye(Q()))});let c=U("[data-sound-toggle]"),l=!0;try{l=localStorage.getItem("kilic-ses")!=="off"}catch{}wt(l),c?.addEventListener("click",()=>{Me&&wt(Me.toggle())}),window.addEventListener("hashchange",Ge),window.addEventListener("popstate",Ge);let g=U("[data-palette] kbd");g&&/Mac|iPhone|iPad/.test(navigator.platform)&&(g.textContent="\u2318K"),er(ra),document.addEventListener("rz:lang",ea),n.textContent=w(D.classList.contains("is-list")?"Sahne":"Liste"),window.addEventListener("keydown",s=>{if(!x||D.classList.contains("is-list")||Be()||s.target.closest?.("input, textarea"))return;if((s.key==="ArrowLeft"||s.key==="ArrowRight")&&vr(),s.key==="Escape"){or();return}if(x.below||s.key!=="ArrowRight"&&s.key!=="ArrowLeft"&&s.key!=="Enter")return;let h=s.key==="ArrowRight"?1:s.key==="ArrowLeft"?-1:0,m=xt.filter(v=>!Te(v)).map(v=>Z.indexOf(v));if(x.current>=0||bt.includes(Q())){if(!h)return;let v=m.indexOf(ir(Q()));if(v<0)return;ie(fe(m[(v+h+m.length)%m.length]))}else if(h){let v=m.indexOf(x.hovered);x.setHover(v<0?h>0?m[0]:m[m.length-1]:m[(v+h+m.length)%m.length])}else x.hovered>=0&&fe(x.hovered)&&s.target===D&&ie(fe(x.hovered))})}function ra(){let t=(l,g)=>d.articles[l]?.querySelector(g)?.textContent||"",e=l=>()=>{ie(l)},o=xt.filter(l=>!Te(l)).map((l,g)=>({label:w(l.label),group:`${w("Proje")} ${Qe(g+1)}`,keys:`${t(l.slug,".kicker")} ${t(l.slug,".lead")}`,run:e(l.slug)})),r=D.classList.contains("is-list"),i=U("[data-sound-toggle]"),a=Me?Me.enabled:i?.getAttribute("aria-pressed")==="true",n=d.articles.yazilar?.querySelector(".writings a"),c=l=>()=>{window.open(l,"_blank","noopener")};return[...o,{label:w("Demirhane"),group:w("Demirhane"),keys:"yer alt\u0131 \xF6rs ocak forge smithy",run:e(xe()?"gizli":ce)},{label:w("\xD6rsteki i\u015F"),group:w("Demirhane"),keys:`anvil ${t("gizli",".lead")}`,run:e("gizli")},{label:w("A\xE7\u0131k kaynak"),group:w("Demirhane"),keys:`katk\u0131 pr github open source ${t("acik-kaynak",".lead")}`,run:e("acik-kaynak")},{label:w("Hakk\u0131mda"),group:w("Sayfa"),keys:"r\u0131zgar ozan ileti\u015Fim about contact",run:e(Yt)},{label:w("CV\u2019yi indir"),group:"PDF",lang:"en",keys:"cv \xF6zge\xE7mi\u015F resume pdf indir download",run:()=>{U("[data-cv]")?.click()}},{label:w("Yaz\u0131lar"),group:w("Sayfa"),keys:"blog yaz\u0131 writing posts",run:e("yazilar")},...n?[{label:n.querySelector("b").textContent,group:w("Yaz\u0131"),keys:"bm25 rag",run:()=>{location.href=n.href}}]:[],...D.classList.contains("no-webgl")?[]:[{label:w(r?"Sahne g\xF6r\xFCn\xFCm\xFC":"Liste g\xF6r\xFCn\xFCm\xFC"),group:w("G\xF6r\xFCn\xFCm"),keys:"liste sahne d\xFCz list scene view",run:()=>{U("[data-mode-toggle]").click()}}],...Me&&!xe()?[{label:w(a?"Sesi kapat":"Sesi a\xE7"),group:w("Ses"),keys:"ses m\xFCzik sound audio",run:()=>{i.click()}}]:[],{label:w("English"),group:w("Dil"),keys:"dil t\xFCrk\xE7e ingilizce language english turkish",run:()=>{Go()}},{label:w("E-postay\u0131 kopyala"),group:"rizgarozan7@gmail.com",lang:"en",keys:"mail eposta ileti\u015Fim email contact",run:async()=>{try{return await navigator.clipboard.writeText("rizgarozan7@gmail.com"),w("Kopyaland\u0131")}catch{return location.href="mailto:rizgarozan7@gmail.com",!1}}},{label:"GitHub",group:"github.com/RizgarOzan",lang:"en",keys:"kod code",run:c("https://github.com/RizgarOzan")},{label:"LinkedIn",group:"linkedin.com/in/rizgarozan",lang:"en",keys:"i\u015F work",run:c("https://www.linkedin.com/in/rizgarozan/")},{label:w("Kaynaklar"),group:"",keys:"referans lisans model at\u0131f credits license",small:!0,run:ur}]}var jt=0;function hr(){D.classList.remove("pre-intro","pre-ui"),!(lr("rz-descended")||xe()||location.hash||!d.cue)&&(jt=setTimeout(()=>{x?.state!=="home"||location.hash||Be()||(D.classList.add("show-cue"),jt=setTimeout(Kt,5500))},1200))}function Kt(){clearTimeout(jt),D.classList.remove("show-cue")}function mr(){Kt(),cr("rz-descended")}var pr=0;function aa(){!d.keys||lr("rz-keys")||!ta.matches||(cr("rz-keys"),d.keys.classList.add("is-on"),pr=setTimeout(vr,4500))}function vr(){clearTimeout(pr),d.keys?.classList.remove("is-on")}function yt(t){d.loaderBar.style.width=`${Math.round(t*100)}%`}function gr(t,e){x=t,Me=e,wt(e.enabled),Ge()}function xr(t){Ee=t}function Xt(){let t=Q();return t===ce||Te(Z.find(e=>e.slug===t))}function Xe(){D.classList.remove("is-loading","pre-intro","pre-ui"),D.classList.add("no-webgl"),Ke()}function Zt(t){fe(t)&&ie(fe(t))}function Jt(t){!x||xe()||D.classList.contains("is-open")||Be()||(t>0&&x.state==="home"&&!x.below?ie(ce):t<0&&x.state==="forge"&&Q()===ce&&ie(null))}function Ye(t){let e=typeof t=="number"?fe(t):t;if(!e||e!==Q()||xe())return;let o=Z.find(n=>n.slug===e);Zr=Z.indexOf(o),Object.entries(d.articles).forEach(([n,c])=>c.classList.toggle("is-active",n===e)),D.style.setProperty("--accent",o?.accent||"#cfd8e6");let r=ar(e),i=r.indexOf(e);d.count.textContent=i>=0&&r.length>1?`${Qe(i+1)} / ${Qe(r.length)}`:"",d.panel.querySelector(".panel-foot").hidden=!(i>=0&&r.length>1),d.panel.setAttribute("aria-hidden","false"),d.panel.querySelector(".panel-body").scrollTop=0,d.index.inert=!$t.matches,Kt(),i>=0&&r.length>2&&aa();let a=d.articles[e]?.querySelector("h2");a&&(a.tabIndex=-1),D.classList.contains("is-open")?a&&(d.panel.contains(document.activeElement)||document.activeElement===D)&&(a.focus({preventScroll:!0}),d.announce&&(d.announce.textContent=a.textContent)):(D.classList.add("is-open"),Vt=document.activeElement,a?.focus({preventScroll:!0}))}function Ke(){let t=D.classList.contains("is-open");D.classList.remove("is-open"),xe()?d.panel.removeAttribute("aria-hidden"):d.panel.setAttribute("aria-hidden","true"),d.index.inert=!1,t&&d.panel.contains(document.activeElement)&&Vt?.focus?.({preventScroll:!0}),Vt=null}var Qt="",rr=!1;function wr(){let t=x.state==="forge",e=x.state==="home"?x.ready(x.hovered)?x.hovered:-1:t&&Ee?Ee.hovered:-1,o=t&&Ee&&e<0?Ee.rackHovered:-1,r=e>=0?`e${e}`:o>=0?`r${o}`:"";if(r!==Qt){if(d.buttons.forEach(i=>i.classList.toggle("is-hot",i.dataset.slug===fe(e))),e>=0){let i=Z[e];d.tagNum.textContent=Te(i)?w("Demirhane"):Qe(e+1),d.tagTitle.textContent=w(i.label),d.tagTitle.lang=d.articles[i.slug]?.querySelector("h2")?.lang||Bo,qt(d.tagTitle),d.tag.style.setProperty("--accent",i.accent)}else o>=0&&(d.tagNum.textContent=w("Rafta, sahibini bekliyor"),d.tagTitle.textContent=Ee.rackName(o),d.tagTitle.lang="en",qt(d.tagTitle));r&&rr&&Me?.hover(),r&&(rr=!0),d.tag.classList.toggle("is-on",!!r),d.tag.classList.toggle("is-free",o>=0),e>=0&&x.portrait&&fe(e)&&d.buttons.find(i=>i.dataset.slug===fe(e))?.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"}),Qt=r}if(r){let i=e>=0?(t?Ee:x).screenPos(e):Ee.rackPos(o);d.tag.style.transform=`translate(${Math.round(i.x)}px, ${Math.round(i.y)}px) translate(-50%, -100%)`}}var br="kilic-ses",na="assets/audio/",sa={wind:1,forge:1,hover:4,pull:1,plant:1,descend:1,hammer:4},la={hover:.16,pull:.55,plant:.8,descend:.6,hammer:.32},ca=.5,ua=.06,da=.55,yr=.07;function Er(){let t=null,e=null,o=null,r=0,i=null,a=!1,n=!0;try{n=localStorage.getItem(br)!=="off"}catch{}let c={},l=!1;function g(){if(t)return!0;if(!l)return!1;let E=window.AudioContext||window.webkitAudioContext;return E?(t=new E,e=t.createGain(),e.gain.value=n?1:0,e.connect(t.destination),N(),_(a),n||t.suspend(),v(),!0):!1}let s=!1,h=!1;function m(){s=!0,v()}function v(){if(h||!s||!t)return;h=!0;let E=new Audio().canPlayType('audio/ogg; codecs="opus"')!=="",L=I=>new Promise((S,P)=>{let q=t.decodeAudioData(I,S,P);q?.catch&&q.catch(P)}),H=(I,S)=>fetch(na+I+S).then(P=>{if(!P.ok)throw new Error(`${I}${S}: ${P.status}`);return P.arrayBuffer()}).then(L);for(let[I,S]of Object.entries(sa)){c[I]=[];for(let P=1;P<=S;P++){let q=S>1?I+P:I;(E?H(q,".ogg").catch(()=>H(q,".mp3")):H(q,".mp3")).then(ne=>{c[I].push(ne),I==="wind"&&Y(ne,o),I==="forge"&&Y(ne,i)}).catch(ne=>console.warn("audio:",ne.message))}}}function N(){o=t.createGain(),o.gain.value=0;let E=t.createGain();E.gain.value=.75;let L=t.createOscillator();L.frequency.value=yr;let H=t.createGain();H.gain.value=.25,L.connect(H).connect(E.gain),o.connect(E).connect(e),L.start(),r=t.currentTime,i=t.createGain(),i.gain.value=0,i.connect(e)}function Y(E,L){let H=t.createBufferSource();H.buffer=E,H.loop=!0,H.connect(L),H.start(t.currentTime,Math.random()*E.duration)}function B(E,{gain:L=la[E],rate:H=1,delay:I=0}={}){let S=c[E];if(!S?.length)return;let P=t.createBufferSource();P.buffer=S[Math.floor(Math.random()*S.length)],P.playbackRate.value=H*(.96+Math.random()*.08);let q=t.createGain();q.gain.value=L*(.9+Math.random()*.2),P.connect(q).connect(e),P.start(t.currentTime+I)}function _(E){if(a=E,!t)return;let L=t.currentTime;o?.gain.setTargetAtTime(E?ua:ca,L,.6),i?.gain.setTargetAtTime(E?da:0,L,.6)}function J(E){!n||!g()||B("descend",{rate:E?.92:1.06})}function y(){!t||!a||!n||B("hammer")}function K(){!n||!g()||B("hover")}function k(){!n||!g()||B("pull")}function T(){!n||!g()||B("plant")}function j(){n=!n;try{localStorage.setItem(br,n?"on":"off")}catch{}return g()&&(n&&t.resume(),e.gain.setTargetAtTime(n?1:0,t.currentTime,.05),n||setTimeout(()=>{n||t.suspend()},300)),n}let O=()=>{l=!0,g()&&n&&t.state==="suspended"&&t.resume()};return["pointerdown","keydown","touchstart"].forEach(E=>window.addEventListener(E,O,{once:!0,passive:!0})),document.addEventListener("visibilitychange",()=>{t&&(document.hidden?t.suspend():n&&t.resume())}),{hover:K,pull:k,plant:T,toggle:j,place:_,descend:J,hammer:y,preload:m,get enabled(){return n},get wind(){return o},get windPhase(){return o?(t.currentTime-r)*yr:null}}}var we=document.body,eo=window.matchMedia("(prefers-reduced-motion: reduce)").matches;function fa(){try{return!!document.createElement("canvas").getContext("webgl2")}catch{return!1}}var ha=we.classList.contains("no-webgl");window.__rzStarted=!0;fr();ha||!fa()?Xe():ma().catch(t=>{console.error(t),Xe()});async function ma(){let t=document.getElementById("scene"),e=Ko(t),o=parseFloat(new URLSearchParams(location.search).get("hour")),r=()=>e.setDaylight(Io(Number.isFinite(o)?o:Fo().hour));r(),setInterval(r,3e4);let i=Er(),a=Lo(e,{reducedMotion:eo,audio:i,onOpened:Ye,onClosing:dr}),n=null;new URLSearchParams(location.search).has("debug")&&(window.__site={field:a,world:e,gsap:_e,get forge(){return n}});let c=null;t.addEventListener("pointermove",p=>a.pointerMove(p.clientX,p.clientY)),t.addEventListener("pointerleave",()=>a.pointerLeave());let l=()=>a.hurry();window.addEventListener("keydown",l),t.addEventListener("pointerdown",p=>{l(),c={x:p.clientX,y:p.clientY},a.pointerDown(p.clientX)}),window.addEventListener("pointercancel",()=>{a.pointerUp(),c=null}),window.addEventListener("pointerup",p=>{if(a.pointerUp(),!c||p.target!==t){c=null;return}let R=Math.hypot(p.clientX-c.x,p.clientY-c.y);if(c=null,R>6)return;if(a.state==="forge"&&n){a.pointerMove(p.clientX,p.clientY);let C=n.pick(a.ndc);C>=0&&Zt(C);return}if(a.state!=="home")return;let z=a.pickAt(p.clientX,p.clientY);z>=0&&Zt(z)});let g=0;window.addEventListener("wheel",p=>{l(),!(p.target.closest?.(".panel")||Math.abs(p.deltaY)<12||performance.now()<g)&&(g=performance.now()+900,p.deltaY>0&&v(),Jt(Math.sign(p.deltaY)))},{passive:!0});let s=null;t.addEventListener("touchstart",p=>{s=p.touches[0].clientY},{passive:!0}),t.addEventListener("touchend",p=>{if(s===null)return;let R=s-p.changedTouches[0].clientY;s=null,R>70&&v(),Math.abs(R)>70&&Jt(Math.sign(R))},{passive:!0}),window.addEventListener("resize",()=>{e.resize(),a.relayout()});let h=navigator.connection?.saveData===!0||window.matchMedia("(pointer: coarse)").matches&&Math.min(screen.width,screen.height)<820,m=!1;function v(){m||(m=!0,import("./forge-5MKV7DJ5.js").then(({createForge:p})=>p(e,{audio:i,reducedMotion:eo})).then(p=>{n=p,a.attachForge(p),xr(p)}).catch(p=>console.error("forge failed to load",p)))}let N=window.requestIdleCallback||(p=>setTimeout(p,1));window.addEventListener("hashchange",()=>{Xt()&&v()}),Xt()&&v(),yt(.3),e.upgradeGround(256);let Y=Promise.all([Ve(e,e.scene,{shadows:["depth"],must:!0}),zo(e,{skip:[e.depthPass]})]).then(()=>yt(.7)),B=p=>new Promise(R=>setTimeout(R,p)),_=Promise.all([a.arrived,e.ruinsArrived]),J=!1;_.then(()=>{J=!0}),await Promise.race([Promise.all([e.ruinsArrived,Promise.race([a.arrived,B(250)])]),B(1600)]),await We(e,{soon:!0}),await Y,yt(1),e.shown=!0,we.classList.remove("is-loading"),gr(a,i);let y=()=>we.classList.remove("pre-intro");setTimeout(y,1500),setTimeout(()=>we.classList.remove("pre-ui"),7e3);let K=Promise.all([a.planted,e.ruins]);a.planted.then(()=>i.preload()),Ve(e,e.scene,{depthPass:e.depthPass}),Promise.race([_,B(2500)]).then(()=>We(e)).then(()=>(y(),Promise.all([a.planted,B(eo?0:1700)]).then(()=>we.classList.remove("pre-ui")),a.intro())).then(()=>hr()).then(async()=>{for(;!J;)await Promise.race([_,B(3e3)]),await We(e)}).then(()=>e.farArrived).then(()=>We(e)).then(()=>K).then(()=>new Promise(p=>N(p,{timeout:1500}))).then(()=>e.upgradeGround(512)).then(async()=>{let p=zt();p<3e5||(await e.upgradeGround("1k"),p>=1e6&&(h||await e.upgradeGround("2k"),await a.sharpenAll()),setTimeout(()=>N(v,{timeout:2e3}),1e3))}).catch(p=>console.error("startup",p)),_e.ticker.remove(_e.updateRoot);let k=performance.now(),T=0,j=_e.ticker.time,O=!1,E=e.renderer;e.quality={dof:!0,fx:!0,shadow:!0},e.windPhase=()=>i.windPhase,E.shadowMap.autoUpdate=!1;let L=window.matchMedia("(pointer: coarse)").matches,H=Math.min(window.devicePixelRatio,1.75),I=L?Math.min(H,1.25):.75,S=H,P=0,q=0,ne=0,Ze=performance.now()+4e3;function Et(p){if(performance.now()<Ze||(q+=p,P++,P<60))return;let R=ne=q/P;P=0,q=0;let z=e.quality,C=()=>{Ze=performance.now()+1500};if(R>24&&z.fx){z.fx=!1,C();return}if(R>24&&z.dof){z.dof=!1,C();return}if(R>24&&z.shadow){z.shadow=!1,e.setShadowDetail(!1),C();return}if(R<13&&S===H&&!z.shadow){z.shadow=!0,e.setShadowDetail(!0),C();return}if(R<13&&S===H&&!z.dof){z.dof=!0,C();return}if(R<13&&S===H&&!z.fx){z.fx=!0,C();return}let ee=R>24?Math.max(I,S-.25):R<13?Math.min(H,S+.25):S;ee!==S&&(S=ee,E.setPixelRatio(S),e.composer.setPixelRatio?.(S),e.resize(),C())}let ke=null;new URLSearchParams(location.search).has("diag")&&(ke=document.createElement("pre"),ke.style.cssText="position:fixed;left:8px;top:64px;z-index:99;margin:0;font:11px/1.4 monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 6px;pointer-events:none",document.body.appendChild(ke),setInterval(()=>{let p=e.quality;ke.textContent=`pr ${S.toFixed(2)} (dpr ${window.devicePixelRatio}) ${E.domElement.width}x${E.domElement.height}
fx ${p.fx} dof ${p.dof} shadow ${p.shadow}
frame ${ne.toFixed(1)} ms  line ${(zt()/1024).toFixed(0)} KB/s`},500));let Ae=0,Ce=!1,De=0;t.addEventListener("webglcontextlost",p=>{p.preventDefault(),Ce=!0,Xe()}),t.addEventListener("webglcontextrestored",()=>location.reload());function Fe(p){requestAnimationFrame(Fe);let R=Math.max(0,(p-k)/1e3),z=Math.min(R,.25);k=Math.max(p,k),j+=R;try{if(_e.updateRoot(j),Ce||document.hidden||we.classList.contains("is-list"))return;T+=z,e.update(T),a.update(T,z),n?.update(T,z,{active:a.below||a.state==="moving",ndc:a.ndc}),a.below!==O&&(O=a.below,i.place(O),we.classList.toggle("is-below",O),O&&mr());let C=a.below&&!n;C!==we.classList.contains("forge-wait")&&we.classList.toggle("forge-wait",C),wr(),t.style.cursor=a.state==="open"?"grab":a.state==="home"&&a.hovered>=0||a.state==="forge"&&n?.hovered>=0?"pointer":"";let ee=e.shadowHold>0;ee&&e.shadowHold--,E.shadowMap.needsUpdate=(Ae++&1)===0&&!ee,e.paused||e.render(),R<.2&&Et(R*1e3),De=0}catch(C){De++===0&&console.error(C),De>90&&(Ce=!0,Xe())}}requestAnimationFrame(Fe)}
