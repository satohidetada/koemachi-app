import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, remove, onChildAdded, limitToFirst, query, get } from "firebase/database";
import { Peer } from "peerjs";
import { Phone, PhoneOff, User, MessageCircle, AlertTriangle, Send } from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyCBkujRM_ub3EmRSOvzU6d5ayBW40oh1Qk",
  authDomain: "koemachi-app.firebaseapp.com",
  projectId: "koemachi-app",
  databaseURL: "https://koemachi-app-default-rtdb.firebaseio.com",
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
  const peerRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const currentCallRef = useRef(null);

  useEffect(() => {
    const p = new Peer();
    p.on('open', id => setMyId(id));
    p.on('call', async (call) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      call.answer(stream);
      handleStream(call, call.metadata);
    });
    peerRef.current = p;
    const saved = localStorage.getItem('koemachi_user');
    if (saved) { setMyProfile(JSON.parse(saved)); setScreen('main'); }
  }, []);

  const saveProfile = () => {
    if (!myProfile.name) return alert("名前を入力してください");
    localStorage.setItem('koemachi_user', JSON.stringify(myProfile));
    setScreen('main');
  };

  const startMatch = async (tag) => {
    setMyProfile(prev => ({ ...prev, tag }));
    const waitingRef = ref(db, `waiting/${tag}`);
    const q = query(waitingRef, limitToFirst(1));
    const snapshot = await get(q);
    if (snapshot.exists()) {
      const opponentId = Object.keys(snapshot.val())[0];
      const opponentData = snapshot.val()[opponentId];
      await remove(ref(db, `waiting/${tag}/${opponentId}`));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const call = peerRef.current.call(opponentId, stream, { metadata: myProfile });
      handleStream(call, opponentData);
    } else {
      set(ref(db, `waiting/${tag}/${myId}`), { ...myProfile, peerId: myId });
      alert(`${tag}で待機中... 相手を待っています。そのままお待ちください。`);
    }
  };

  const handleStream = (call, oppData) => {
    currentCallRef.current = call;
    setOpponent(oppData);
    setScreen('call');
    call.on('stream', stream => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
    });
    const chatRoomId = [myId, call.peer].sort().join('_');
    onChildAdded(ref(db, `chats/${chatRoomId}`), (data) => {
      setChat(prev => [...prev, data.val()]);
    });
  };

  const sendChat = () => {
    if (!inputText) return;
    const chatRoomId = [myId, currentCallRef.current.peer].sort().join('_');
    push(ref(db, `chats/${chatRoomId}`), { name: myProfile.name, text: inputText });
    setInputText('');
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 font-sans shadow-xl text-slate-900">
      {screen === 'profile' && (
        <div className="p-8 space-y-4">
          <h1 className="text-3xl font-black text-blue-600 text-center">コエマチ</h1>
          <input className="w-full border p-3 rounded-xl" placeholder="ニックネーム" onChange={e => setMyProfile({...myProfile, name: e.target.value})} />
          <select className="w-full border p-3 rounded-xl" onChange={e => setMyProfile({...myProfile, gender: e.target.value})}>
            <option>未設定</option><option>男性</option><option>女性</option>
          </select>
          <textarea className="w-full border p-3 rounded-xl" placeholder="自己紹介" onChange={e => setMyProfile({...myProfile, bio: e.target.value})} />
          <button className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold" onClick={saveProfile}>はじめる</button>
        </div>
      )}
      {screen === 'main' && (
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold mb-6">今の気分でマッチング</h2>
          <div className="grid grid-cols-2 gap-4">
            {['雑談', '悩み相談', '恋バナ', '寝落ち'].map(tag => (
              <button key={tag} className="bg-white border-2 border-blue-100 p-6 rounded-2xl hover:border-blue-500 transition shadow-sm" onClick={() => startMatch(tag)}>#{tag}</button>
            ))}
          </div>
        </div>
      )}
      {screen === 'call' && (
        <div className="h-screen bg-slate-900 text-white flex flex-col p-6">
          <div className="flex-1 text-center py-10">
            <div className="w-24 h-24 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl">👤</div>
            <h2 className="text-2xl font-bold">{opponent?.name}</h2>
            <p className="text-slate-400">{opponent?.age} / {opponent?.gender}</p>
          </div>
          <div className="h-40 overflow-y-auto bg-slate-800 rounded-xl p-4 mb-4 space-y-2">
            {chat.map((msg, i) => <div key={i} className="text-sm"><span className="text-blue-400 font-bold">{msg.name}:</span> {msg.text}</div>)}
          </div>
          <div className="flex gap-2 mb-6 text-slate-900">
            <input className="flex-1 bg-slate-700 p-3 rounded-xl text-white outline-none" value={inputText} onChange={e => setInputText(e.target.value)} />
            <button className="bg-blue-600 p-3 rounded-xl text-white" onClick={sendChat}><Send size={20}/></button>
          </div>
          <button className="bg-red-500 w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-8" onClick={() => window.location.reload()}><PhoneOff /></button>
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      )}
    </div>
  );
}
