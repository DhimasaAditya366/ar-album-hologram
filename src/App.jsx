import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ARScene from './components/ARScene';

export default function App() {
  const [selection, setSelection] = useState(null);

  if (!selection) {
    return <Dashboard onSelect={setSelection} />;
  }

  const videoSrc = import.meta.env.BASE_URL + 'assets/' + encodeURIComponent(selection.videoFile);

  return (
    <ARScene
      videoSrc={videoSrc}
      fullscreen={selection.fullscreen}
      onBack={() => setSelection(null)}
    />
  );
}