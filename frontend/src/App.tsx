import React from 'react';
import { Scene } from './components/scene/Scene';
import { ThemeProvider } from './themes';

function App() {
  return (
    <ThemeProvider>
      <main className="w-screen h-screen overflow-hidden relative">
        <Scene />
      </main>
    </ThemeProvider>
  );
}

export default App;

