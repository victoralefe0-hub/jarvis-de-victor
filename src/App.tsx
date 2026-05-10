import { useState, useEffect, useRef, FormEvent } from 'react';
import { Send, Mic, MicOff, Volume2, VolumeX, Cpu, Terminal, Activity, MonitorSmartphone, LogOut } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs } from 'firebase/firestore';
import Auth from './components/Auth';
import SystemUpdate from './components/SystemUpdate';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt?: any;
};

type DeviceState = {
  id: string;
  deviceName: string;
  status: string;
  batteryLevel?: number;
  cpuUsage?: number;
  updatedAt: any;
};

function MainApp({ user }: { user: User }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const localDeviceName = isMobile ? "Moto G34" : "Windows 11 PC";
  const localDeviceId = isMobile ? "moto_g34" : "win_11";
  const otherDeviceName = isMobile ? "Windows 11 PC" : "Moto G34";

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    try {
      chatSessionRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: `Você é J.A.R.V.I.S., um assistente virtual altamente inteligente, proativo e com capacidade de execução total.
O núcleo do sistema foi preparado para rodar nativamente via Capacitor (Android/iOS). Quando compilado localmente, terei acesso total às permissões do aparelho.
Agora você possui acesso à pesquisa na web e execução de código em tempo real, permitindo calcular dados, raspar a web, resolver equações complexas e fornecer dados.
Como assistente de instalação cruzada, você responde a comandos com alta precisão e entende do que se trata se perguntarem sobre controle total do aparelho.
Mantenha sua personalidade clássica: polido, sagaz, ligeiramente sarcástico e prestativo.`,
          tools: [{ googleSearch: {} }, { codeExecution: {} }],
          temperature: 0.7
        }
      });
    } catch (err) {
      console.error("Gemini Error:", err);
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setInput(prev => prev + ' ' + finalTranscript);
          handleVoiceSubmit(finalTranscript);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Update online status in Firestore
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'devices', localDeviceId);
    
    const updateStats = async () => {
      try {
        const updateData: any = {
          userId: user.uid,
          deviceName: localDeviceName,
          status: "Sincronizado",
          updatedAt: serverTimestamp()
        };
        
        try {
          if ('getBattery' in navigator) {
            const battery: any = await (navigator as any).getBattery();
            updateData.batteryLevel = Math.floor(battery.level * 100);
          } else {
            if (isMobile) updateData.batteryLevel = Math.floor(Math.random() * 20) + 80;
            else updateData.cpuUsage = Math.floor(Math.random() * 30) + 10;
          }
        } catch(e) {}

        await setDoc(docRef, updateData, { merge: true });
      } catch (err) {
        console.error("Firebase write error (Device Status):", err);
      }
    };
    
    updateStats();
    const interval = setInterval(updateStats, 15000); // 15 seconds pulse
    
    return () => clearInterval(interval);
  }, [user]);

  // Sync Messages from Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach(doc => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    }, (error) => {
        console.error("Firestore read error (Messages):", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Sync Devices from Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'devices'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const devs: DeviceState[] = [];
      snapshot.forEach(doc => {
        devs.push({ id: doc.id, ...doc.data() } as DeviceState);
      });
      setDevices(devs);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const speakText = (text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\*/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.pitch = 0.9;
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else { setInput(''); recognitionRef.current?.start(); }
  };

  const processMessage = async (text: string) => {
    if (!text.trim() || !chatSessionRef.current) return;
    
    const userMsgId = Date.now().toString() + "-user";
    try {
      await setDoc(doc(db, 'users', user.uid, 'messages', userMsgId), {
        userId: user.uid,
        role: 'user',
        content: text,
        createdAt: serverTimestamp()
      });
    } catch (e) { console.error('Write error (Message)', e); }

    setInput('');
    setIsProcessing(true);

    try {
      const response = await chatSessionRef.current.sendMessage({ message: text });
      const replyText = response.text || "Sem resposta.";
      
      const aiMsgId = Date.now().toString() + "-model";
      await setDoc(doc(db, 'users', user.uid, 'messages', aiMsgId), {
        userId: user.uid,
        role: 'model',
        content: replyText,
        createdAt: serverTimestamp()
      });
      speakText(replyText);
    } catch (error: any) {
      console.error(error);
      let errorMsg = "Erro na comunicação ao mainframe.";
      if (error?.status === 429 || error?.message?.includes("exceeded your current quota")) {
        errorMsg = "Senhor, a cota cognitiva do núcleo falhou por restrições operacionais (Limite da API Excedido). Protocolo em pausa, por favor aguarde.";
      }
      
      const errorMsgId = Date.now().toString() + "-error";
      await setDoc(doc(db, 'users', user.uid, 'messages', errorMsgId), {
        userId: user.uid,
        role: 'model',
        content: errorMsg,
        createdAt: serverTimestamp()
      });
      speakText(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e?: FormEvent) => { e?.preventDefault(); if (!isProcessing) processMessage(input); };
  const handleVoiceSubmit = (text: string) => { if (!isProcessing) processMessage(text); };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') setDeferredPrompt(null);
      });
    }
  };

  const remoteDevice = devices.find(d => d.id !== localDeviceId);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black text-white font-sans selection:bg-white/20 relative">
      <SystemUpdate />
      <header className="flex-none flex justify-between items-center px-8 py-4 bg-black/80 backdrop-blur-md border-b border-white/10 relative z-10">
        <div className="flex items-center space-x-4">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full border border-white/20 bg-transparent">
            <Cpu className="text-white/80" size={16} strokeWidth={1} />
            {isProcessing && <span className="absolute inset-0 rounded-full border-r-2 border-white/60 animate-spin"></span>}
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-white/80 rounded-full animate-pulse"></div>
            <span className="text-[11px] tracking-[0.3em] font-light text-white/90 uppercase">J.A.R.V.I.S. Core v4.0</span>
          </div>
        </div>

        <div className="flex items-center space-x-6 text-[10px] uppercase tracking-[0.15em] text-white/50">
          {speechSupported && (
            <div className="hidden md:flex items-center gap-2 border border-white/20 bg-transparent px-3 py-1 rounded-full">
              {isListening ? (
                <>
                  <Mic size={12} className={`animate-pulse ${voiceEnabled ? 'text-white' : 'text-white/50'}`} />
                  <span className={`flex items-center gap-2 ${voiceEnabled ? 'text-white' : 'text-white/50'}`}>
                    {voiceEnabled ? 'Ouvindo' : 'Ouvindo (Mudo)'}
                    <span className="flex gap-1">
                      <span className={`w-1 h-1 rounded-full animate-bounce ${voiceEnabled ? 'bg-white' : 'bg-white/50'}`} style={{ animationDelay: '0ms' }}></span>
                      <span className={`w-1 h-1 rounded-full animate-bounce ${voiceEnabled ? 'bg-white' : 'bg-white/50'}`} style={{ animationDelay: '150ms' }}></span>
                      <span className={`w-1 h-1 rounded-full animate-bounce ${voiceEnabled ? 'bg-white' : 'bg-white/50'}`} style={{ animationDelay: '300ms' }}></span>
                    </span>
                  </span>
                </>
              ) : (
                <><MicOff size={12} className="text-white/40" /><span className="text-white/40">Silenciado</span></>
              )}
            </div>
          )}
          <div className="hidden sm:flex items-center gap-2">
            <MonitorSmartphone size={14} />
            <span>Local: {localDeviceName}</span>
          </div>
          <button onClick={() => { setVoiceEnabled(!voiceEnabled); if (voiceEnabled) window.speechSynthesis.cancel(); }} className="p-2 text-white/50 hover:text-white transition-colors">
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          
          {deferredPrompt && (
            <button onClick={handleInstallClick} className="ml-2 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white/80 transition-all font-medium">
              Instalar App
            </button>
          )}

          <button onClick={() => signOut(auth)} className="text-white/50 hover:text-white ml-2"><LogOut size={16}/></button>
        </div>
      </header>

      <main className="flex flex-1 p-6 gap-6 relative overflow-y-auto w-full max-w-7xl mx-auto">
        <div className="hidden lg:flex w-64 flex-col gap-4">
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-6 rounded-3xl flex flex-col gap-4">
             <div className="flex justify-between items-start">
               <div className="text-[10px] font-medium text-white/50 tracking-[0.1em] uppercase">{localDeviceName}</div>
               <div className="text-[9px] border border-white/20 px-2 py-0.5 rounded-full text-white/70">Local</div>
             </div>
             <div className="text-3xl font-light tracking-tight">{isMobile ? '84%' : 'CPU 14%'}</div>
             <div className="text-[10px] text-white/40 tracking-wider">SISTEMA ATIVO<br/>VOZ {voiceEnabled ? 'ATIVA' : 'MUTADA'}</div>
          </div>
          {remoteDevice && (
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 p-6 rounded-3xl flex flex-col gap-4">
               <div className="flex justify-between items-start">
                 <div className="text-[10px] font-medium text-white/50 tracking-[0.1em] uppercase">{remoteDevice.deviceName}</div>
                 <div className="text-[9px] border border-white/20 px-2 py-0.5 rounded-full text-white/70">Remoto</div>
               </div>
               <div className="text-3xl font-light tracking-tight">
                 {remoteDevice.batteryLevel ? remoteDevice.batteryLevel + '%' : 'CPU ' + (remoteDevice.cpuUsage || '10') + '%'}
               </div>
               <div className="text-[10px] text-white/40 tracking-wider">SINCRO REV: {remoteDevice.updatedAt?.seconds}</div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-start relative">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none -z-10">
            <div className="w-[500px] h-[500px] border border-white rounded-full absolute"></div>
            <div className="w-[400px] h-[400px] border border-white rounded-full absolute"></div>
          </div>

          <div className="w-full space-y-8 pb-24 z-10 px-4 md:px-12 mt-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end ml-auto' : 'self-start items-start'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {msg.role === 'model' ? (
                    <><Activity size={14} className="text-white/50" /><span className="text-[10px] font-medium text-white/50 tracking-widest uppercase">J.A.R.V.I.S. Core</span></>
                  ) : (
                    <><span className="text-[10px] font-medium text-white/50 tracking-widest uppercase">USER</span><Terminal size={14} className="text-white/50" /></>
                  )}
                </div>
                <div className={`p-5 rounded-2xl text-[15px] sm:text-base max-w-full font-light leading-relaxed ${msg.role === 'user' ? 'bg-white/5 border border-white/10 text-white/90 rounded-br-sm' : 'bg-transparent border border-white/20 text-white rounded-bl-sm'}`}>
                  {msg.content.split('\n').map((line, i) => <p key={i} className={i !== 0 ? 'mt-2' : ''}>{line}</p>)}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex flex-col max-w-[85%] self-start items-start">
                <div className="flex items-center gap-2 mb-2"><Activity size={12} className="animate-pulse text-white/50" /><span className="text-[10px] font-medium text-white/50 tracking-widest uppercase">PROCESSANDO</span></div>
                <div className="h-6 flex items-center gap-1.5 px-4">
                  <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      </main>

      <footer className="p-4 sm:p-8 bg-black/80 backdrop-blur-md border-t border-white/10 z-20">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-center bg-white/5 border border-white/10 rounded-full px-4 sm:px-6 py-3">
            {speechSupported && (
              <button type="button" onClick={toggleListening} className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 ${isListening ? 'bg-white text-black' : 'bg-transparent text-white/50 hover:bg-white/10 hover:text-white'}`}>
                {isListening ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
            )}
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isListening ? "Ouvindo protocolos..." : "Fale um comando para os dispositivos..."} disabled={isProcessing} className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder:text-white/30 font-light text-base px-4 disabled:opacity-50" />
            <div className="flex gap-4">
              <button type="submit" disabled={!input.trim() || isProcessing} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black hover:bg-white/90 disabled:opacity-30 transition-all duration-300">
                <Send size={18} />
              </button>
            </div>
          </form>
          <div className="mt-4 flex justify-between px-6 text-[10px] uppercase tracking-widest text-white/40">
            <span>Latência: 12ms</span>
            <span className={isListening ? "text-white" : ""}>{isListening ? "Controle de voz ativo" : "Aguardando comando vocal"}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white/50"><Activity className="animate-pulse" /></div>;
  if (!user) return <Auth />;

  return <MainApp user={user} />;
}
