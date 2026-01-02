import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, remove, onChildAdded, limitToFirst, query, get } from "firebase/database";
import { Peer } from "peerjs";
import { Phone, PhoneOff, User, Send, ShieldAlert, Mic, MicOff } from 'lucide-react';

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
  
  // 新機能用ステート
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);

  const peerRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const currentCallRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    const p = new Peer({
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
    });
    p.on('open', id => setMyId(id));
    p.on('call', async (call) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupLocalVolumeMeter(stream);
      call.answer(stream);
      handleStream(call, call.metadata);
    });
    peerRef.current = p;
    const saved = localStorage.getItem('koemachi_user');
    if (saved) { setMyProfile(JSON.parse(saved)); setScreen('main'); }
    return () => audioContextRef.current?.close();
  }, []);

  // 音量インジケーターの設定
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
      setVolume(average); // 0〜255程度の数値
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
    setIsMatching(true);
    setMyProfile(prev => ({ ...prev, tag }));
    const snapshot = await get(query(ref(db, `waiting/${tag}`), limitToFirst(1)));

    if (snapshot.exists()) {
      const opponentId = Object.keys(snapshot.val())[0];
      if (opponentId === myId) return;
      await remove(ref(db, `waiting/${tag}/${opponentId}`));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setupLocalVolumeMeter(stream);
      const call = peerRef.current.call(opponentId, stream, { metadata: { ...myProfile, peerId: myId } });
      handleStream(call, snapshot.val()[opponentId]);
    } else {
      await set(ref(db, `waiting/${tag}/${myId}`), { ...myProfile, peerId: myId });
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
    push(ref(db, `chats/${[myId, currentCallRef.current.peer].sort().join('_')}`), { name: myProfile.name, text: inputText });
    setInputText('');
  };

  if (isMatching && screen !== 'call') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-blue-600 text-white p-6 text-center font-sans">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-white mb-6"></div>
        <h2 className="text-2xl font-bold mb-2">#{myProfile.tag} で探し中...</h2>
        <p className="opacity-80">相手が見つかると自動で通話が始まります</p>
        <button onClick={() => window.location.reload()} className="mt-8 text-sm underline opacity-50">キャンセル</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white font-sans text-slate-900 shadow-2xl relative">
      {screen === 'profile' && (
        <div className="p-8 pt-20 space-y-6">
          <h1 className="text-4xl font-black text-blue-600 text-center">コエマチ</h1>
          <div className="space-y-4 pt-6">
            <input className="w-full border-2 border-slate-100 p-4 rounded-2xl outline-none focus:border-blue-500 transition" placeholder="ニックネーム" value={myProfile.name} onChange={e => setMyProfile({...myProfile, name: e.target.value})} />
            <button className="w-full bg-blue-600 text-white p-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-700 transition" onClick={() => { if(!myProfile.name) return; localStorage.setItem('koemachi_user', JSON.stringify(myProfile)); setScreen('main'); }}>はじめる</button>
          </div>
        </div>
      )}

      {screen === 'main' && (
        <div className="p-6 pt-10">
          <header className="flex justify-between items-center mb-10 text-blue-600">
            <h2 className="text-2xl font-bold italic">KoeMachi</h2>
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-2 bg-slate-100 rounded-full"><User size={20}/></button>
          </header>
          <div className="grid grid-cols-2 gap-4">
            {['雑談', '悩み相談', '恋バナ', '寝落ち'].map(tag => (
              <button key={tag} className="bg-white border-2 border-blue-50 p-8 rounded-3xl hover:border-blue-400 transition shadow-sm text-center font-bold text-lg" onClick={() => startMatch(tag)}>#{tag}</button>
            ))}
          </div>
        </div>
      )}

      {screen === 'call' && (
        <div className="h-screen bg-slate-900 text-white flex flex-col p-6 overflow-hidden">
          <div className="flex-1 text-center py-6">
            <div className="w-24 h-24 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all" style={{ transform: `scale(${1 + volume / 500})` }}>👤</div>
            <h2 className="text-2xl font-bold">{opponent?.name}</h2>
            
            {/* 音量インジケーター */}
            <div className="mt-4 flex flex-col items-center">
              <span className="text-[10px] text-slate-500 mb-1">YOUR VOICE</span>
              <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 transition-all duration-75" style={{ width: `${Math.min(100, volume * 2)}%` }}></div>
              </div>
            </div>
          </div>

          <div className="h-40 overflow-y-auto bg-slate-800/50 rounded-2xl p-4 mb-4 text-sm border border-slate-700">
            {chat.map((msg, i) => <div key={i} className="mb-1"><span className="text-blue-400 font-bold">{msg.name}:</span> {msg.text}</div>)}
          </div>
          
          <div className="flex gap-2 mb-6">
            <input className="flex-1 bg-slate-800 border border-slate-700 p-3 rounded-xl text-white outline-none focus:border-blue-500" placeholder="メッセージ..." value={inputText} onChange={e => setInputText(e.target.value)} />
            <button className="bg-blue-600 p-3 rounded-xl hover:bg-blue-700 transition" onClick={sendChat}><Send size={18}/></button>
          </div>

          <div className="flex justify-evenly items-center mb-6">
            {/* ミュートボタン */}
            <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center transition ${isMuted ? 'bg-orange-500' : 'bg-slate-700'}`}>
              {isMuted ? <MicOff size={24}/> : <Mic size={24}/>}
            </button>
            {/* 切断ボタン */}
            <button className="bg-red-500 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 transition" onClick={() => window.location.reload()}><PhoneOff size={32}/></button>
            <button onClick={() => alert('通報しました')} className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-500"><ShieldAlert size={24}/></button>
          </div>
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      )}
    </div>
  );
}