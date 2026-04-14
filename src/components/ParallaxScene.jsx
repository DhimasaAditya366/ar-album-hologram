import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_FG = `
  uniform sampler2D uColor;
  uniform sampler2D uMatte;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(uColor, vUv);
    float alpha = texture2D(uMatte, vUv).r;
    gl_FragColor = vec4(color.rgb, alpha);
  }
`;

export default function ParallaxScene({ onBack }) {
  const containerRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const videosRef = useRef([]);

  const handleBack = () => {
    sessionStorage.removeItem('sw-reloaded');
    window.location.reload();
  };

  const handleToggleMute = () => {
    const vids = videosRef.current;
    if (!vids.length) return;
    const newMuted = !vids[0].muted;
    vids.forEach(v => { v.muted = newMuted; if (!newMuted) v.play().catch(() => {}); });
    setMuted(newMuted);
  };

  useEffect(() => {
    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const aspect = W / H;
    const BASE = import.meta.env.BASE_URL;

    /* ── Video elements ── */
    const makeVideo = (src) => {
      const v = document.createElement('video');
      v.loop = true;
      v.muted = false;
      v.playsInline = true;
      v.setAttribute('webkit-playsinline', '');
      v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
      v.src = BASE + 'assets/' + src + '?v=' + Date.now();
      v.load();
      container.appendChild(v);
      return v;
    };

    const bgVid      = makeVideo('bg.mp4');
    const fgColorVid = makeVideo('fg_color.mp4');
    const fgMatteVid = makeVideo('fg_matte.mp4');
    videosRef.current = [bgVid, fgColorVid, fgMatteVid];

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;';
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 100);
    camera.position.set(0, 0, 2.5);

    /* ── Plane size — fill screen + sedikit overflow untuk parallax movement ── */
    const visH  = 2 * Math.tan(THREE.MathUtils.degToRad(30)) * 2.5;
    const pH    = visH * 1.2;
    const pW    = pH * aspect * 1.2;

    /* ── Background plane ── */
    const bgTex = new THREE.VideoTexture(bgVid);
    bgTex.encoding   = THREE.sRGBEncoding;
    bgTex.minFilter  = THREE.LinearFilter;
    bgTex.magFilter  = THREE.LinearFilter;

    const bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pW, pH),
      new THREE.MeshBasicMaterial({ map: bgTex })
    );
    bgMesh.position.z = 0;
    scene.add(bgMesh);

    /* ── Foreground plane (person + matte shader) ── */
    const fgColorTex = new THREE.VideoTexture(fgColorVid);
    fgColorTex.encoding  = THREE.sRGBEncoding;
    fgColorTex.minFilter = THREE.LinearFilter;
    fgColorTex.magFilter = THREE.LinearFilter;

    const fgMatteTex = new THREE.VideoTexture(fgMatteVid);
    fgMatteTex.minFilter = THREE.LinearFilter;
    fgMatteTex.magFilter = THREE.LinearFilter;

    const fgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pW, pH),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: fgColorTex },
          uMatte: { value: fgMatteTex },
        },
        vertexShader:   VERT,
        fragmentShader: FRAG_FG,
        transparent:    true,
        side:           THREE.DoubleSide,
      })
    );
    fgMesh.position.z = 0.4;
    scene.add(fgMesh);

    /* ── Start videos ── */
    const playAll = () => videosRef.current.forEach(v => v.play().catch(() => {}));
    playAll();
    container.addEventListener('click', playAll, { once: true });

    /* ── Gyroscope ── */
    let gyroX = 0, gyroY = 0, curX = 0, curY = 0;

    const onOrientation = (e) => {
      gyroX = THREE.MathUtils.degToRad(((e.beta  ?? 0) - 90) * 0.15);
      gyroY = THREE.MathUtils.degToRad( (e.gamma ?? 0)       * 0.15);
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
    const animate = () => {
      raf = requestAnimationFrame(animate);

      curX += (gyroX - curX) * 0.12;
      curY += (gyroY - curY) * 0.12;

      // BG bergerak lambat, FG bergerak lebih cepat → depth effect
      bgMesh.position.x =  curY * 0.04;
      bgMesh.position.y = -curX * 0.04;
      fgMesh.position.x =  curY * 0.12;
      fgMesh.position.y = -curX * 0.12;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.domElement.remove();
      window.removeEventListener('deviceorientation', onOrientation);
      container.removeEventListener('click', onTap);
      videosRef.current.forEach(v => { v.pause(); v.src = ''; v.remove(); });
      videosRef.current = [];
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} />

      {/* Mute button */}
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

      {/* Back button */}
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
    </div>
  );
}