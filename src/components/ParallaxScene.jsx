import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * FG shader — uOffset menggeser viewport ke dalam texture
 * (color & matte pakai UV yang sama → mask selalu sejajar)
 */
const FRAG_FG = `
  uniform sampler2D uColor;
  uniform sampler2D uMatte;
  uniform vec2      uOffset;
  varying vec2 vUv;
  void main() {
    vec2 uv     = clamp(vUv + uOffset, 0.001, 0.999);
    vec4  color = texture2D(uColor, uv);
    float alpha = texture2D(uMatte, uv).r;
    gl_FragColor = vec4(color.rgb, alpha);
  }
`;

export default function ParallaxScene({ onBack }) {
  const containerRef = useRef(null);
  const [muted,   setMuted]   = useState(false);
  const [spawned, setSpawned] = useState(false);
  const [ready,   setReady]   = useState(false);
  const [status,  setStatus]  = useState('Initializing...');
  const videosRef = useRef([]);
  const planesRef = useRef({ bg: null, fg: null });

  const handleBack = () => {
    sessionStorage.removeItem('sw-reloaded');
    window.location.reload();
  };

  const handleClose = () => {
    const { bg, fg } = planesRef.current;
    if (bg) bg.visible = false;
    if (fg) fg.visible = false;
    videosRef.current.forEach(v => v.pause());
    setSpawned(false);
    setStatus('Scanning... (arahkan ke cover album)');
  };

  const handleToggleMute = () => {
    const vids = videosRef.current;
    if (!vids.length) return;
    const m = !vids[0].muted;
    vids.forEach(v => { v.muted = m; if (!m) v.play().catch(() => {}); });
    setMuted(m);
  };

  useEffect(() => {
    const container = containerRef.current;
    const W      = container.clientWidth;
    const H      = container.clientHeight;
    const aspect = W / H;
    const BASE   = import.meta.env.BASE_URL;

    /* ── Video elements ── */
    const makeVideo = (file) => {
      const v = document.createElement('video');
      v.loop        = true;
      v.muted       = false;
      v.playsInline = true;
      v.setAttribute('webkit-playsinline', '');
      v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
      v.src = BASE + 'assets/' + file + '?v=' + Date.now();
      v.load();
      container.appendChild(v);
      return v;
    };

    const bgVid      = makeVideo('bg.mp4');
    const fgColorVid = makeVideo('fg_color.mp4');
    const fgMatteVid = makeVideo('fg_matte.mp4');
    videosRef.current = [bgVid, fgColorVid, fgMatteVid];

    /* ── Renderer — alpha:true agar kamera MindAR terlihat saat scanning ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;pointer-events:none;';
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 100);
    camera.position.set(0, 0, 2.5);

    /*
     * Plane = TEPAT ukuran layar (bukan oversized).
     * Parallax via UV offset → tidak ada zoom/crop, tidak ada black edge.
     *   BG UV offset per degree: 0.0010  → tilt 20°: 2%  geser
     *   FG UV offset per degree: 0.0030  → tilt 20°: 6%  geser
     *   Relatif 20°: 4% lebar layar — subtle & stabil
     */
    const visH   = 2 * Math.tan(THREE.MathUtils.degToRad(30)) * 2.5;
    const visW   = visH * aspect;
    /*
     * 3D parallax wallpaper style:
     *   FG (orang) = DIAM, tidak bergerak → terasa "melayang di depan"
     *   BG         = bergerak mengikuti gyro → terasa "jauh di belakang"
     *   tilt 10°   → BG geser 8% layar → depth jelas terlihat
     */
    const BG_UV  = 0.0080;
    const FG_UV  = 0.0000; // FG tidak bergerak

    /* ── Textures — identik dengan ARScene ── */
    const makeTex = (vid, srgb = true) => {
      const t = new THREE.VideoTexture(vid);
      if (srgb) t.encoding = THREE.sRGBEncoding;
      t.minFilter       = THREE.LinearFilter;
      t.magFilter       = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.center.set(0.5, 0.5);
      // RepeatWrapping: saat offset keluar batas → tile, tidak stretch garis
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };

    const bgTex      = makeTex(bgVid);
    const fgColorTex = makeTex(fgColorVid);
    const fgMatteTex = makeTex(fgMatteVid, false); // matte = grayscale, no sRGB

    /*
     * BG plane 1.25x oversized → area buffer untuk parallax movement.
     * Dengan BG_UV=0.008 dan cap ±15°: max offset = 15*0.008 = 0.12
     * Plane 1.25x → texture di-tile lebih kecil (scale 0.8) → buffer 10% tiap sisi ✓
     */
    bgTex.repeat.set(0.82, 0.82); // sedikit zoom out agar ada buffer di tepi
    bgTex.offset.set(0.09, 0.09); // mulai dari tengah

    /* ── Background plane — sedikit lebih besar dari layar ── */
    const bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(visW * 1.25, visH * 1.25),
      new THREE.MeshBasicMaterial({ map: bgTex })
    );
    bgMesh.position.z = 0;
    bgMesh.visible    = false;
    scene.add(bgMesh);

    /* ── Foreground plane — ukuran sama, parallax via uOffset uniform ── */
    const fgMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:  { value: fgColorTex },
        uMatte:  { value: fgMatteTex },
        uOffset: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG_FG,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    });

    const fgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(visW, visH),
      fgMat
    );
    fgMesh.position.z = 0.1;
    fgMesh.visible    = false;
    scene.add(fgMesh);

    planesRef.current = { bg: bgMesh, fg: fgMesh };

    /* ── Gyroscope — nilai derajat, cap ±20° ── */
    let gyroX = 0, gyroY = 0, curX = 0, curY = 0;

    const onOrientation = (e) => {
      gyroX = Math.max(-15, Math.min(15, (e.beta  ?? 0) - 90));
      gyroY = Math.max(-15, Math.min(15,  e.gamma ?? 0));
    };
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
    const onTap = () => { startGyro(); container.removeEventListener('click', onTap); };
    container.addEventListener('click', onTap);

    /* ── Render loop ── */
    let raf;
    let syncFrame = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);

      // Sync fg_matte ke fg_color setiap 6 frame — cegah shadow drift
      syncFrame++;
      if (syncFrame % 6 === 0) {
        const diff = Math.abs(fgColorVid.currentTime - fgMatteVid.currentTime);
        if (diff > 0.04) fgMatteVid.currentTime = fgColorVid.currentTime;
      }

      curX += (gyroX - curX) * 0.05;
      curY += (gyroY - curY) * 0.05;

      // BG: pakai texture.offset (MeshBasicMaterial auto-apply matrix)
      bgTex.offset.x = -curY * BG_UV;
      bgTex.offset.y =  curX * BG_UV;

      // FG: pakai shader uniform (ShaderMaterial tidak auto-apply texture matrix)
      fgMat.uniforms.uOffset.value.set(-curY * FG_UV, curX * FG_UV);

      renderer.render(scene, camera);
    };

    /* ── MindAR ── */
    let mindarThree = null;
    let destroyed   = false;

    const init = async () => {
      setStatus('Loading AR engine...');
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: BASE + 'assets/targets.mind',
        maxTrack: 1, uiLoading: 'yes', uiScanning: 'no', uiError: 'yes',
        filterMinCF: 0.001, filterBeta: 0.01,
      });

      const anchor = mindarThree.addAnchor(0);
      anchor.onTargetFound = () => {
        bgMesh.visible = true;
        fgMesh.visible = true;
        setSpawned(true);
        setStatus('Target found!');
        // Reset semua ke 0 dulu, lalu play fg_color → setelah ready, snap matte ke currentTime yang sama
        bgVid.currentTime = 0;
        fgColorVid.currentTime = 0;
        fgMatteVid.currentTime = 0;
        bgVid.play().catch(() => {});
        fgColorVid.play().then(() => {
          fgMatteVid.currentTime = fgColorVid.currentTime;
          fgMatteVid.play().catch(() => {});
        }).catch(() => { fgMatteVid.play().catch(() => {}); });
      };
      anchor.onTargetLost = () => {};

      setStatus('Starting camera...');
      await mindarThree.start();
      if (destroyed) { mindarThree.stop().catch(() => {}); return; }

      setStatus('Scanning... (arahkan ke cover album)');
      setReady(true);

      const arVideo  = container.querySelector('video[autoplay]');
      const arCanvas = container.querySelector('canvas[data-engine]') ?? container.querySelector('canvas');
      if (arVideo)  arVideo.style.zIndex  = '0';
      if (arCanvas && arCanvas !== renderer.domElement) arCanvas.style.zIndex = '1';

      animate();
      mindarThree._animate = () => cancelAnimationFrame(raf);
    };

    init().catch(err => setStatus('ERROR: ' + (err?.message ?? String(err))));

    return () => {
      destroyed = true;
      mindarThree?._animate?.();
      if (mindarThree) { mindarThree.renderer?.setAnimationLoop(null); mindarThree.stop().catch(() => {}); }
      renderer.dispose();
      renderer.domElement.remove();
      window.removeEventListener('deviceorientation', onOrientation);
      container.removeEventListener('click', onTap);
      videosRef.current.forEach(v => { v.pause(); v.src = ''; v.remove(); });
      videosRef.current = [];
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} />

      {status.startsWith('ERROR') && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 300,
          background: 'rgba(0,0,0,0.7)', color: '#ff4d4d', fontSize: 12,
          fontFamily: 'monospace', padding: '4px 10px', borderRadius: 6,
          pointerEvents: 'none', maxWidth: 'calc(100% - 24px)', wordBreak: 'break-word',
        }}>{status}</div>
      )}

      {ready && !spawned && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {[
            { top: 0,    left: 0,    borderTop: '2px solid #c9a84c', borderLeft:  '2px solid #c9a84c' },
            { top: 0,    right: 0,   borderTop: '2px solid #c9a84c', borderRight: '2px solid #c9a84c' },
            { bottom: 0, left: 0,    borderBottom: '2px solid #c9a84c', borderLeft:  '2px solid #c9a84c' },
            { bottom: 0, right: 0,   borderBottom: '2px solid #c9a84c', borderRight: '2px solid #c9a84c' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: 32, height: 32, ...s }} />
          ))}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.8), transparent)',
            animation: 'scanline 2s linear infinite',
          }} />
          <div style={{
            position: 'absolute', bottom: '18%', color: '#c9a84c', fontSize: 13,
            fontFamily: 'system-ui, sans-serif', letterSpacing: '0.1em',
            textTransform: 'uppercase', textShadow: '0 1px 8px rgba(0,0,0,0.9)',
            animation: 'blink 2s ease-in-out infinite',
          }}>
            Arahkan ke cover album
          </div>
        </div>
      )}

      <button onClick={handleToggleMute} style={{
        position: 'absolute', bottom: 28, right: 20, zIndex: 300,
        background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.5)',
        color: '#f5d77e', borderRadius: 10, padding: '8px 18px', fontSize: 13,
        fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        letterSpacing: '0.04em', userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        {muted ? '🔇 Unmute' : '🔊 Sound On'}
      </button>

      {onBack && (
        <button onClick={handleBack} style={{
          position: 'absolute', top: 16, left: 16, zIndex: 300,
          background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.45)',
          color: '#f5d77e', borderRadius: 10, padding: '6px 16px', fontSize: 13,
          fontFamily: 'system-ui, sans-serif', cursor: 'pointer',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}>
          ← Back
        </button>
      )}

      {spawned && (
        <button onClick={handleClose} style={{
          position: 'absolute', bottom: 28, left: 20, zIndex: 300,
          background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.4)',
          color: '#c9a84c', borderRadius: 10, padding: '8px 20px', fontSize: 13,
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