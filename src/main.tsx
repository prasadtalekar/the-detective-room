import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-slate-100">
      <div className="mx-auto max-w-3xl border border-amber-200/20 p-10">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-200">Investigation headquarters</p>
        <h1 className="mt-6 font-serif text-5xl">The Detective Room</h1>
        <p className="mt-6 leading-7 text-slate-300">
          Development foundation prepared. Gameplay implementation is pending the approved game design.
        </p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
