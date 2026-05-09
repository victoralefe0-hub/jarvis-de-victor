import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, DownloadCloud } from 'lucide-react';

export default function SystemUpdate() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(swUrl, r) {
      console.log('SW Registered:', r);
      // Checar atualizações a cada 1 hora no background
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="absolute top-24 right-4 md:right-8 z-[100] bg-black/90 backdrop-blur-md border border-white/20 p-5 rounded-2xl flex flex-col gap-3 w-72 shadow-2xl">
      <div className="flex items-center gap-2 text-white/90 uppercase tracking-widest text-[10px] font-medium">
        {needRefresh ? <RefreshCw size={14} className="animate-spin text-white/60" /> : <DownloadCloud size={14} className="text-white/60" />}
        <span>Aviso do Mainframe</span>
      </div>
      <div className="text-white/50 text-xs leading-relaxed">
        {needRefresh 
          ? 'Nova atualização de protocolo disponível. Deseja reiniciar os sistemas para aplicar?' 
          : 'Sistemas em cache. J.A.R.V.I.S. está pronto para operação offline.'}
      </div>
      <div className="flex gap-2 mt-3">
        {needRefresh && (
          <button 
            onClick={() => updateServiceWorker(true)}
            className="flex-1 bg-white text-black hover:bg-white/90 border border-white text-[10px] py-2.5 px-3 rounded-full uppercase tracking-widest transition-all duration-300"
          >
            Atualizar
          </button>
        )}
        <button 
          onClick={() => { setOfflineReady(false); setNeedRefresh(false); }}
          className="flex-1 bg-transparent hover:bg-white/5 border border-white/20 text-white/70 text-[10px] py-2.5 px-3 rounded-full uppercase tracking-widest transition-all duration-300"
        >
          Ignorar
        </button>
      </div>
    </div>
  );
}
