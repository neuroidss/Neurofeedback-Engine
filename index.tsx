import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import * as THREE from 'three';
import * as R3F from '@react-three/fiber';
import * as Drei from '@react-three/drei';

// --- VIBECODER RUNTIME INJECTION ---
// We expose these libraries globally so that dynamically generated code 
// (the "Vibecodes") can use advanced 3D features without a build step.
(window as any).THREE = THREE;
(window as any).ReactThreeFiber = R3F;
(window as any).ReactThreeDrei = Drei;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);