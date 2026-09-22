import React, { useEffect } from 'react';
import { Scene } from './components/scene/Scene';
import { ThemeProvider } from './themes';
import { useOrchestratorStore } from './components/orchestrator/useOrchestratorStore';
import { initSounds, setSoundsEnabled } from './sound';

function App() {
  const interfaceSounds = useOrchestratorStore((s) => s.interfaceSounds);

  useEffect(() => {
    initSounds(useOrchestratorStore.getState().interfaceSounds);
  }, []);

  useEffect(() => {
    setSoundsEnabled(interfaceSounds);
  }, [interfaceSounds]);

  return (
    <ThemeProvider>
      <main className="w-screen h-screen overflow-hidden relative">
        <Scene />
      </main>
    </ThemeProvider>
  );
}

export default App;

