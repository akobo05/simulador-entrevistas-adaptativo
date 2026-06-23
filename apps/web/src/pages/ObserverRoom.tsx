import { useState, useEffect, useRef, useCallback } from 'react';
import type { RoomRole } from '@warachikuy/shared-types';
import { useRoomSocket } from '../hooks/useRoomSocket';
import './ObserverRoom.css';

/* ── Helpers ──────────────────────────────────────────────── */
const STUN = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

function formatTimer(s: number): string {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/* ── Lobby ────────────────────────────────────────────────── */
function Lobby({ onJoin }: { onJoin: (roomId: string, role: RoomRole) => void }) {
  const [roomId] = useState(() => crypto.randomUUID().slice(0, 8));
  const [role, setRole] = useState<RoomRole>('observer');
  const [inputRoom, setInputRoom] = useState(roomId);

  const handleJoin = () => {
    const id = inputRoom.trim() || roomId;
    onJoin(id, role);
  };

  return (
    <div className="obs-lobby">
      <div className="obs-lobby-card">
        <div className="obs-lobby-icon">W</div>
        <h1 className="obs-lobby-title">Sala de observación</h1>
        <p className="obs-lobby-sub">Conéctate como observador, entrevistador o candidato</p>

        <div className="obs-lobby-field">
          <label className="obs-lobby-label">ID de sala</label>
          <input
            className="obs-lobby-input"
            value={inputRoom}
            onChange={(e) => setInputRoom(e.target.value)}
            placeholder="room-id"
          />
        </div>

        <div className="obs-lobby-field">
          <label className="obs-lobby-label">Tu rol</label>
          <div className="obs-lobby-roles">
            {(['candidate', 'interviewer', 'observer'] as const).map((r) => (
              <button
                key={r}
                className={`obs-lobby-role ${role === r ? 'obs-lobby-role--active' : ''}`}
                onClick={() => setRole(r)}
              >
                {r === 'candidate' && '🎤 Candidato'}
                {r === 'interviewer' && '🎙 Entrevistador'}
                {r === 'observer' && '👁 Observador'}
              </button>
            ))}
          </div>
        </div>

        <button className="obs-lobby-join" onClick={handleJoin}>
          Entrar a la sala
        </button>
      </div>
    </div>
  );
}

/* ── VideoBox ─────────────────────────────────────────────── */
function VideoBox({
  stream,
  label,
  muted,
  mirrored,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  if (!stream) {
    return (
      <div className="obs-video-box obs-video-box--empty">
        <div className="obs-video-avatar">
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="24" r="14" fill="#1E293B" />
            <ellipse cx="32" cy="52" rx="22" ry="14" fill="#1E293B" />
          </svg>
        </div>
        <span className="obs-video-label">{label}</span>
        <span className="obs-video-waiting">Esperando conexión…</span>
      </div>
    );
  }

  return (
    <div className="obs-video-box">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`obs-video-el ${mirrored ? 'obs-video-el--mirrored' : ''}`}
      />
      <span className="obs-video-label">{label}</span>
    </div>
  );
}

/* ── Room ─────────────────────────────────────────────────── */
function Room({ roomId, role }: { roomId: string; role: RoomRole }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates: RTCIceCandidateInit[] = [];
  let remoteDescSet = false;

  const { peerId, participants, send } = useRoomSocket({
    roomId,
    role,
    onSignalOffer: (from, desc) => {
      const pc = getOrCreatePC();
      pc.setRemoteDescription(new RTCSessionDescription(desc as RTCSessionDescriptionInit))
        .then(() => {
          remoteDescSet = true;
          flushCandidates(pc);
          return pc.createAnswer();
        })
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          const ld = pc.localDescription;
          if (ld && ld.sdp) {
            send({
              type: 'signal.answer',
              payload: { description: { type: ld.type, sdp: ld.sdp } },
            });
          }
        })
        .catch(console.error);
    },
    onSignalAnswer: (_from, desc) => {
      const pc = getOrCreatePC();
      pc.setRemoteDescription(new RTCSessionDescription(desc as RTCSessionDescriptionInit))
        .then(() => {
          remoteDescSet = true;
          flushCandidates(pc);
        })
        .catch(console.error);
    },
    onIceCandidate: (_from, candidate) => {
      const pc = pcRef.current;
      if (pc && remoteDescSet) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidates.push(candidate);
      }
    },
    onPeerJoined: (peer) => {
      if (role !== 'observer' && peer.role !== 'observer' && pcRef.current === null) {
        startCall();
      }
    },
  });

  const flushCandidates = (pc: RTCPeerConnection) => {
    while (pendingCandidates.length) {
      pc.addIceCandidate(new RTCIceCandidate(pendingCandidates.shift()!)).catch(() => {});
    }
  };

  const getOrCreatePC = useCallback((): RTCPeerConnection => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(STUN);
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({
          type: 'signal.ice-candidate',
          payload: {
            candidate: {
              candidate: e.candidate.candidate,
              sdpMid: e.candidate.sdpMid,
              sdpMLineIndex: e.candidate.sdpMLineIndex,
            },
          },
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      // connection state changed
    };

    if (localStream) {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    }

    return pc;
  }, [localStream, send]);

  const startCall = useCallback(async () => {
    const pc = getOrCreatePC();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (offer.sdp) {
        send({
          type: 'signal.offer',
          payload: { description: { type: offer.type, sdp: offer.sdp } },
        });
      }
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  }, [getOrCreatePC, send]);

  useEffect(() => {
    if (role === 'observer') return;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        setLocalStream(stream);
      })
      .catch(() => {});
  }, [role]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [localStream]);

  const isCaller = role === 'candidate' || role === 'interviewer';
  const otherRole =
    role === 'candidate' ? 'interviewer' : role === 'interviewer' ? 'candidate' : 'candidate';

  return (
    <div className="obs-room">
      <header className="obs-header">
        <div className="obs-header__left">
          <div className="obs-logo">W</div>
          <div className="obs-header__info">
            <span className="obs-header__name">Sala: {roomId}</span>
            <span className="obs-header__role">
              {role === 'candidate' && 'Candidato'}
              {role === 'interviewer' && 'Entrevistador'}
              {role === 'observer' && 'Observador'}
            </span>
          </div>
        </div>

        <div className="obs-header__center">
          <span className="obs-live-dot" />
          <span className="obs-live-label">EN VIVO</span>
          <span className="obs-timer">{formatTimer(elapsed)}</span>
        </div>

        <div className="obs-header__right">
          <div className={`obs-badge obs-badge--${role}`}>
            {participants.length} participante{participants.length !== 1 ? 's' : ''}
          </div>
        </div>
      </header>

      <main className="obs-body">
        <div className="obs-videos">
          {isCaller && (
            <>
              <VideoBox stream={localStream} label="Tú" muted mirrored />
              <VideoBox
                stream={remoteStream}
                label={otherRole === 'candidate' ? 'Candidato' : 'Entrevistador'}
              />
            </>
          )}
          {role === 'observer' && (
            <>
              <VideoBox stream={remoteStream} label="Candidato" />
              <VideoBox stream={null} label="Entrevistador" />
            </>
          )}
        </div>

        <div className="obs-participants">
          <h3>Participantes</h3>
          <div className="obs-participant-list">
            {participants.map((p) => (
              <div key={p.peerId} className="obs-participant-item">
                <span className={`obs-participant-dot obs-participant-dot--${p.role}`} />
                <span>
                  {p.role === 'candidate'
                    ? 'Candidato'
                    : p.role === 'interviewer'
                      ? 'Entrevistador'
                      : 'Observador'}
                </span>
                {p.peerId === peerId && <span className="obs-participant-you">(tú)</span>}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════ */
export function ObserverRoom() {
  const [joined, setJoined] = useState<{ roomId: string; role: RoomRole } | null>(null);

  const handleJoin = (roomId: string, role: RoomRole) => {
    setJoined({ roomId, role });
  };

  if (joined) {
    return <Room roomId={joined.roomId} role={joined.role} />;
  }

  return <Lobby onJoin={handleJoin} />;
}
