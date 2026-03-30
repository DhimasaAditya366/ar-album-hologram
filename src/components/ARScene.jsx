/**
 * ARScene.jsx
 *
 * Flow:
 *  1. MindAR scan image target → trigger spawn hologram
 *  2. Hologram muncul sebagai overlay 3D di atas camera feed
 *  3. Gyroscope (DeviceOrientation) memutar hologram → efek hologram mengikuti tilt HP
 *
 * Asset di /public/assets/:
 *  targets.mind  — dari MindAR Compiler
 *  greeting.mp4  — video artis (opsional, ada dummy canvas kalau belum ada)
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

export default function ARScene({ videoSrc, onBack }) {
  const containerRef = useRef(null);
  const hologramRef  = useRef(null);
  const videoRef     = useRef(null);
  const mindarRef    = useRef(null);
  const [muted,   setMuted]   = useState(true);
  const [status,  setStatus]  = useState('Initializing...');
  const [spawned, setSpawned] = useState(false);
  const [ready,   setReady]   = useState(false);

  const handleBack = () => {
    videoRef.current?.pause();
    const mind = mindarRef.current;
    if (mind) {
      mind._animate?.();                   // cancel animation frame
      mind.renderer?.setAnimationLoop(null);
      mind.stop().catch(() => {});         // stop camera (async, tidak ditunggu)
    }
    onBack?.();                            // langsung balik ke dashboard
  };

  const handleClose = () => {
    if (hologramRef.current) hologramRef.current.visible = false;
    videoRef.current?.pause();
    setSpawned(false);
    setStatus('Scanning... (arahkan ke cover album)');
  };

  const handleToggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
    if (!vid.muted) vid.play().catch(() => {});
  };

  useEffect(() => {
    const container = containerRef.current;

    /* ── Video element ── */
    const videoEl = document.createElement('video');
    videoEl.loop        = true;
    videoEl.muted       = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('webkit-playsinline', '');
    videoRef.current = videoEl;

    /* ── Overlay Three.js renderer (terpisah dari MindAR) ── */
    const W = container.clientWidth;
    const H = container.clientHeight;

    const overlayRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    overlayRenderer.setSize(W, H);
    overlayRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    overlayRenderer.setClearColor(0x000000, 0);
    overlayRenderer.outputEncoding = THREE.sRGBEncoding;
    overlayRenderer.physicallyCorrectLights = true;

    /* ── Environment map (diperlukan agar material PBR/metalik GLB tidak hitam) ── */
    const pmremGenerator = new THREE.PMREMGenerator(overlayRenderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    overlayRenderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;pointer-events:none';
    container.appendChild(overlayRenderer.domElement);

    const overlayScene  = new THREE.Scene();
    overlayScene.environment = envTexture;
    const overlayCamera = new THREE.PerspectiveCamera(60, W / H, 0.01, 100);
    overlayCamera.position.set(0, 0, 2.5);

    /* ── Lighting: ambient kuat + 6 arah cardinal ── */
    overlayScene.add(new THREE.AmbientLight(0xffffff, 3.5));
    [
      [ 1, 0, 0], [-1, 0, 0],  // kiri & kanan
      [ 0, 1, 0], [ 0,-1, 0],  // atas & bawah
      [ 0, 0, 1], [ 0, 0,-1],  // depan & belakang
    ].forEach(([x, y, z]) => {
      const l = new THREE.DirectionalLight(0xffffff, 1.0);
      l.position.set(x, y, z);
      overlayScene.add(l);
    });

    /* ── Hologram group (wrapper untuk gyro + float) ── */
    const hologramGroup = new THREE.Group();
    hologramGroup.visible = false;
    overlayScene.add(hologramGroup);
    hologramRef.current = hologramGroup;

    /* ── VideoTexture — listener dipasang SEBELUM src/load ── */
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });

    const swapToVideo = (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const vTex = new THREE.VideoTexture(videoEl);
        vTex.minFilter = THREE.LinearFilter;
        vTex.magFilter = THREE.LinearFilter;
        screenMat.map   = vTex;
        screenMat.color.set(0xffffff);
        screenMat.needsUpdate = true;
      };
    })();

    videoEl.addEventListener('loadeddata', swapToVideo);
    videoEl.addEventListener('canplay',    swapToVideo);

    videoEl.src = (videoSrc || import.meta.env.BASE_URL + 'assets/greeting.mp4') + '?v=' + Date.now();
    videoEl.load();

    /* ── Load GLB model ── */
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      import.meta.env.BASE_URL + 'assets/model.glb?v=' + Date.now(),
      (gltf) => {
        const model = gltf.scene;

        // Pastikan material tidak pure-black: jika tidak ada texture, paksa warna putih
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              if (!mat.map && mat.color) {
                const c = mat.color;
                if (c.r < 0.05 && c.g < 0.05 && c.b < 0.05) {
                  mat.color.set(0xffffff);
                }
              }
              // Kurangi metalness agar sisi tetap terang saat rotate
              if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.3);
              // Naikkan envMapIntensity supaya environment map fill ke semua sisi
              if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 2.5;
              mat.needsUpdate = true;
            });
          }
        });

        hologramGroup.add(model);

        // Auto-size video plane berdasarkan bounding box GLB
        const box  = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const INSET = 0.82;
        const W = size.x * INSET, H = size.y * INSET;
        const screenMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(W, H),
          screenMat
        );
        screenMesh.position.set(0, 0, box.max.z - 0.15);
        hologramGroup.add(screenMesh);
      },
      undefined,
      (err) => { setStatus('ERROR load FBX: ' + (err?.message ?? err)); }
    );

    /* ── Gyroscope ── */
    let gyroX = 0, gyroY = 0;   // target rotation (rad)
    let curX  = 0, curY  = 0;   // current smoothed rotation

    const onOrientation = (e) => {
      const beta  = e.beta  ?? 0;   // tilt maju/mundur  (-180 ~ 180)
      const gamma = e.gamma ?? 0;   // tilt kiri/kanan   (-90 ~ 90)
      // Saat HP portrait tegak: beta ≈ 90 → normalize ke 0
      gyroX = THREE.MathUtils.degToRad((beta - 90) * 0.35);
      gyroY = THREE.MathUtils.degToRad(gamma       * 0.35);
    };

    // iOS 13+ butuh izin dari user gesture — coba request otomatis,
    // kalau gagal (butuh gesture) user tinggal tap layar
    const startGyro = () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(p => { if (p === 'granted') window.addEventListener('deviceorientation', onOrientation); })
          .catch(() => {});
      } else {
        window.addEventListener('deviceorientation', onOrientation);
      }
    };
    startGyro();
    // Fallback: tap layar untuk request izin iOS
    const onTap = () => { startGyro(); container.removeEventListener('click', onTap); };
    container.addEventListener('click', onTap);

    /* ── MindAR (camera feed + image detection trigger) ── */
    let mindarThree = null;
    let destroyed   = false;
    mindarRef.current = null;

    const init = async () => {
      setStatus('Loading AR engine...');
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: import.meta.env.BASE_URL + 'assets/targets.mind',
        maxTrack: 1,
        uiLoading: 'yes',
        uiScanning: 'no',   // kita pakai overlay scanning sendiri
        uiError:    'yes',
        filterMinCF: 0.001,
        filterBeta:  0.01,
      });

      // Anchor hanya sebagai trigger — tidak add hologram ke anchor
      const anchor = mindarThree.addAnchor(0);
      anchor.onTargetFound = () => {
        if (hologramGroup.visible) return;
        hologramGroup.visible = true;
        setSpawned(true);
        setStatus('Target found!');
        videoEl.currentTime = 0;
        videoEl.play().catch(console.warn);
      };
      anchor.onTargetLost = () => {}; // hologram tetap tampil sampai di-close

      setStatus('Starting camera...');
      await mindarThree.start();
      mindarRef.current = mindarThree;
      if (destroyed) { mindarThree.stop().catch(() => {}); return; }

      setStatus('Scanning... (arahkan ke cover album)');
      setReady(true);

      // Fix z-index: video di bawah, overlay canvas MindAR di tengah
      const arVideo  = container.querySelector('video[autoplay]');
      const arCanvas = container.querySelector('canvas[data-engine]') ?? container.querySelector('canvas');
      if (arVideo)  arVideo.style.zIndex  = '0';
      if (arCanvas && arCanvas !== overlayRenderer.domElement) arCanvas.style.zIndex = '1';
      // Overlay renderer kita ada di z-index 10 (sudah diset di atas)

      /* ── Floating + Gyro render loop ── */
      let raf;
      const startTime = performance.now();
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const t = (performance.now() - startTime) / 1000;

        // Smooth gyro
        curX += (gyroX - curX) * 0.08;
        curY += (gyroY - curY) * 0.08;
        hologramGroup.rotation.x = curX;
        hologramGroup.rotation.y = curY;

        // Float animation
        hologramGroup.position.y = Math.sin(t * 1.2) * 0.06;

        overlayRenderer.render(overlayScene, overlayCamera);
      };
      animate();

      // Simpan ref raf untuk cleanup
      mindarThree._overlayRaf = raf;
      mindarThree._animate    = () => cancelAnimationFrame(raf);
    };

    init().catch(err => {
      console.error(err);
      setStatus('ERROR: ' + (err?.message ?? String(err)));
    });

    return () => {
      destroyed = true;
      mindarThree?._animate?.();
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        mindarThree.stop().catch(() => {});
      }
      overlayRenderer.dispose();
      overlayRenderer.domElement.remove();
      window.removeEventListener('deviceorientation', onOrientation);
      container.removeEventListener('click', onTap);
      videoEl.pause();
      videoEl.src = '';
      videoRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} />

      {/* Status overlay */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        color: status.startsWith('ERROR') ? '#ff4d4d' : '#00e5ff',
        fontSize: 12, fontFamily: 'monospace',
        padding: '4px 10px', borderRadius: 6,
        pointerEvents: 'none',
        maxWidth: 'calc(100% - 24px)', wordBreak: 'break-word',
      }}>
        {status}
      </div>

      {/* Scanning overlay — muncul saat kamera siap & hologram belum spawn */}
      {ready && !spawned && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {/* Corner brackets */}
          {[
            { top: 0,    left: 0,    borderTop: '3px solid #fff', borderLeft:  '3px solid #fff' },
            { top: 0,    right: 0,   borderTop: '3px solid #fff', borderRight: '3px solid #fff' },
            { bottom: 0, left: 0,    borderBottom: '3px solid #fff', borderLeft:  '3px solid #fff' },
            { bottom: 0, right: 0,   borderBottom: '3px solid #fff', borderRight: '3px solid #fff' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...s }} />
          ))}
          {/* Scan line */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
            animation: 'scanline 2s linear infinite',
          }} />
          {/* Label */}
          <div style={{
            position: 'absolute', bottom: '18%',
            color: 'rgba(255,255,255,0.85)', fontSize: 14,
            fontFamily: 'system-ui, sans-serif',
            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            animation: 'blink 2s ease-in-out infinite',
          }}>
            Arahkan ke cover album
          </div>
        </div>
      )}

      {/* Mute button — selalu tampil */}
      <button onClick={handleToggleMute} style={{
        position: 'absolute', bottom: 28, right: 20, zIndex: 300,
        background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.65)',
        color: '#00e5ff', borderRadius: 10, padding: '8px 18px', fontSize: 13,
        fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        letterSpacing: '0.04em', userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        {muted ? '🔇 Unmute' : '🔊 Sound On'}
      </button>

      {/* Back to dashboard */}
      {onBack && (
        <button onClick={handleBack} style={{
          position: 'absolute', top: 12, right: 12, zIndex: 300,
          background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff', borderRadius: 10, padding: '6px 16px', fontSize: 13,
          fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          ← Back
        </button>
      )}

      {/* Close / Despawn button — hanya muncul saat hologram aktif */}
      {spawned && (
        <button onClick={handleClose} style={{
          position: 'absolute', bottom: 28, left: 20, zIndex: 300,
          background: 'rgba(255,50,50,0.15)',
          border: '1px solid rgba(255,80,80,0.7)',
          color: '#ff6060', borderRadius: 10,
          padding: '8px 20px', fontSize: 13,
          fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          letterSpacing: '0.04em', userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          ✕ Tutup
        </button>
      )}

    </div>
  );
}

