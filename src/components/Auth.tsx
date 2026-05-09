import { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { Cpu } from 'lucide-react';

export default function Auth() {
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white font-sans">
      <div className="w-32 h-32 mb-8 rounded-full border border-white/20 bg-transparent flex items-center justify-center p-8">
        <Cpu className="text-white/60 w-full h-full" strokeWidth={1} />
      </div>
      <h1 className="text-xl md:text-2xl font-light tracking-[0.4em] text-white/90 uppercase mb-12">J.A.R.V.I.S. Core</h1>
      <button 
        onClick={login}
        className="px-8 py-3 border border-white/30 rounded-full text-white/70 uppercase tracking-widest text-[11px] hover:bg-white hover:text-black transition-all duration-500"
      >
        Autenticar Sistema
      </button>
      {error && <p className="mt-6 text-white/50 text-xs">{error}</p>}
    </div>
  );
}

