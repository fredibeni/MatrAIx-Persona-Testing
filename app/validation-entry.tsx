import { createRoot } from 'react-dom/client';
import { ValidationApp } from './page';
import './globals.css';

const rootElement = document.getElementById('validation-root');

if (!rootElement) {
  throw new Error('The Validation mount point was not found.');
}

const root = createRoot(rootElement);
let generation = 0;

function renderValidation() {
  root.render(<ValidationApp key={generation} hosted />);
}

window.addEventListener('matraix-validation-reload', () => {
  generation += 1;
  renderValidation();
});

renderValidation();
