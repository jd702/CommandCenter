import React, {useRef, useEffect} from 'react';
import * as THREE from 'three';

// Function to create a point cloud from the given points
const PointCloudViewer = ({ points })  => {
    const mountRef = useRef(null)

    useEffect(() => {

        if (!points || points.length === 0 ) return;

        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;

        //scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 5;

        // renderer setup
        const renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setSize(width, height);
        mountRef.current.appendChild(renderer.domElement);

        //convert to THREE.Points
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];

        points.forEach((p) => {
            vertices.push(p.x, p.y, p.z);
            colors.push(p.r / 255, p.g / 255, p.b / 255); // Normalize color values to 0 & 1
        
        
    });

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({size: 0.05, vertexColors: true});
        const pointCloud = new THREE.Points(geometry, material);
        scene.add(pointCloud);

        // Animation loop
        const animate = () => {
        requestAnimationFrame(animate);
        pointCloud.rotation.y += 0.002;
        renderer.render(scene, camera);
        };

        animate();

        //cleanup function
        return () => {
            mountRef.current.removeChild(renderer.domElement);

        };
    }, [points]);

    return <div ref={mountRef} style={{width: '100%', height: '500px'}} />;

    };


    export default PointCloudViewer;