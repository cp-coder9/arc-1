import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type ArchitexThreeExperienceVariant = 'command-atlas' | 'role-constellation' | 'stage-gate-ribbon';

interface ArchitexThreeExperienceProps {
  variant?: ArchitexThreeExperienceVariant;
  className?: string;
  prefersReducedMotion?: boolean;
}

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

const NODE_PALETTES: Record<ArchitexThreeExperienceVariant, Array<{ label: string; color: string; radius: number }>> = {
  'command-atlas': [
    { label: 'Brief', color: '#f8fafc', radius: 2.55 },
    { label: 'BEP', color: '#7cd7c3', radius: 2.1 },
    { label: 'SANS', color: '#ffffff', radius: 2.35 },
    { label: 'Tender', color: '#9fe8d6', radius: 2.65 },
    { label: 'Site', color: '#f7c76a', radius: 2.25 },
    { label: 'Escrow', color: '#d9c2ff', radius: 2.45 },
    { label: 'Closeout', color: '#b6fff1', radius: 2.2 },
  ],
  'role-constellation': [
    { label: 'Client', color: '#f8fafc', radius: 2.7 },
    { label: 'BEP', color: '#7cd7c3', radius: 2.35 },
    { label: 'Architect', color: '#d9c2ff', radius: 2.55 },
    { label: 'Contractor', color: '#f7c76a', radius: 2.2 },
    { label: 'Supplier', color: '#b6fff1', radius: 2.5 },
    { label: 'Subcontractor', color: '#ffffff', radius: 2.3 },
    { label: 'Freelancer', color: '#9fe8d6', radius: 2.65 },
  ],
  'stage-gate-ribbon': [
    { label: 'Intent', color: '#f8fafc', radius: 2.25 },
    { label: 'Verify', color: '#7cd7c3', radius: 2.55 },
    { label: 'Approve', color: '#d9c2ff', radius: 2.35 },
    { label: 'Fund', color: '#f7c76a', radius: 2.6 },
    { label: 'Build', color: '#b6fff1', radius: 2.45 },
    { label: 'Sign off', color: '#ffffff', radius: 2.3 },
  ],
};

function makeWingGeometry(side: -1 | 1) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(side * 0.45, 0.55, side * 1.25, 0.72, side * 2.15, 0.18);
  shape.bezierCurveTo(side * 1.35, 0.1, side * 0.7, -0.18, 0, -0.72);
  shape.bezierCurveTo(side * 0.12, -0.38, side * 0.12, -0.1, 0, 0);
  return new THREE.ShapeGeometry(shape, 36);
}

export function ArchitexThreeExperience({
  variant = 'command-atlas',
  className = '',
  prefersReducedMotion = false,
}: ArchitexThreeExperienceProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, variant === 'stage-gate-ribbon' ? 3.1 : 3.7, variant === 'stage-gate-ribbon' ? 8.2 : 9.4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const root = new THREE.Group();
    const orbitGroup = new THREE.Group();
    const latticeGroup = new THREE.Group();
    scene.add(root);
    root.add(latticeGroup, orbitGroup);

    const ambient = new THREE.AmbientLight(0xb6fff1, 1.4);
    const key = new THREE.PointLight(0x7cd7c3, 52, 18);
    key.position.set(2.8, 4.2, 4.6);
    const warm = new THREE.PointLight(0xf7c76a, 20, 14);
    warm.position.set(-3.6, -1.5, 3.2);
    scene.add(ambient, key, warm);

    const nodeMaterial = (color: string) => new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.22,
      roughness: 0.38,
      metalness: 0.18,
    });

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x9fe8d6, transparent: true, opacity: 0.32 });
    const gateMaterial = new THREE.MeshStandardMaterial({
      color: 0x7cd7c3,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.05,
    });

    const nodes = NODE_PALETTES[variant];
    const labelContainer = document.createElement('div');
    labelContainer.className = 'pointer-events-none absolute inset-0 z-20';
    mount.appendChild(labelContainer);
    const labels: Array<{ element: HTMLDivElement; position: THREE.Vector3 }> = [];

    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2;
      const wave = variant === 'stage-gate-ribbon' ? Math.sin(angle * 1.5) * 0.55 : Math.sin(angle * 2) * 0.42;
      const position = new THREE.Vector3(Math.cos(angle) * node.radius, wave, Math.sin(angle) * (node.radius * 0.58));
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(index % 2 ? 0.105 : 0.14, 24, 18), nodeMaterial(node.color));
      sphere.position.copy(position);
      orbitGroup.add(sphere);

      const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), position]);
      latticeGroup.add(new THREE.Line(lineGeometry, lineMaterial));

      const nextAngle = ((index + 1) / nodes.length) * Math.PI * 2;
      const nextRadius = nodes[(index + 1) % nodes.length].radius;
      const nextPosition = new THREE.Vector3(Math.cos(nextAngle) * nextRadius, Math.sin(nextAngle * 2) * 0.42, Math.sin(nextAngle) * (nextRadius * 0.58));
      const arc = new THREE.CatmullRomCurve3([
        position,
        new THREE.Vector3((position.x + nextPosition.x) * 0.5, 0.68, (position.z + nextPosition.z) * 0.5),
        nextPosition,
      ]);
      latticeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.getPoints(32)), lineMaterial));

      const label = document.createElement('div');
      label.className = 'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-[#04302c]/72 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#f8fafc] shadow-[0_10px_32px_rgba(0,0,0,0.24)] backdrop-blur-md';
      label.textContent = node.label;
      labelContainer.appendChild(label);
      labels.push({ element: label, position });
    });

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.36, 0.008, 12, 144),
      new THREE.MeshBasicMaterial({ color: 0xb6fff1, transparent: true, opacity: 0.34 })
    );
    ring.rotation.x = Math.PI / 2.6;
    root.add(ring);

    const leftWing = new THREE.Mesh(makeWingGeometry(-1), gateMaterial);
    const rightWing = new THREE.Mesh(makeWingGeometry(1), gateMaterial.clone());
    leftWing.position.set(-0.18, 0.15, 0.02);
    rightWing.position.set(0.18, 0.15, 0.02);
    root.add(leftWing, rightWing);

    const birdHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.012, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.28 })
    );
    birdHalo.rotation.x = Math.PI / 2;
    root.add(birdHalo);

    const textureLoader = new THREE.TextureLoader();
    let logoMesh: THREE.Mesh | null = null;
    textureLoader.load(
      logoSrc,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.96, depthWrite: false });
        logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.22), material);
        logoMesh.position.set(0, 0, 0.12);
        root.add(logoMesh);
      },
      undefined,
      () => {
        const fallback = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), nodeMaterial('#f8fafc'));
        fallback.position.set(0, 0, 0.12);
        root.add(fallback);
      }
    );

    const particleCount = variant === 'stage-gate-ribbon' ? 150 : 210;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const radius = 2.6 + Math.random() * 3.6;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 3.9;
      positions[i * 3 + 2] = Math.sin(angle) * radius * 0.62;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xb6fff1, size: 0.018, transparent: true, opacity: 0.42, depthWrite: false })
    );
    root.add(particles);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const updateLabels = () => {
      const rect = mount.getBoundingClientRect();
      labels.forEach(({ element, position }) => {
        const projected = position.clone().applyMatrix4(orbitGroup.matrixWorld).project(camera);
        const x = (projected.x * 0.5 + 0.5) * rect.width;
        const y = (-projected.y * 0.5 + 0.5) * rect.height;
        element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        element.style.opacity = projected.z > 1 ? '0' : '1';
      });
    };

    let frameId = 0;
    const startedAt = performance.now();
    const render = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const speed = prefersReducedMotion ? 0 : 1;
      root.rotation.y = elapsed * 0.12 * speed;
      orbitGroup.rotation.y = elapsed * 0.18 * speed;
      latticeGroup.rotation.y = elapsed * 0.18 * speed;
      particles.rotation.y = elapsed * -0.035 * speed;
      ring.rotation.z = elapsed * 0.22 * speed;
      birdHalo.rotation.z = elapsed * -0.16 * speed;
      leftWing.rotation.z = Math.sin(elapsed * 1.15) * 0.035 * speed;
      rightWing.rotation.z = -Math.sin(elapsed * 1.15) * 0.035 * speed;
      if (logoMesh) logoMesh.rotation.z = Math.sin(elapsed * 0.55) * 0.025 * speed;
      renderer.render(scene, camera);
      updateLabels();
      frameId = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      labels.forEach(({ element }) => element.remove());
      labelContainer.remove();
      renderer.dispose();
      scene.traverse((object) => {
        if ('geometry' in object && object.geometry) (object.geometry as THREE.BufferGeometry).dispose();
        if ('material' in object && object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, [prefersReducedMotion, variant]);

  return (
    <div className={`relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#04302c]/60 shadow-[0_40px_140px_rgba(0,0,0,0.38)] backdrop-blur-2xl ${className}`}>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(124,215,195,0.22),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(217,194,255,0.16),transparent_28%),linear-gradient(135deg,rgba(248,250,252,0.08),transparent_48%)]" />
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[42%] z-10 h-48 w-48 -translate-x-1/2 -translate-y-1/2 object-contain opacity-55 drop-shadow-[0_0_42px_rgba(182,255,241,0.42)] sm:h-64 sm:w-64"
        referrerPolicy="no-referrer"
      />
      <div ref={mountRef} className="absolute inset-0 z-20" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-30 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#b6fff1]/72">Bird OS spatial layer</p>
          <p className="mt-1 max-w-sm text-sm font-medium leading-relaxed text-[#f8fafc]/62">The Architex bird sits at the centre: every role, gate, evidence trail, and payment orbiting one accountable project truth.</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#f8fafc]/70">Three.js live system map</div>
      </div>
    </div>
  );
}
