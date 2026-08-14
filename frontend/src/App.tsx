import React from 'react';
import { Scene } from './components/scene/Scene';
import { PerfHUD } from './components/common/PerfHUD';

function App() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Scene />
      <PerfHUD />
    </main>
  );
}

export default App;
