import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ARScene from './components/ARScene';
import ParallaxScene from './components/ParallaxScene';

export default function App() {
  const [selection, setSelection] = useState(null);

  if (!selection) {
    return <Dashboard onSelect={setSelection} />;
  }

  if (selection.mode === 'parallax') {
    return <ParallaxScene onBack={() => setSelection(null)} />;
  }

  const videoSrc = import.meta.env.BASE_URL + 'assets/' + encodeURIComponent(selection.videoFile);
  return (
    <ARScene
      videoSrc={videoSrc}
      onBack={() => setSelection(null)}
    />
  );
}