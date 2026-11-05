import {
	Color,
	FrontSide,
	Matrix4,
	Mesh,
	PerspectiveCamera,
	Plane,
	ShaderMaterial,
	UniformsUtils,
	Vector3,
	WebGLRenderTarget
} from 'three';

/**
 * High-performance, rich reflection Water shader object for Three.js.
 * Based on official Three.js Water addon (BSD License).
 */
class Water extends Mesh {

	constructor( geometry, options = {} ) {

		super( geometry );

		const textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;
		const textureHeight = options.textureHeight !== undefined ? options.textureHeight : 512;
		const clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
		const alpha = options.alpha !== undefined ? options.alpha : 1.0;
		const time = options.time !== undefined ? options.time : 0.0;
		const normalSampler = options.normalSampler !== undefined ? options.normalSampler : null;
		const sunDirection = options.sunDirection !== undefined ? options.sunDirection : new Vector3( 0.70707, 0.70707, 0.0 );
		const sunColor = options.sunColor !== undefined ? new Color( options.sunColor ) : new Color( 0xffffff );
		const waterColor = options.waterColor !== undefined ? new Color( options.waterColor ) : new Color( 0x7f7f7f );
		const eye = options.eye !== undefined ? options.eye : new Vector3( 0, 0, 0 );
		const distortionScale = options.distortionScale !== undefined ? options.distortionScale : 20.0;
		const side = options.side !== undefined ? options.side : FrontSide;
		const fog = options.fog !== undefined ? options.fog : false;

		const mirrorPlane = new Plane();
		const normal = new Vector3();
		const mirrorWorldPosition = new Vector3();
		const cameraWorldPosition = new Vector3();
		const rotationMatrix = new Matrix4();
		const target = new Vector3();
		const view = new Vector3();

		const mirrorCamera = new PerspectiveCamera();

		const renderTarget = new WebGLRenderTarget( textureWidth, textureHeight );

		const mirrorShader = Water.WaterShader;

		const material = new ShaderMaterial( {
			name: mirrorShader.name,
			uniforms: UniformsUtils.clone( mirrorShader.uniforms ),
			vertexShader: mirrorShader.vertexShader,
			fragmentShader: mirrorShader.fragmentShader,
			transparent: true,
			side: side,
			fog: fog
		} );

		material.uniforms[ 'mirrorSampler' ].value = renderTarget.texture;
		material.uniforms[ 'textureMatrix' ].value = new Matrix4();
		material.uniforms[ 'alpha' ].value = alpha;
		material.uniforms[ 'time' ].value = time;
		material.uniforms[ 'normalSampler' ].value = normalSampler;
		material.uniforms[ 'sunColor' ].value = sunColor;
		material.uniforms[ 'waterColor' ].value = waterColor;
		material.uniforms[ 'sunDirection' ].value = sunDirection;
		material.uniforms[ 'distortionScale' ].value = distortionScale;
		material.uniforms[ 'eye' ].value = eye;

		this.material = material;

		this.onBeforeRender = function ( renderer, scene, camera ) {

			mirrorWorldPosition.setFromMatrixPosition( this.matrixWorld );
			cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );

			rotationMatrix.extractRotation( this.matrixWorld );

			normal.set( 0, 0, 1 );
			normal.applyMatrix4( rotationMatrix );

			view.subVectors( mirrorWorldPosition, cameraWorldPosition );

			// Avoid rendering when mirror is facing away
			if ( view.dot( normal ) > 0 ) return;

			view.reflect( normal ).negate();
			view.add( mirrorWorldPosition );

			rotationMatrix.extractRotation( camera.matrixWorld );

			target.set( 0, 0, -1 );
			target.applyMatrix4( rotationMatrix );
			target.add( cameraWorldPosition );

			this.up.set( 0, 1, 0 );
			this.up.applyMatrix4( rotationMatrix );
			this.up.reflect( normal );

			mirrorCamera.position.copy( view );
			mirrorCamera.up.copy( this.up );
			mirrorCamera.lookAt( target );

			mirrorCamera.far = camera.far;
			mirrorCamera.updateMatrixWorld();
			mirrorCamera.projectionMatrix.copy( camera.projectionMatrix );

			// Update the texture matrix
			material.uniforms[ 'textureMatrix' ].value.set(
				0.5, 0.0, 0.0, 0.5,
				0.0, 0.5, 0.0, 0.5,
				0.0, 0.0, 0.5, 0.5,
				0.0, 0.0, 0.0, 1.0
			);
			material.uniforms[ 'textureMatrix' ].value.multiply( mirrorCamera.projectionMatrix );
			material.uniforms[ 'textureMatrix' ].value.multiply( mirrorCamera.matrixWorldInverse );

			// Commit render
			this.visible = false;

			const currentRenderTarget = renderer.getRenderTarget();
			const currentXrEnabled = renderer.xr.enabled;
			const currentShadowMapEnabled = renderer.shadowMap.enabled;

			renderer.xr.enabled = false;
			renderer.shadowMap.enabled = false;

			renderer.setRenderTarget( renderTarget );
			renderer.state.buffers.depth.setMask( true );
			if ( renderer.autoClear === false ) renderer.clear();
			renderer.render( scene, mirrorCamera );

			renderer.xr.enabled = currentXrEnabled;
			renderer.shadowMap.enabled = currentShadowMapEnabled;

			renderer.setRenderTarget( currentRenderTarget );

			this.visible = true;

		};

	}

}

Water.WaterShader = {

	name: 'WaterShader',

	uniforms: {

		'normalSampler': { value: null },
		'mirrorSampler': { value: null },
		'alpha': { value: 1.0 },
		'time': { value: 0.0 },
		'size': { value: 1.0 },
		'distortionScale': { value: 20.0 },
		'textureMatrix': { value: new Matrix4() },
		'sunColor': { value: new Color( 0xffffff ) },
		'sunDirection': { value: new Vector3( 0.70707, 0.70707, 0 ) },
		'eye': { value: new Vector3() },
		'waterColor': { value: new Color( 0x001e0f ) }

	},

	vertexShader: /* glsl */`
		uniform mat4 textureMatrix;
		uniform float time;
		varying vec4 mirrorCoord;
		varying vec4 worldPosition;

		void main() {
			mirrorCoord = textureMatrix * vec4( position, 1.0 );
			worldPosition = modelMatrix * vec4( position, 1.0 );
			vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
			gl_Position = projectionMatrix * mvPosition;
		}`,

	fragmentShader: /* glsl */`
		uniform sampler2D mirrorSampler;
		uniform float alpha;
		uniform float time;
		uniform float size;
		uniform float distortionScale;
		uniform sampler2D normalSampler;
		uniform vec3 sunColor;
		uniform vec3 sunDirection;
		uniform vec3 eye;
		uniform vec3 waterColor;

		varying vec4 mirrorCoord;
		varying vec4 worldPosition;

		vec4 getNoise( vec2 uv ) {
			vec2 uv0 = ( uv / 103.0 ) + vec2( time * 0.00004, time * 0.00003 );
			vec2 uv1 = ( uv / 107.0 ) - vec2( time * 0.00004, time * 0.00003 );
			vec2 uv2 = ( uv / vec2( 8907.0, 9803.0 ) ) + vec2( time * 0.0001, time * 0.0001 );
			vec2 uv3 = ( uv / vec2( 1091.0, 1027.0 ) ) - vec2( time * 0.0001, time * 0.0001 );
			vec4 noise = texture2D( normalSampler, uv0 ) +
				texture2D( normalSampler, uv1 ) +
				texture2D( normalSampler, uv2 ) +
				texture2D( normalSampler, uv3 );
			return noise * 0.5 - 1.0;
		}

		void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diff, inout vec3 diffuse, inout vec3 specular ) {
			vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
			float direction = max( 0.0, dot( eyeDirection, reflection ) );
			specular += pow( direction, shiny ) * sunColor * spec;
			diffuse += max( 0.0, dot( surfaceNormal, sunDirection ) ) * sunColor * diff;
		}

		void main() {
			vec4 noise = getNoise( worldPosition.xz * size );
			vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

			vec3 diffuseLight = vec3( 0.0 );
			vec3 specularLight = vec3( 0.0 );

			vec3 worldToEye = eye - worldPosition.xyz;
			vec3 eyeDirection = normalize( worldToEye );
			sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

			vec2 distortion = surfaceNormal.xz * ( distortionScale * 0.1 );
			vec3 reflectionSample = vec3( texture2DProj( mirrorSampler, mirrorCoord.xyw + vec4( distortion, 0.0, 0.0 ).xyw ) );

			float theta = max( 0.0, dot( eyeDirection, surfaceNormal ) );
			float rf0 = 0.3;
			float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
			vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;

			vec3 albedo = mix( sunColor * diffuseLight * 0.3 + scatter, ( reflectionSample + reflectionSample * specularLight ), reflectance );
			gl_FragColor = vec4( albedo, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
		}`

};

export { Water };
