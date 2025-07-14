import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.innerHTML = ''; // clear old render
    mountRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    points.forEach((p) => {
      if (clipping && (p.z < zMin || p.z > zMax)) return;

      vertices.push(p.x, p.y, p.z);

      if (useDepthColor) {
        const depthNormalized = (p.z + 1) / 2;
        const color = new THREE.Color();
        color.setHSL(depthNormalized, 1.0, 0.5);
        colors.push(color.r, color.g, color.b);
      } else {
        colors.push(p.r / 255, p.g / 255, p.b / 255);
      }
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true });
    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    const animate = () => {
      requestAnimationFrame(animate);
      pointCloud.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup function to dispose of WebGL resources and DOM canvas
return () => {
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
