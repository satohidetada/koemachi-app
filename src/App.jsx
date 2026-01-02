import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, remove, onChildAdded, limitToFirst, query, get } from "firebase/database";
import { Peer } from "peerjs";
import { Phone, PhoneOff, User, Send, ShieldAlert } from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyCBkujRM_ub3EmRSOvzU6d5ayBW40oh1Qk",
  authDomain: "koemachi-app.firebaseapp.com",
  projectId: "koemachi-app",
  databaseURL: "https://koemachi-app-default-rtdb.europe-west1.firebasedatabase.app/",
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
    setIsMatching(true);
    setMyProfile(prev => ({ ...prev, tag }));
    
    const waitingRef = ref(db, `waiting/${tag}`);
    const q = query(waitingRef, limitToFirst(1));
    const snapshot = await get(q);

    if (snapshot.exists()) {
      const waitingList = snapshot.val();
      const opponentId = Object.keys(waitingList)[0];
      const opponentData = waitingList[opponentId];

      if (opponentId === myId) return;

      await remove(ref(db, `waiting/${tag}/${opponentId}`));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const call = peerRef.current.call(opponentId, stream, { metadata: myProfile });
      handleStream(call, opponentData);
    } else {
      await set(ref(db, `waiting/${tag}/${myId}`), { ...myProfile, peerId: myId });
      const myWaitingStatusRef = ref(db, `waiting/${tag}/${myId}`);
      onValue(myWaitingStatusRef, (snap) => {
          if (!snap.exists() && isMatching) {
              console.log("Matched!");
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
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
    });

    const chatRoomId = [myId, call.peer].sort().join('_');
    const chatRef = ref(db, `chats/${chatRoomId}`);
    onChildAdded(chatRef, (data) => {
      setChat(prev => [...prev, data.val()]);
    });
  };

  const sendChat = () => {
    if (!inputText || !currentCallRef.current) return;
    const chatRoomId = [myId, currentCallRef.current.peer].sort().join('_');
    push(ref(db, `chats/${chatRoomId}`), { name: myProfile.name, text: inputText });
    setInputText('');
  };

  if (isMatching && screen !== 'call') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-blue-600 text-white p-6 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-white mb-6"></div>
        <h2 className="text-2xl font-bold mb-2">#{myProfile.tag} で探し中...</h2>
        <p className="opacity-80">相手が見つかると自動で通話が始まります</p>
        <button onClick={() => window.location.reload()} className="mt-8 text-sm underline opacity-50">キャンセル</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white font-sans text-slate-900 shadow-2xl">
      {screen === 'profile' && (
        <div className="p-8 pt-20 space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-black text-blue-600">コエマチ</h1>
            <p className="text-slate-400 mt-2 text-sm">ひまつぶし通話アプリ</p>
          </div>
          <div className="space-y-4 pt-6">
            <input className="w-full border-2 border-slate-100 p-4 rounded-2xl outline-none" placeholder="ニックネーム" value={myProfile.name} onChange={e => setMyProfile({...myProfile, name: e.target.value})} />
            <select className="w-full border-2 border-slate-100 p-4 rounded-2xl" value={myProfile.gender} onChange={e => setMyProfile({...myProfile, gender: e.target.value})}>
              <option>未設定</option><option>男性</option><option>女性</option><option>その他</option>
            </select>
            <textarea className="w-full border-2 border-slate-100 p-4 rounded-2xl h-32 outline-none" placeholder="自己紹介文（趣味など）" value={myProfile.bio} onChange={e => setMyProfile({...myProfile, bio: e.target.value})} />
            <button className="w-full bg-blue-600 text-white p-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-700 transition" onClick={saveProfile}>はじめる</button>
          </div>
        </div>
      )}

      {screen === 'main' && (
        <div className="p-6">
          <header className="flex justify-between items-center mb-10">
            <h2 className="text-2xl font-bold italic text-blue-600">KoeMachi</h2>
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-xs text-slate-400">ログアウト</button>
          </header>
          <div className="grid grid-cols-2 gap-4">
            {['雑談', '悩み相談', '恋バナ', '寝落ち'].map(tag => (
              <button key={tag} className="bg-white border-2 border-blue-50 p-8 rounded-3xl hover:border-blue-400 hover:bg-blue-100 transition shadow-sm text-center font-bold text-lg" onClick={() => startMatch(tag)}>#{tag}</button>
            ))}
          </div>
        </div>
      )}

      {screen === 'call' && (
        <div className="h-screen bg-slate-900 text-white flex flex-col p-6">
          <div className="flex-1 text-center py-10">
            <div className="w-24 h-24 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl shadow-glow">👤</div>
            <h2 className="text-2xl font-bold">{opponent?.name}</h2>
            <p className="text-slate-400">{opponent?.gender} / {opponent?.age}</p>
            <p className="mt-4 text-sm px-6 italic text-slate-300">"{opponent?.bio}"</p>
          </div>
          <div className="h-48 overflow-y-auto bg-slate-800/50 rounded-2xl p-4 mb-4 space-y-2 border border-slate-700">
            {chat.map((msg, i) => <div key={i} className="text-sm border-b border-slate-700/50 pb-1"><span className="text-blue-400 font-bold">{msg.name}:</span> {msg.text}</div>)}
          </div>
          <div className="flex gap-2 mb-8">
            <input className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-2xl text-white outline-none" placeholder="メッセージ..." value={inputText} onChange={e => setInputText(e.target.value)} />
            <button className="bg-blue-600 p-4 rounded-2xl" onClick={sendChat}><Send size={20}/></button>
          </div>
          <div className="flex justify-center mb-4">
            <button className="bg-red-500 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 transition" onClick={() => window.location.reload()}><PhoneOff size={32}/></button>
          </div>
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      )}
    </div>
  );
}