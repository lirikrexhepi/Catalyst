import React from 'react';
import { Scene } from './components/scene/Scene';
import { TitleBar } from './components/common/TitleBar';

function App() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Scene />
      <TitleBar />
    </main>
  );
}

export default App;
