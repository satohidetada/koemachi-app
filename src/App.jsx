import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, remove, onChildAdded, limitToFirst, query, get } from "firebase/database";
import { Peer } from "peerjs";
import { Phone, PhoneOff, User, Send, ShieldAlert, Mic, MicOff, Heart, Coffee, Moon, MessageSquare } from 'lucide-react';

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyCBkujRM_ub3EmRSOvzU6d5ayBW40oh1Qk",
  authDomain: "koemachi-app.firebaseapp.com",
  projectId: "koemachi-app",
  databaseURL: "https://koemachi-app-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "koemachi-app.firebasestorage.app",
  messagingSenderId: "811633818338",
  appId: "1:811633818338:web:991519d6cab6212a31fcbb"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function App() {
  const [screen, setScreen] = useState('profile');
  const [myProfile, setMyProfile] = useState({ name: '', gender: '未設定', age: '20代', bio: '', tag: '' });
  const [myId, setMyId] = useState('');
  const [opponent, setOpponent] = useState(null);
  const [chat, setChat] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isMatching, setIsMatching] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);

  const peerRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const currentCallRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    // 既存のテザリング対策設定をすべて維持
    const p = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      }
    });

    p.on('open', id => setMyId(id));

    p.on('call', async (call) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => alert("マイクを許可してね"));
      setupLocalVolumeMeter(stream);
      call.answer(stream);
      handleStream(call, call.metadata);
    });

    peerRef.current = p;
    const saved = localStorage.getItem('koemachi_user');
    if (saved) { setMyProfile(JSON.parse(saved)); setScreen('main'); }
    return () => audioContextRef.current?.close();
  }, []);

  const setupLocalVolumeMeter = (stream) => {
    localStreamRef.current = stream;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateVolume = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let values = 0;
      for (let i = 0; i < bufferLength; i++) { values += dataArray[i]; }
      const average = values / bufferLength;
      const level = Math.max(0, Math.min(100, (average - 10) * 1.5));
      setVolume(level);
      requestAnimationFrame(updateVolume);
    };
    updateVolume();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const startMatch = async (tag) => {
    if (!myId) return alert("接続準備中です。少々お待ちください");
    setIsMatching(true);
    setMyProfile(prev => ({ ...prev, tag }));
    
    const waitingRef = ref(db, `waiting/${tag}`);
    const snapshot = await get(query(waitingRef, limitToFirst(1)));

    if (snapshot.exists()) {
      const waitingList = snapshot.val();
      const opponentId = Object.keys(waitingList)[0];
      const opponentData = waitingList[opponentId];

      if (opponentId === myId) {
        setIsMatching(true);
        return;
      }

      await remove(ref(db, `waiting/${tag}/${opponentId}`));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupLocalVolumeMeter(stream);
      const call = peerRef.current.call(opponentId, stream, { metadata: { ...myProfile, peerId: myId } });
      handleStream(call, opponentData);
    } else {
      await set(ref(db, `waiting/${tag}/${myId}`), { ...myProfile, peerId: myId });
      onValue(ref(db, `waiting/${tag}/${myId}`), (snap) => {
          if (!snap.exists() && isMatching) {
              // マッチング成功（着信を待つ）
          }
      });
    }
  };

  const handleStream = (call, oppData) => {
    currentCallRef.current = call;
    setOpponent(oppData);
    setIsMatching(false);
    setScreen('call');
    call.on('stream', stream => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(e => console.log(e));
      }
    });
    const chatRoomId = [myId, call.peer].sort().join('_');
    onChildAdded(ref(db, `chats/${chatRoomId}`), (data) => setChat(prev => [...prev, data.val()]));
  };

  const sendChat = () => {
    if (!inputText || !currentCallRef.current) return;
    const chatRoomId = [myId, currentCallRef.current.peer].sort().join('_');
    push(ref(db, `chats/${chatRoomId}`), { name: myProfile.name, text: inputText });
    setInputText('');
  };

  // デザイン：マッチング中画面
  if (isMatching && screen !== 'call') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-400 to-pink-300 text-white p-6 text-center overflow-hidden">
        <div className="relative mb-10">
          <div className="absolute inset-0 bg-white/30 rounded-full animate-ping scale-150"></div>
          <div className="relative bg-white p-8 rounded-full shadow-xl">
             <Heart className="text-pink-500 animate-bounce" size={48} fill="currentColor" />
          </div>
        </div>
        <h2 className="text-3xl font-black mb-2 drop-shadow-md">#{myProfile.tag}</h2>
        <p className="font-medium opacity-90 animate-pulse">だれかを探しているよ...</p>
        <button onClick={() => window.location.reload()} className="mt-12 px-8 py-3 bg-white/20 backdrop-blur-md rounded-full text-sm font-bold border border-white/30">キャンセル</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#FDFCFE] font-sans text-slate-800 shadow-2xl overflow-x-hidden">
      {screen === 'profile' && (
        <div className="p-8 pt-20 flex flex-col items-center">
          <div className="bg-gradient-to-tr from-blue-500 to-pink-400 p-4 rounded-[2.5rem] shadow-lg mb-6 rotate-3">
            <MessageSquare size={40} className="text-white" fill="currentColor" />
          </div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-500 mb-2">コエマチ</h1>
          <p className="text-slate-400 text-sm mb-10 font-medium italic">"声"でつながる、あたらしいマチ</p>
          <div className="w-full space-y-4">
            <input className="w-full bg-white border-none shadow-[0_5px_15px_rgba(0,0,0,0.05)] p-5 rounded-[1.5rem] outline-none focus:ring-2 ring-pink-300 transition-all text-lg" placeholder="おなまえ" value={myProfile.name} onChange={e => setMyProfile({...myProfile, name: e.target.value})} />
            <textarea className="w-full bg-white border-none shadow-[0_5px_15px_rgba(0,0,0,0.05)] p-5 rounded-[1.5rem] outline-none h-32 text-sm" placeholder="自己紹介文（趣味など）" value={myProfile.bio} onChange={e => setMyProfile({...myProfile, bio: e.target.value})} />
            <button className="w-full bg-gradient-to-r from-blue-500 to-pink-400 text-white p-5 rounded-[1.5rem] font-black text-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all mt-4" onClick={() => { if(!myProfile.name) return; localStorage.setItem('koemachi_user', JSON.stringify(myProfile)); setScreen('main'); }}>はじめる！</button>
          </div>
        </div>
      )}

      {screen === 'main' && (
        <div className="p-6 pt-10">
          <header className="flex justify-between items-center mb-12">
            <h2 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-pink-500 bg-clip-text text-transparent">KoeMachi</h2>
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-3 bg-white shadow-md rounded-2xl text-pink-400 hover:text-blue-500 transition-colors"><User size={24}/></button>
          </header>
          <p className="text-slate-500 font-bold mb-6 px-2">いまの気分は？</p>
          <div className="grid grid-cols-2 gap-5">
            {[
              {tag: '雑談', color: 'from-blue-400 to-blue-500', icon: <Coffee />},
              {tag: '悩み相談', color: 'from-purple-400 to-purple-500', icon: <ShieldAlert />},
              {tag: '恋バナ', color: 'from-pink-400 to-pink-500', icon: <Heart />},
              {tag: '寝落ち', color: 'from-indigo-500 to-indigo-700', icon: <Moon />}
            ].map(item => (
              <button key={item.tag} className={`bg-gradient-to-br ${item.color} p-6 rounded-[2rem] shadow-lg text-white font-black text-lg flex flex-col items-center gap-3 active:scale-90 transition-all`} onClick={() => startMatch(item.tag)}>
                <span className="bg-white/20 p-2 rounded-full">{item.icon}</span>
                #{item.tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === 'call' && (
        <div className="h-screen bg-[#1A1C2E] text-white flex flex-col p-6 overflow-hidden relative">
          <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-pink-500/20 blur-[100px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-blue-500/20 blur-[100px] rounded-full"></div>

          <div className="flex-1 text-center py-10 z-10">
            <div className="w-28 h-28 bg-gradient-to-tr from-pink-500 to-blue-500 rounded-[2.5rem] mx-auto mb-6 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(236,72,153,0.3)] border-2 border-white/20">👤</div>
            <h2 className="text-3xl font-black mb-2 tracking-tight">{opponent?.name}</h2>
            <p className="text-white/40 text-xs italic mb-8 line-clamp-1 px-10">"{opponent?.bio}"</p>
            
            {/* パラメーター式インジケーター（全機能を維持） */}
            <div className="mt-4 bg-white/5 backdrop-blur-xl p-5 rounded-[2rem] border border-white/10 max-w-[220px] mx-auto">
              <div className="flex justify-between mb-2 px-1">
                <span className="text-[10px] text-white/40 font-black tracking-widest uppercase">Level Meter</span>
                <span className="text-[10px] text-blue-400 font-mono">{isMuted ? "MUTED" : `${Math.floor(volume)}%`}</span>
              </div>
              <div className="w-full h-7 bg-black/40 rounded-xl p-1.5 flex items-center overflow-hidden border border-white/5">
                <div 
                  className={`h-full transition-all duration-75 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.8)] ${volume > 80 ? 'bg-pink-500 shadow-pink-500/50' : 'bg-blue-400'}`}
                  style={{ width: `${isMuted ? 0 : volume}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* チャット機能（維持） */}
          <div className="h-40 overflow-y-auto bg-black/30 backdrop-blur-md rounded-[1.5rem] p-4 mb-4 text-sm border border-white/5 z-10">
            {chat.map((m, i) => <div key={i} className="mb-2"><span className="text-pink-300 font-black mr-2">{m.name}:</span><span className="opacity-90">{m.text}</span></div>)}
          </div>
          
          <div className="flex gap-3 mb-8 z-10">
            <input className="flex-1 bg-white/10 border border-white/10 p-4 rounded-2xl text-white outline-none focus:bg-white/20 transition-all placeholder:text-white/20" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="メッセージ..." />
            <button className="bg-pink-500 p-4 rounded-2xl shadow-lg shadow-pink-500/20 active:scale-90 transition-all" onClick={sendChat}><Send size={20}/></button>
          </div>

          {/* 通話操作（ミュート・切断・通報機能を維持） */}
          <div className="flex justify-between items-center px-4 mb-6 z-10">
            <button onClick={toggleMute} className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 shadow-red-500/40' : 'bg-white/10 hover:bg-white/20'} shadow-lg`}>
              {isMuted ? <MicOff size={28}/> : <Mic size={28}/>}
            </button>
            <button className="bg-gradient-to-br from-pink-500 to-red-600 w-24 h-24 rounded-[2.5rem] flex items-center justify-center shadow-[0_15px_30px_rgba(236,72,153,0.4)] active:scale-90 transition-all" onClick={() => window.location.reload()}><PhoneOff size={40}/></button>
            <button onClick={() => alert('通報しました')} className="w-16 h-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-white/20 active:text-red-400 transition-colors"><ShieldAlert size={28}/></button>
          </div>
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      )}
    </div>
  );
}