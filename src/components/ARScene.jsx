/**
 * ARScene.jsx
 *
 * ── ASSET YANG DIBUTUHKAN (letakkan di /public/assets/) ──
 *
 *  targets.mind   : compiled image target dari MindAR Compiler
 *                   → https://hiukim.github.io/mind-ar-js-doc/tools/compile
 *
 *  greeting.mp4   : video artis (portrait, max 720p)
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

export default function ARScene() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  const handleToggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
    if (!vid.muted) vid.play().catch(() => {});
  };

  useEffect(() => {
    // ── Video element untuk texture ──
    const videoEl = document.createElement('video');
    videoEl.src = import.meta.env.BASE_URL + 'assets/greeting.mp4';
    videoEl.crossOrigin = 'anonymous';
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.preload = 'auto';
    videoRef.current = videoEl;

    let mindarThree = null;
    let destroyed = false;

    const init = async () => {
      mindarThree = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: import.meta.env.BASE_URL + 'assets/targets.mind',
        maxTrack: 1,
        uiLoading: 'yes',
        uiScanning: 'yes',
        uiError: 'yes',
      });

      const { renderer, scene, camera } = mindarThree;

      const hologram = createHologram(videoEl);

      // Attach ke camera bukan ke anchor →
      // hologram tetap di posisi fixed depan kamera, tidak pivot ke image
      hologram.position.set(0, 0, -1.4); // z negatif = di depan kamera
      hologram.visible = false;          // sembunyikan dulu sampai target detected
      camera.add(hologram);
      scene.add(camera);                 // pastikan camera ada di scene

      // Image tracking tetap aktif: hanya untuk trigger show/hide
      const anchor = mindarThree.addAnchor(0);

      anchor.onTargetFound = () => {
        hologram.visible = true;
        videoEl.play().catch(console.warn);
      };
      anchor.onTargetLost = () => {
        hologram.visible = false;
        videoEl.pause();
      };

      await mindarThree.start();

      if (destroyed) {
        renderer.setAnimationLoop(null);
        mindarThree.stop().catch(() => {});
        return;
      }

      // Fix z-index video MindAR
      const arVideo = containerRef.current?.querySelector('video[autoplay]');
      const arCanvas = containerRef.current?.querySelector('canvas');
      if (arVideo) arVideo.style.zIndex = '0';
      if (arCanvas) arCanvas.style.zIndex = '1';

      const baseY = hologram.position.y;
      const baseZ = hologram.position.z;
      renderer.setAnimationLoop((time) => {
        const t = time * 0.001;
        // Float naik-turun
        hologram.position.y = baseY + Math.sin(t * 1.1) * 0.025;
        // Sway kiri-kanan sangat subtle
        hologram.position.x = Math.sin(t * 0.6) * 0.015;
        // Slight breathe: maju-mundur
        hologram.position.z = baseZ + Math.sin(t * 0.8) * 0.012;
        // Subtle Y rotation (gizmo effect)
        hologram.rotation.y = Math.sin(t * 0.5) * 0.04;
        renderer.render(scene, camera);
      });
    };

    init().catch(console.error);

    return () => {
      destroyed = true;
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        mindarThree.stop().catch(() => {});
      }
      videoEl.pause();
      videoEl.src = '';
      videoRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} />

      <button
        onClick={handleToggleMute}
        style={{
          position: 'absolute',
          bottom: 28,
          right: 20,
          zIndex: 200,
          background: 'rgba(0, 229, 255, 0.12)',
          border: '1px solid rgba(0, 229, 255, 0.65)',
          color: '#00e5ff',
          borderRadius: 10,
          padding: '8px 18px',
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          letterSpacing: '0.04em',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {muted ? '🔇 Tap to Unmute' : '🔊 Sound On'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: buat hologram box 3D
// Unit MindAR: 1.0 = lebar image target (album cover)
// ─────────────────────────────────────────────────────────────────────────────
function createHologram(videoEl) {
  const group = new THREE.Group();

  // Di camera space z=-1.4: W/H dalam unit Three.js
  // (sesuaikan jika terlalu besar/kecil di layar)
  const W = 0.55;
  const H = 0.80;
  const D = 0.25;

  // ── Canvas dummy texture (ditampilkan selagi video belum siap) ──
  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = 512;
  dummyCanvas.height = 720;
  const ctx = dummyCanvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 720);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(1, '#001a33');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 720);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 700);
  ctx.beginPath();
  ctx.arc(256, 230, 90, 0, Math.PI * 2);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,100,150,0.35)';
  ctx.fill();
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AR HOLOGRAM', 256, 390);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(0,229,255,0.55)';
  ctx.fillText('[ greeting.mp4 placeholder ]', 256, 430);

  const frontTex = new THREE.CanvasTexture(dummyCanvas);

  // ── Material front face ──
  const frontMat = new THREE.MeshBasicMaterial({
    map: frontTex,
    side: THREE.FrontSide,
  });

  // ── Swap ke VideoTexture begitu greeting.mp4 siap ──
  videoEl.addEventListener('loadeddata', () => {
    const vTex = new THREE.VideoTexture(videoEl);
    vTex.minFilter = THREE.LinearFilter;
    vTex.magFilter = THREE.LinearFilter;
    frontMat.map = vTex;
    frontMat.needsUpdate = true;
  }, { once: true });

  // ── Material sisi box (dark translucent) ──
  const mkSideMat = () => new THREE.MeshBasicMaterial({
    color: 0x001a33,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  });

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z(front), -Z(back)
  const boxGeo = new THREE.BoxGeometry(W, H, D);
  const box = new THREE.Mesh(boxGeo, [
    mkSideMat(), mkSideMat(), mkSideMat(), mkSideMat(),
    frontMat,    // front (+Z) → menghadap kamera
    mkSideMat(),
  ]);
  group.add(box);

  // ── Glowing wireframe edges ──
  group.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeo),
    new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9 })
  ));

  // ── Corner accent lines ──
  const accentMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
  const cornerH = H + 0.06;
  for (const [cx, cz] of [[-W/2, -D/2], [W/2, -D/2], [-W/2, D/2], [W/2, D/2]]) {
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, -cornerH / 2, cz),
        new THREE.Vector3(cx,  cornerH / 2, cz),
      ]),
      accentMat
    ));
  }

  group.position.set(0, 0.08, 0.22);
  // Canvas CSS di-mirror (scaleX -1), jadi balik group di Three.js
  // supaya teks & video terbaca benar setelah double-negation
  group.scale.x = -1;
  return group;
}
