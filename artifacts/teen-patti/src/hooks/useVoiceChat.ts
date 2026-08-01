import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';
async function vapi(method: string, path: string, body?: any, token?: string) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface VoiceChatState {
  inVoice: boolean;
  micOn: boolean;
  speakerOn: boolean;
  voicePeerIds: string[];   // userIds currently in voice (excludes self)
  speakingPeerIds: string[]; // userIds currently speaking
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMic: () => void;
  toggleSpeaker: () => void;
}

export function useVoiceChat(tableId: string, userId: string, token: string): VoiceChatState {
  const [inVoice, setInVoice]       = useState(false);
  const [micOn, setMicOn]           = useState(true);
  const [speakerOn, setSpeakerOn]   = useState(true);
  const [voicePeerIds, setVoicePeerIds]     = useState<string[]>([]);
  const [speakingPeerIds, setSpeakingPeerIds] = useState<string[]>([]);

  const localStream   = useRef<MediaStream | null>(null);
  const pcs           = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audios        = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analysers     = useRef<Map<string, { an: AnalyserNode; buf: Uint8Array }>>(new Map());
  const audioCtx      = useRef<AudioContext | null>(null);
  const inVoiceRef    = useRef(false);

  // ── helpers ──────────────────────────────────────────────────────────────────

  const sendSignal = useCallback((to: string, data: any) => {
    vapi('POST', '/voice/signal', { to, data }, token).catch(() => {});
  }, [token]);

  const getOrCreatePc = useCallback((remoteId: string): RTCPeerConnection => {
    if (pcs.current.has(remoteId)) return pcs.current.get(remoteId)!;

    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcs.current.set(remoteId, pc);

    // Add local audio
    localStream.current?.getTracks().forEach(t =>
      pc.addTrack(t, localStream.current!)
    );

    // ICE
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(remoteId, { type: 'candidate', candidate });
    };

    // Remote audio
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      let el = audios.current.get(remoteId);
      if (!el) { el = new Audio(); el.autoplay = true; audios.current.set(remoteId, el); }
      el.srcObject = stream;
      el.muted = !speakerOn;

      // Speaking detection
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const src = ctx.createMediaStreamSource(stream);
      const an  = ctx.createAnalyser(); an.fftSize = 256;
      src.connect(an);
      analysers.current.set(remoteId, { an, buf: new Uint8Array(an.frequencyBinCount) });
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed' || s === 'disconnected') {
        pc.close(); pcs.current.delete(remoteId);
        const el = audios.current.get(remoteId); if (el) el.srcObject = null;
        audios.current.delete(remoteId); analysers.current.delete(remoteId);
      }
    };

    return pc;
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignal = useCallback(async (from: string, data: any) => {
    try {
      if (data.type === 'offer') {
        const pc = getOrCreatePc(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { type: 'answer', answer });
      } else if (data.type === 'answer') {
        const pc = pcs.current.get(from);
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      } else if (data.type === 'candidate') {
        const pc = pcs.current.get(from);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }
    } catch { /* ignore stale signals */ }
  }, [getOrCreatePc, sendSignal]);

  // Lower userId is the initiator (avoids both sides creating offers simultaneously)
  const initiateTo = useCallback(async (remoteId: string) => {
    if (pcs.current.has(remoteId)) return;
    const pc = getOrCreatePc(remoteId);
    if (userId < remoteId) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(remoteId, { type: 'offer', offer });
    }
    // else: wait for their offer to arrive via signal polling
  }, [userId, getOrCreatePc, sendSignal]);

  // ── join / leave ──────────────────────────────────────────────────────────────

  const joinVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      const { peers } = await vapi('POST', '/voice/join', { tableId }, token);
      setVoicePeerIds((peers as any[]).map(p => p.userId));
      for (const p of peers as any[]) await initiateTo(p.userId);
      inVoiceRef.current = true;
      setInVoice(true);
    } catch (e: any) {
      console.error('Voice join failed', e);
      alert('Microphone access denied or unavailable.');
    }
  }, [tableId, token, initiateTo]);

  const leaveVoice = useCallback(async () => {
    inVoiceRef.current = false;
    setInVoice(false);
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    for (const el of audios.current.values()) { el.srcObject = null; }
    audios.current.clear(); analysers.current.clear();
    setVoicePeerIds([]); setSpeakingPeerIds([]);
    await vapi('POST', '/voice/leave', { tableId }, token).catch(() => {});
  }, [tableId, token]);

  // ── poll for signals while in voice ──────────────────────────────────────────

  useEffect(() => {
    if (!inVoice) return;
    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const { signals, peers } = await vapi('GET', `/voice/signals?tableId=${tableId}`, undefined, token);
        const peerIds: string[] = (peers as any[]).map((p: any) => p.userId);
        setVoicePeerIds(peerIds);

        // New peers → initiate
        for (const p of peers as any[]) {
          if (!pcs.current.has(p.userId)) await initiateTo(p.userId);
        }
        // Stale peers → close
        for (const uid of pcs.current.keys()) {
          if (!peerIds.includes(uid)) {
            pcs.current.get(uid)?.close(); pcs.current.delete(uid);
            const el = audios.current.get(uid); if (el) el.srcObject = null;
            audios.current.delete(uid); analysers.current.delete(uid);
          }
        }
        // Handle signals
        for (const sig of signals as any[]) {
          await handleSignal(sig.from, sig.data);
        }
      } catch { /* network hiccup */ }
    };

    const iv = setInterval(poll, 700);
    return () => { active = false; clearInterval(iv); };
  }, [inVoice, tableId, token, initiateTo, handleSignal]);

  // ── speaking detection ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!inVoice) return;
    let raf: number;
    const detect = () => {
      const speaking: string[] = [];
      for (const [uid, { an, buf }] of analysers.current) {
        an.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        if (avg > 12) speaking.push(uid);
      }
      setSpeakingPeerIds(prev =>
        prev.length === speaking.length && prev.every((v, i) => v === speaking[i]) ? prev : speaking
      );
      raf = requestAnimationFrame(detect);
    };
    raf = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(raf);
  }, [inVoice]);

  // ── cleanup on unmount ────────────────────────────────────────────────────────

  useEffect(() => () => { if (inVoiceRef.current) leaveVoice(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── controls ──────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    if (!localStream.current) return;
    const next = !micOn;
    localStream.current.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
  }, [micOn]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerOn;
    for (const el of audios.current.values()) el.muted = !next;
    setSpeakerOn(next);
  }, [speakerOn]);

  return { inVoice, micOn, speakerOn, voicePeerIds, speakingPeerIds, joinVoice, leaveVoice, toggleMic, toggleSpeaker };
}
