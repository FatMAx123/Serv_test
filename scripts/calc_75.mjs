import * as THREE from '../client/js/libs/three.module.js';

function getEuler(thetaDegFromVertical) {
  const rad = THREE.MathUtils.degToRad(thetaDegFromVertical);
  const target = new THREE.Vector3(Math.sin(rad), Math.cos(rad), 0).normalize();
  const base = new THREE.Vector3(0, 0, -1);
  const q = new THREE.Quaternion().setFromUnitVectors(base, target);
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return {
    degFromVertical: thetaDegFromVertical,
    degFromGround: 90 - thetaDegFromVertical,
    eulerRad: [Number(euler.x.toFixed(4)), Number(euler.y.toFixed(4)), Number(euler.z.toFixed(4))],
    eulerDeg: [
      Number(THREE.MathUtils.radToDeg(euler.x).toFixed(1)),
      Number(THREE.MathUtils.radToDeg(euler.y).toFixed(1)),
      Number(THREE.MathUtils.radToDeg(euler.z).toFixed(1))
    ]
  };
}

console.log('75 deg from ground (15 deg from vertical):', getEuler(15));
console.log('75 deg from vertical (15 deg from ground):', getEuler(75));
console.log('60 deg from ground (30 deg from vertical):', getEuler(30));
