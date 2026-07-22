import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PointCloudViewer = ({ points = [] }) => {
  const mountRef = useRef(null);
  const [clipping, setClipping] = useState(false);
  const [useDepthColor, setUseDepthColor] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pointSize, setPointSize] = useState(0.03);
  const [maxRenderPoints, setMaxRenderPoints] = useState(120000);
  const [showGrid, setShowGrid] = useState(true);
  const [zClipMin, setZClipMin] = useState(-0.3);
  const [zClipMax, setZClipMax] = useState(0.3);
  const [stats, setStats] = useState({ source: 0, rendered: 0 });

  useEffect(() => {
    if (!points || points.length === 0 || !mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0d0f14, 1);
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.8;

    scene.add(new THREE.AxesHelper(1));
    if (showGrid) {
      const grid = new THREE.GridHelper(6, 24, 0x3f4652, 0x242a33);
      scene.add(grid);
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    const sourceCount = points.length;
    const stride = Math.max(1, Math.ceil(sourceCount / Math.max(1000, maxRenderPoints)));

    let dataZMin = Infinity, dataZMax = -Infinity;

    for (let index = 0; index < points.length; index += stride) {
      const p = points[index];
      if (typeof p?.z !== 'number') continue;
      if (p.z < dataZMin) dataZMin = p.z;
      if (p.z > dataZMax) dataZMax = p.z;
    }
    if (!isFinite(dataZMin) || !isFinite(dataZMax)) {
      return;
    }
    const zRange = Math.max(1e-6, dataZMax - dataZMin);

    const depthColor = new THREE.Color();
    for (let index = 0; index < points.length; index += stride) {
      const p = points[index];
      if (p == null) continue;
      const { x, y, z, r = 255, g = 255, b = 255 } = p;

      if (clipping && (z < zClipMin || z > zClipMax)) continue;

      vertices.push(x, y, z);

      if (useDepthColor) {
        const t = (z - dataZMin) / zRange;
        depthColor.setHSL(t, 0.95, 0.52);
        colors.push(depthColor.r, depthColor.g, depthColor.b);
      } else {
        colors.push(
          Math.max(0, Math.min(1, r / 255)),
          Math.max(0, Math.min(1, g / 255)),
          Math.max(0, Math.min(1, b / 255))
        );
      }
    }

    if (vertices.length === 0) {
      return;
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    geometry.computeBoundingSphere();
    const bs = geometry.boundingSphere;
    if (bs && isFinite(bs.radius) && bs.radius > 0) {
      const dist = bs.radius * 2.2;
      camera.position.set(bs.center.x, bs.center.y, bs.center.z + dist);
      camera.near = Math.max(0.01, bs.radius / 1000);
      camera.far = Math.max(10, bs.radius * 12);
      camera.updateProjectionMatrix();
      camera.lookAt(bs.center);
      controls.target.copy(bs.center);
      controls.update();
    } else {
      camera.position.z = 5;
    }

    const sprite = document.createElement('canvas');
    sprite.width = 64;
    sprite.height = 64;
    const ctx = sprite.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 6, 32, 32, 28);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2, false);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(sprite);

    const material = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      vertexColors: true,
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
    });

    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);
    setStats({ source: sourceCount, rendered: vertices.length / 3 });

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (animId) cancelAnimationFrame(animId);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      while (mountRef.current && mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
      }
    };
  }, [points, clipping, useDepthColor, autoRotate, pointSize, maxRenderPoints, showGrid, zClipMin, zClipMax]);


  return (
    <div style={{ padding: '1rem', borderRadius: '20px', background: 'linear-gradient(180deg, #f7f2e8 0%, #dfe8ec 100%)', border: '1px solid rgba(32,47,59,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', color: '#162534' }}>Spatial Cloud Viewer</h2>
          <div style={{ color: '#52606d', marginTop: '0.25rem', fontSize: '0.92rem' }}>
            Rendered {stats.rendered.toLocaleString()} / {stats.source.toLocaleString()} points
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ padding: '0.35rem 0.65rem', borderRadius: '999px', background: '#10212b', color: '#eaf5fb', fontSize: '0.82rem' }}>Orbit + drag</span>
          <span style={{ padding: '0.35rem 0.65rem', borderRadius: '999px', background: '#24485c', color: '#eaf5fb', fontSize: '0.82rem' }}>Wheel zoom</span>
        </div>
      </div>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button style={{ borderRadius: '999px', padding: '0.5rem 0.85rem' }} onClick={() => setClipping(prev => !prev)}>
          {clipping ? 'Disable Clipping' : 'Enable Clipping'}
        </button>
        <button style={{ borderRadius: '999px', padding: '0.5rem 0.85rem' }} onClick={() => setUseDepthColor(prev => !prev)}>
          {useDepthColor ? 'Disable Depth Color' : 'Enable Depth Color'}
        </button>
        <button style={{ borderRadius: '999px', padding: '0.5rem 0.85rem' }} onClick={() => setAutoRotate(prev => !prev)}>
          {autoRotate ? 'Disable Auto-Rotate' : 'Enable Auto-Rotate'}
        </button>
        <button style={{ borderRadius: '999px', padding: '0.5rem 0.85rem' }} onClick={() => setShowGrid(prev => !prev)}>
          {showGrid ? 'Hide Grid' : 'Show Grid'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Point Size
          <input
            type="range"
            min="0.005"
            max="0.08"
            step="0.005"
            value={pointSize}
            onChange={(e) => setPointSize(Number(e.target.value))}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Max Points
          <input
            type="range"
            min="10000"
            max="250000"
            step="5000"
            value={maxRenderPoints}
            onChange={(e) => setMaxRenderPoints(Number(e.target.value))}
          />
          <span>{maxRenderPoints}</span>
        </label>
        {clipping && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Z Min
              <input
                type="range"
                min="-2"
                max="2"
                step="0.05"
                value={zClipMin}
                onChange={(e) => setZClipMin(Number(e.target.value))}
              />
              <span>{zClipMin.toFixed(2)}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Z Max
              <input
                type="range"
                min="-2"
                max="2"
                step="0.05"
                value={zClipMax}
                onChange={(e) => setZClipMax(Number(e.target.value))}
              />
              <span>{zClipMax.toFixed(2)}</span>
            </label>
          </>
        )}
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '500px', border: '1px solid #20303c', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 18px 40px rgba(14,28,36,0.18)' }} />
    </div>
  );
};

export default PointCloudViewer;
