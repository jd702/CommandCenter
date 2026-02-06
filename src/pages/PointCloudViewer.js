import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import {usePointCloudDecompressor} from './Ros2Agents_with_HSFC'

const PointCloudViewer = ({ points = [] }) => {
  const mountRef = useRef(null);
  const [clipping, setClipping] = useState(false);
  const [useDepthColor, setUseDepthColor] = useState(false);

  const zMin = -0.3;
  const zMax = 0.3;

  useEffect(() => {
  if (!points || points.length === 0 || !mountRef.current) return;

  const width = mountRef.current.clientWidth;
  const height = mountRef.current.clientHeight;

  // Scene & renderer
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  mountRef.current.innerHTML = ''; // clear old canvas
  mountRef.current.appendChild(renderer.domElement);

  // Camera
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 1000);

  // Axes helper (1m) for orientation
  scene.add(new THREE.AxesHelper(1));

  // Build geometry
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];

  // Compute dynamic z-range (for clipping & depth coloring)
  let dataZMin = Infinity, dataZMax = -Infinity;

  // First pass: measure z-range of un-clipped data
  for (const p of points) {
    if (typeof p?.z !== 'number') continue;
    if (p.z < dataZMin) dataZMin = p.z;
    if (p.z > dataZMax) dataZMax = p.z;
  }
  if (!isFinite(dataZMin) || !isFinite(dataZMax)) {
    // nothing usable -> bail early
    return;
  }
  const zRange = Math.max(1e-6, dataZMax - dataZMin);

  // Second pass: push vertices & colors (respect clipping toggle)
  for (const p of points) {
    if (p == null) continue;
    const { x, y, z, r = 255, g = 255, b = 255 } = p;

    if (clipping && (z < zMin || z > zMax)) continue;

    vertices.push(x, y, z);

    if (useDepthColor) {
      // Normalize by the REAL z-range of current frame
      const t = (z - dataZMin) / zRange; // [0..1]
      const color = new THREE.Color();
      color.setHSL(t, 1.0, 0.5);
      colors.push(color.r, color.g, color.b);
    } else {
      colors.push(
        Math.max(0, Math.min(1, r / 255)),
        Math.max(0, Math.min(1, g / 255)),
        Math.max(0, Math.min(1, b / 255))
      );
    }
  }

  if (vertices.length === 0) {
    // all points were clipped or invalid; nothing to draw
    return;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // Auto-fit camera to points
  geometry.computeBoundingSphere();
  const bs = geometry.boundingSphere;
  if (bs && isFinite(bs.radius) && bs.radius > 0) {
    const dist = bs.radius * 2.5; // pull back a bit
    camera.position.set(bs.center.x, bs.center.y, bs.center.z + dist);
    camera.near = Math.max(0.01, bs.radius / 1000);
    camera.far = Math.max(10, bs.radius * 10);
    camera.updateProjectionMatrix();
    camera.lookAt(bs.center);
  } else {
    camera.position.z = 5;
  }

  const material = new THREE.PointsMaterial({
    size: 0.03,     // slightly smaller points
    sizeAttenuation: true,
    vertexColors: true
  });

  const pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  // Animation
  let animId;
  const animate = () => {
    animId = requestAnimationFrame(animate);
    pointCloud.rotation.y += 0.002;
    renderer.render(scene, camera);
  };
  animate();

  // Handle resize
  const onResize = () => {
    if (!mountRef.current) return;
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // Cleanup
  return () => {
    window.removeEventListener('resize', onResize);
    if (animId) cancelAnimationFrame(animId);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    while (mountRef.current && mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
  };
}, [points, clipping, useDepthColor]);


  return (
    <div style={{ padding: '1rem' }}>
      <h2>3D Point Cloud Viewer</h2>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={() => setClipping(prev => !prev)}>
          {clipping ? 'Disable Clipping' : 'Enable Clipping'}
        </button>
        <button onClick={() => setUseDepthColor(prev => !prev)}>
          {useDepthColor ? 'Disable Depth Color' : 'Enable Depth Color'}
        </button>
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '500px', border: '1px solid #ccc' }} />
    </div>
  );
};

export default PointCloudViewer;
