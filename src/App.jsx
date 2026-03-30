import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ARScene from './components/ARScene';

export default function App() {
  const [videoFile, setVideoFile] = useState(null);

  if (!videoFile) {
    return <Dashboard onSelect={setVideoFile} />;
  }

  const videoSrc = import.meta.env.BASE_URL + 'assets/' + videoFile;

  return (
    <ARScene
      videoSrc={videoSrc}
      onBack={() => setVideoFile(null)}
    />
  );
}
