const AR_ITEMS = [
  {
    id: 'dummy',
    title: 'AR Sample Video Cover Music',
    desc: 'Hologram demo dengan video contoh',
    videoFile: 'greeting.mp4',
    icon: '🎬',
  },
  {
    id: 'fullscreen',
    title: 'AR Fullscreen Video Cover Music',
    desc: 'Hologram fullscreen dengan video contoh',
    videoFile: 'greeting.mp4',
    icon: '▶',
  },
];

export default function Dashboard({ onSelect }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(160deg, #0e0a00 0%, #1a1200 50%, #0e0a00 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px 20px',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          fontSize: 12, letterSpacing: '0.35em', textTransform: 'uppercase',
          color: '#c9a84c', marginBottom: 10,
        }}>
          MetaPacmas
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700,
          background: 'linear-gradient(180deg, #f5d77e 0%, #c9a84c 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '0.06em', lineHeight: 1.2, margin: 0,
        }}>
          AR Cover Album
        </h1>
        <div style={{
          width: 60, height: 1,
          background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          margin: '12px auto 0',
        }} />
        <p style={{ color: 'rgba(197,168,76,0.5)', fontSize: 12, marginTop: 10 }}>
          Pilih pengalaman AR yang ingin kamu coba
        </p>
      </div>

      {/* Cards */}
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {AR_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item.videoFile)}
            style={{
              width: '100%', textAlign: 'left',
              background: 'rgba(197,168,76,0.05)',
              border: '1px solid rgba(197,168,76,0.35)',
              borderRadius: 14, padding: '18px 20px',
              cursor: 'pointer', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 16,
            }}
            onPointerDown={e => {
              e.currentTarget.style.background = 'rgba(197,168,76,0.15)';
              e.currentTarget.style.borderColor = 'rgba(197,168,76,0.7)';
            }}
            onPointerUp={e => {
              e.currentTarget.style.background = 'rgba(197,168,76,0.05)';
              e.currentTarget.style.borderColor = 'rgba(197,168,76,0.35)';
            }}
            onPointerLeave={e => {
              e.currentTarget.style.background = 'rgba(197,168,76,0.05)';
              e.currentTarget.style.borderColor = 'rgba(197,168,76,0.35)';
            }}
          >
            {/* Icon */}
            <div style={{
              width: 50, height: 50, borderRadius: 12, flexShrink: 0,
              background: 'rgba(197,168,76,0.1)',
              border: '1px solid rgba(197,168,76,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>
              {item.icon}
            </div>
            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 15, fontWeight: 600, marginBottom: 3,
                color: '#f5d77e',
              }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(197,168,76,0.5)' }}>
                {item.desc}
              </div>
            </div>
            {/* Arrow */}
            <div style={{ color: '#c9a84c', fontSize: 20, flexShrink: 0 }}>›</div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <p style={{
        position: 'absolute', bottom: 24,
        color: 'rgba(197,168,76,0.25)', fontSize: 11,
        letterSpacing: '0.1em',
      }}>
        Arahkan kamera ke cover album setelah memilih
      </p>
    </div>
  );
}