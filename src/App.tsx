/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Plus, 
  Trash2, 
  Volume2, 
  Calendar, 
  User, 
  BookOpen, 
  Play, 
  Pause,
  Settings,
  Bell,
  CheckCircle2,
  AlertCircle,
  School,
  Music,
  Edit2,
  X,
  LogIn,
  LogOut,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { generateBellAnnouncement } from './services/geminiService';
import { ScheduleItem, DAYS } from './types';

// Jingle URL (using a simple "teng ting tong" chime sound)
const JINGLE_URL = "https://cdn.pixabay.com/audio/2022/03/10/audio_c330d6679e.mp3";
const SCHOOL_LOGO = "https://iili.io/K8vEZHG.png";

const JINGLES = [
  { id: 'chime1', name: 'Teng Ting Tong (Classic)', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { id: 'chime2', name: 'Ding Dong (Simple)', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3' },
  { id: 'bell1', name: 'Traditional School Bell', url: 'https://assets.mixkit.co/active_storage/sfx/1086/1086-preview.mp3' },
  { id: 'melody1', name: 'Soft Notification', url: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' },
  { id: 'chime3', name: 'Elegant Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3' },
  { id: 'melody2', name: 'Fun Melody', url: 'https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3' },
  { id: 'alert1', name: 'Digital Alert', url: 'https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3' },
  { id: 'bell2', name: 'Calm Bell', url: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3' },
];

export default function App() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLive, setIsLive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginForm, setLoginForm] = useState({ user: '', password: '' });
  const [selectedJingle, setSelectedJingle] = useState(JINGLES[0]);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [lastPlayedKey, setLastPlayedKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jingleRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const testJingle = () => {
    if (jingleRef.current) {
      jingleRef.current.currentTime = 0;
      jingleRef.current.play().catch(e => {
        console.error("Test jingle failed", e);
        setStatus({ type: 'error', message: "Gagal memutar musik. Pastikan browser mengizinkan audio." });
      });
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.user === 'admin' && loginForm.password === 'admin123') {
      setIsAdmin(true);
      setShowLoginModal(false);
      setLoginForm({ user: '', password: '' });
      setStatus({ type: 'success', message: 'Login Admin Berhasil' });
    } else {
      setStatus({ type: 'error', message: 'User atau Password Salah' });
    }
    setTimeout(() => setStatus(null), 3000);
  };

  const downloadTemplate = () => {
    const data = [
      ['Hari', 'Waktu (HH:mm)', 'Jam Ke', 'Panggilan (Bapak/Ibu)', 'Nama Guru', 'Mata Pelajaran', 'Kelas'],
      ['Senin', '07:00', 1, 'Bapak', 'Budi Santoso', 'Matematika', '10-A'],
      ['Senin', '08:00', 2, 'Ibu', 'Siti Aminah', 'Bahasa Indonesia', '10-A'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Jadwal");
    XLSX.writeFile(wb, "Template_Jadwal_Bel.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // Skip header row
        const rows = data.slice(1);
        let successCount = 0;

        for (const row of rows) {
          if (row.length < 7) continue;
          const [day, time, period, prefix, name, subject, className] = row;
          
          await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              day: String(day),
              time: String(time),
              period_number: Number(period),
              teacher_prefix: String(prefix),
              teacher_name: String(name),
              subject: String(subject),
              class_name: String(className)
            })
          });
          successCount++;
        }

        await fetchSchedule();
        setStatus({ type: 'success', message: `${successCount} Jadwal berhasil diimpor.` });
      } catch (err) {
        console.error("Import failed", err);
        setStatus({ type: 'error', message: "Gagal mengimpor file Excel." });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const playPCM = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      
      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        await context.resume();
      }

      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      const audioBuffer = context.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      source.start();
      
      return new Promise((resolve) => {
        source.onended = resolve;
      });
    } catch (e) {
      console.error("PCM Playback Error:", e);
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    day: 'Senin',
    time: '07:00',
    period_number: 1,
    teacher_prefix: 'Bapak',
    teacher_name: '',
    subject: '',
    class_name: ''
  });

  useEffect(() => {
    fetchSchedule();
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLive) {
      checkSchedule();
    }
  }, [currentTime, isLive]);

  const fetchSchedule = async () => {
    try {
      const res = await fetch('/api/schedule');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSchedule(data);
    } catch (err) {
      console.error("Failed to fetch schedule", err);
      setStatus({ type: 'error', message: "Gagal memuat jadwal dari server." });
    }
  };

  const checkSchedule = async () => {
    const now = new Date();
    const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
    
    // Use a reliable HH:mm format for comparison
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;
    
    // Create a unique key for this specific bell instance (Day + Time + Date)
    const dateStr = now.toISOString().split('T')[0];
    const playKey = `${currentDay}-${currentTimeStr}-${dateStr}`;

    const match = schedule.find(item => 
      item.day === currentDay && 
      item.time === currentTimeStr && 
      item.is_active === 1
    );

    if (match && lastPlayedKey !== playKey) {
      console.log("Match found for automatic bell:", match);
      setLastPlayedKey(playKey);
      playBell(match);
    }
  };

  const playBell = async (item: ScheduleItem, isTest = false) => {
    if (isLoading) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: isTest ? `Mengetes suara...` : `Menyiapkan pengumuman...` });
    
    const text = `Assalamualaikum warahmatullohi wabarokatuh, kepada seluruh siswa SDN 1 Ciparigi. Perhatian. Saat ini pukul ${item.time}. Jam pelajaran ke ${item.period_number} dimulai. Pengampu pelajaran adalah ${item.teacher_prefix} ${item.teacher_name} untuk mata pelajaran ${item.subject} di kelas ${item.class_name}. Kepada seluruh siswa, silakan masuk ke dalam kelas.`;

    try {
      // 1. Start Jingle and AI Generation in parallel
      const jinglePromise = new Promise<void>((resolve) => {
        if (!jingleRef.current) return resolve();
        
        jingleRef.current.currentTime = 0;
        const onEnded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          console.error("Jingle failed");
          cleanup();
          resolve();
        };
        const cleanup = () => {
          if (jingleRef.current) {
            jingleRef.current.removeEventListener('ended', onEnded);
            jingleRef.current.removeEventListener('error', onError);
          }
        };
        jingleRef.current.addEventListener('ended', onEnded);
        jingleRef.current.addEventListener('error', onError);
        
        jingleRef.current.play().catch(e => {
          console.error("Jingle play failed", e);
          cleanup();
          resolve();
        });
      });

      const aiVoicePromise = generateBellAnnouncement(text);

      // 2. Wait for both (Jingle ends AND AI voice is ready)
      const [_, base64Audio] = await Promise.all([jinglePromise, aiVoicePromise]);

      // 3. Play AI Voice
      if (base64Audio) {
        await playPCM(base64Audio);
        setStatus({ type: 'success', message: `Bel berbunyi: Jam ke-${item.period_number}` });
      }
    } catch (err) {
      console.error("Failed to play bell", err);
      setStatus({ type: 'error', message: "Gagal memutar bel otomatis." });
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const url = editingItem ? `/api/schedule/${editingItem.id}` : '/api/schedule';
      const method = editingItem ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem ? { ...formData, is_active: editingItem.is_active } : formData)
      });
      
      if (res.ok) {
        await fetchSchedule();
        closeModal();
        setStatus({ type: 'success', message: editingItem ? "Jadwal berhasil diperbarui." : "Jadwal berhasil disimpan." });
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      console.error("Failed to save entry", err);
      setStatus({ type: 'error', message: "Gagal menyimpan jadwal. Silakan coba lagi." });
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      day: 'Senin',
      time: '07:00',
      period_number: 1,
      teacher_prefix: 'Bapak',
      teacher_name: '',
      subject: '',
      class_name: ''
    });
    setShowAddModal(true);
  };

  const openEditModal = (item: ScheduleItem) => {
    setEditingItem(item);
    setFormData({
      day: item.day,
      time: item.time,
      period_number: item.period_number,
      teacher_prefix: item.teacher_prefix,
      teacher_name: item.teacher_name,
      subject: item.subject,
      class_name: item.class_name
    });
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingItem(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus jadwal ini?")) return;
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSchedule();
        setStatus({ type: 'success', message: "Jadwal dihapus." });
      }
    } catch (err) {
      console.error("Failed to delete entry", err);
    } finally {
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const toggleActive = async (item: ScheduleItem) => {
    try {
      const res = await fetch(`/api/schedule/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: item.is_active === 1 ? 0 : 1 })
      });
      if (res.ok) fetchSchedule();
    } catch (err) {
      console.error("Failed to toggle active", err);
    }
  };

  const nextBell = schedule
    .filter(item => item.is_active === 1)
    .sort((a, b) => a.time.localeCompare(b.time))
    .find(item => {
      const now = new Date();
      const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
      if (item.day !== currentDay) return false;
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;
      
      return item.time > currentTimeStr;
    });

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  return (
    <div 
      className="min-h-screen bg-blue-50 text-slate-900 font-sans selection:bg-indigo-100"
      onClick={initAudio}
    >
      <audio ref={jingleRef} src={selectedJingle.url} className="hidden" />
      
      {/* Running Text */}
      <div className="bg-indigo-950 text-white py-3 overflow-hidden whitespace-nowrap relative z-50 shadow-lg">
        <motion.div 
          animate={{ x: [window.innerWidth, -1000] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="inline-block font-display font-bold text-sm tracking-widest uppercase"
        >
          Selamat Datang di SDN 1 Ciparigi Kec. Sukadana Kab. Ciamis • Sistem Bel Sekolah Otomatis AI • Assalamualaikum warahmatullohi wabarokatuh
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-6 py-10 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center p-2 shadow-2xl shadow-indigo-100 border-4 border-indigo-50">
            <img src={SCHOOL_LOGO} alt="Logo Sekolah" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="font-display font-black text-4xl tracking-tight text-indigo-950">SDN 1 Ciparigi</h1>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Automated Intelligence Bell</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-4xl font-display font-black tracking-tighter text-indigo-950">
              {currentTime.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
              {DAYS[currentTime.getDay() === 0 ? 6 : currentTime.getDay() - 1]}, {currentTime.getDate()} {currentTime.toLocaleDateString('id-ID', { month: 'long' })}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => isAdmin ? setIsAdmin(false) : setShowLoginModal(true)}
              className={`p-4 rounded-2xl transition-all shadow-xl ${
                isAdmin ? 'bg-rose-50 text-rose-500' : 'bg-white text-slate-400 hover:text-indigo-600'
              }`}
              title={isAdmin ? "Logout Admin" : "Login Admin"}
            >
              {isAdmin ? <LogOut size={24} /> : <LogIn size={24} />}
            </button>
            <button 
              onClick={() => setIsLive(!isLive)}
              className={`group relative flex items-center gap-4 px-8 py-4 rounded-full font-bold transition-all overflow-hidden shadow-2xl ${
                isLive 
                ? 'bg-indigo-600 text-white shadow-indigo-200' 
                : 'bg-white border-2 border-slate-200 text-slate-400'
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-sm tracking-tight uppercase">{isLive ? 'Sistem Aktif' : 'Sistem Jeda'}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6 pb-24">
        {/* Status Notification */}
        <AnimatePresence>
          {status && (
            <motion.div 
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
              className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] px-8 py-5 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-2 flex items-center gap-5 min-w-[400px] ${
                status.type === 'success' ? 'bg-white border-emerald-100 text-emerald-900' :
                status.type === 'error' ? 'bg-white border-rose-100 text-rose-900' :
                'bg-indigo-600 border-indigo-500 text-white'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                status.type === 'error' ? 'bg-rose-50 text-rose-600' :
                'bg-white/20 text-white'
              }`}>
                {status.type === 'success' ? <CheckCircle2 size={24} /> : 
                 status.type === 'error' ? <AlertCircle size={24} /> : 
                 <Volume2 size={24} className="animate-pulse" />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">Status Sistem</p>
                <span className="text-sm font-bold">{status.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-12 gap-10">
          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-10">
            <section className="elegant-card p-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-[5rem] -mr-10 -mt-10" />
              <h2 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-10 relative z-10">Bel Berikutnya</h2>
              {nextBell ? (
                <div className="space-y-10 relative z-10">
                  <div className="flex items-baseline gap-5">
                    <span className="text-7xl font-display font-black tracking-tighter text-indigo-950">{nextBell.time}</span>
                    <span className="elegant-badge bg-indigo-50 text-indigo-600">Jam {nextBell.period_number}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8 pt-10 border-t-2 border-slate-50">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ruang Kelas</p>
                      <p className="font-black text-indigo-950 text-xl">{nextBell.class_name}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pengampu</p>
                      <p className="font-bold text-slate-700">{nextBell.teacher_prefix} {nextBell.teacher_name}</p>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mata Pelajaran</p>
                      <p className="font-bold text-slate-700 text-lg">{nextBell.subject}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 relative z-10">
                  <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200 mx-auto mb-6">
                    <Bell size={40} strokeWidth={1.5} />
                  </div>
                  <p className="text-slate-400 font-display font-bold text-xl">Tidak ada jadwal.</p>
                </div>
              )}
            </section>

            <section className="vibrant-card-indigo p-10 overflow-hidden relative">
              <div className="relative z-10 space-y-8">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Settings size={24} />
                </div>
                <h2 className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.3em]">SDN 1 Ciparigi</h2>
                <p className="font-display font-bold text-2xl leading-tight">
                  Sistem Bel Sekolah Pintar Berbasis Kecerdasan Buatan.
                </p>
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-white" />
                  <div className="w-2 h-2 rounded-full bg-white/40" />
                  <div className="w-2 h-2 rounded-full bg-white/20" />
                </div>
              </div>
              <Music className="absolute -right-12 -bottom-12 text-white/10 w-64 h-64" />
            </section>
          </div>

          {/* Main Content */}
          <div className="col-span-12 lg:col-span-8 space-y-10">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-black text-4xl text-indigo-950 tracking-tight">Jadwal Bel</h2>
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-4">
                  {/* Jingle Selector */}
                  <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border-2 border-slate-100 shadow-sm">
                    <Music size={18} className="text-indigo-500" />
                    <select 
                      value={selectedJingle.id}
                      onChange={(e) => {
                        const jingle = JINGLES.find(j => j.id === e.target.value);
                        if (jingle) setSelectedJingle(jingle);
                      }}
                      className="text-xs font-bold bg-transparent outline-none cursor-pointer text-slate-600"
                    >
                      {JINGLES.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                    </select>
                    <button 
                      onClick={testJingle}
                      className="p-2 hover:bg-indigo-50 rounded-xl text-indigo-600 transition-colors"
                      title="Tes Musik"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  </div>

                  <div className="h-8 w-px bg-slate-200 mx-2" />

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImportExcel} 
                    accept=".xlsx, .xls" 
                    className="hidden" 
                  />
                  <button 
                    onClick={downloadTemplate}
                    className="p-4 rounded-2xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all shadow-lg"
                    title="Download Template Excel"
                  >
                    <Download size={24} />
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all shadow-lg"
                    title="Impor dari Excel"
                  >
                    <FileSpreadsheet size={24} />
                  </button>
                  <button 
                    onClick={openAddModal}
                    className="elegant-button flex items-center gap-3 shadow-2xl shadow-indigo-200"
                  >
                    <Plus size={24} strokeWidth={3} />
                    <span>Tambah Jadwal</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {schedule.length === 0 ? (
                <div className="elegant-card py-40 text-center border-dashed border-4 border-slate-100">
                  <p className="text-slate-300 font-display font-bold text-2xl">Belum ada melodi hari ini.</p>
                </div>
              ) : (
                schedule.map((item, idx) => (
                  <motion.div 
                    layout
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`group elegant-card p-8 flex items-center justify-between transition-all hover:border-indigo-200 hover:translate-x-2 ${
                      !item.is_active && 'opacity-40 grayscale'
                    }`}
                  >
                    <div className="flex items-center gap-10">
                      <div className="flex flex-col items-center">
                        <span className="text-4xl font-display font-black tracking-tighter text-indigo-950">{item.time}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">{item.day}</span>
                      </div>
                      
                      <div className="w-1 h-12 bg-slate-100 rounded-full" />
                      
                      <div>
                        <div className="flex items-center gap-4 mb-2">
                          <span className="font-black text-indigo-950 text-lg">Jam {item.period_number}</span>
                          <span className="elegant-badge bg-amber-100 text-amber-700">Kelas {item.class_name}</span>
                        </div>
                        <div className="text-sm font-bold text-slate-500 flex items-center gap-6">
                          <span className="flex items-center gap-2 text-indigo-600/70"><User size={16} /> {item.teacher_prefix} {item.teacher_name}</span>
                          <span className="flex items-center gap-2 text-emerald-600/70"><BookOpen size={16} /> {item.subject}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                      <button 
                        onClick={() => playBell(item, true)}
                        disabled={isLoading}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-lg shadow-indigo-50"
                        title="Tes Suara"
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                      {isAdmin && (
                        <>
                          <button 
                            onClick={() => openEditModal(item)}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white transition-all shadow-lg shadow-amber-50"
                            title="Edit"
                          >
                            <Edit2 size={20} />
                          </button>
                          <button 
                            onClick={() => toggleActive(item)}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg ${
                              item.is_active 
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white shadow-emerald-50' 
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200 shadow-slate-50'
                            }`}
                            title={item.is_active ? "Nonaktifkan" : "Aktifkan"}
                          >
                            <Volume2 size={20} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-lg shadow-rose-50"
                            title="Hapus"
                          >
                            <Trash2 size={20} />
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-indigo-950/60 backdrop-blur-2xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 50 }}
              className="relative bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-10 pb-6 text-center">
                <div className="w-20 h-20 school-gradient rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl">
                  <LogIn size={32} />
                </div>
                <h3 className="font-display font-black text-3xl text-indigo-950 mb-2">Admin Login</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Akses Pengelolaan Jadwal</p>
              </div>
              <form onSubmit={handleLogin} className="p-10 pt-4 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Username</label>
                  <input 
                    type="text" 
                    value={loginForm.user}
                    onChange={e => setLoginForm({...loginForm, user: e.target.value})}
                    className="elegant-input w-full font-bold"
                    placeholder="admin"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Password</label>
                  <input 
                    type="password" 
                    value={loginForm.password}
                    onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                    className="elegant-input w-full font-bold"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <button type="submit" className="elegant-button w-full mt-4">MASUK SEKARANG</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-indigo-950/40 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 100 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 100 }}
              className="relative bg-white w-full max-w-2xl rounded-[4rem] shadow-[0_50px_100px_rgba(0,0,0,0.2)] overflow-hidden"
            >
              <div className="p-12 pb-8 bg-indigo-50/50 flex justify-between items-start">
                <div>
                  <h3 className="font-display font-black text-4xl text-indigo-950 mb-3">
                    {editingItem ? 'Edit Jadwal' : 'Jadwal Baru'}
                  </h3>
                  <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest">SDN 1 Ciparigi • Automated Intelligence</p>
                </div>
                <button 
                  onClick={closeModal}
                  className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors shadow-lg"
                >
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-12 pt-10 space-y-10">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Hari</label>
                    <select 
                      value={formData.day}
                      onChange={e => setFormData({...formData, day: e.target.value})}
                      className="elegant-input w-full appearance-none cursor-pointer font-bold text-slate-700"
                    >
                      {DAYS.map(day => <option key={day} value={day}>{day}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Waktu</label>
                    <input 
                      type="time" 
                      value={formData.time}
                      onChange={e => setFormData({...formData, time: e.target.value})}
                      className="elegant-input w-full font-bold text-slate-700"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Jam Ke-</label>
                    <input 
                      type="number" 
                      min="1"
                      value={formData.period_number}
                      onChange={e => setFormData({...formData, period_number: parseInt(e.target.value)})}
                      className="elegant-input w-full font-bold text-slate-700"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Panggilan</label>
                    <select 
                      value={formData.teacher_prefix}
                      onChange={e => setFormData({...formData, teacher_prefix: e.target.value})}
                      className="elegant-input w-full appearance-none cursor-pointer font-bold text-slate-700"
                    >
                      <option value="Bapak">Bapak</option>
                      <option value="Ibu">Ibu</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Kelas</label>
                    <input 
                      type="text" 
                      placeholder="10-A"
                      value={formData.class_name}
                      onChange={e => setFormData({...formData, class_name: e.target.value})}
                      className="elegant-input w-full font-bold text-slate-700"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nama Guru</label>
                    <input 
                      type="text" 
                      placeholder="Budi Santoso"
                      value={formData.teacher_name}
                      onChange={e => setFormData({...formData, teacher_name: e.target.value})}
                      className="elegant-input w-full font-bold text-slate-700"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Mata Pelajaran</label>
                    <input 
                      type="text" 
                      placeholder="Matematika"
                      value={formData.subject}
                      onChange={e => setFormData({...formData, subject: e.target.value})}
                      className="elegant-input w-full font-bold text-slate-700"
                      required
                    />
                  </div>
                </div>

                <div className="pt-10 flex gap-6">
                  <button 
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-8 py-5 rounded-full font-black text-slate-400 hover:text-indigo-600 transition-all uppercase tracking-widest text-xs"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="elegant-button flex-1 shadow-2xl shadow-indigo-100"
                  >
                    {isLoading ? 'Memproses...' : editingItem ? 'Simpan Perubahan' : 'Simpan Jadwal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

