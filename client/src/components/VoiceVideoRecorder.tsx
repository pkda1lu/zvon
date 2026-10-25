import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './VoiceVideoRecorder.css';
import { MicIcon, VideoIcon, SendIcon, PauseIcon, PlayIcon } from './Icons';
import { Trash2, Lock, SwitchCamera } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { isPCPlatform } from '../utils/device';
import { formatTime } from './MediaControls';

export type RecordMode = 'voice' | 'video';

interface VoiceVideoRecorderProps {
    isMobile?: boolean;
    interfaceScale?: number;
    disabled?: boolean;
    style?: React.CSSProperties;
    onSendMedia: (file: File) => Promise<void> | void;
    onRecordingActiveChange?: (isActive: boolean) => void;
}

const getSupportedVideoMime = (): string => {
    const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4'
    ];
    for (const t of types) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return '';
};

const getSupportedAudioMime = (): string => {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac'
    ];
    for (const t of types) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return '';
};

export const VoiceVideoRecorder: React.FC<VoiceVideoRecorderProps> = ({
    isMobile,
    interfaceScale = 1,
    disabled = false,
    style,
    onSendMedia,
    onRecordingActiveChange
}) => {
    const { alert: showDialogAlert } = useDialog();
    const isPC = isPCPlatform(isMobile);

    const [recordMode, setRecordMode] = useState<RecordMode>('voice');
    const [isRecording, setIsRecording] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [duration, setDuration] = useState(0);
    const [canFlipCamera, setCanFlipCamera] = useState(false);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [waveformBars, setWaveformBars] = useState<number[]>([]);

    const activeStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<any>(null);
    const holdTimeoutRef = useRef<any>(null);
    const startXRef = useRef<number>(0);
    const startYRef = useRef<number>(0);
    const pointerDownRef = useRef<boolean>(false);
    const recordStartTimeRef = useRef<number>(0);
    const isLockedRef = useRef<boolean>(false);
    const isRecordingRef = useRef<boolean>(false);
    const isPausedRef = useRef<boolean>(false);
    const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const primaryCameraIdRef = useRef<string>('');
    const secondaryCameraIdRef = useRef<string>('');

    const previewVideoRef = useRef<HTMLVideoElement | null>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const audioAnimFrameRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const waveformScrollRef = useRef<HTMLDivElement | null>(null);
    const composerBarRef = useRef<HTMLDivElement | null>(null);
    const [containerRect, setContainerRect] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null);

    // Keep refs in sync for event listeners
    isLockedRef.current = isLocked;
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
    dragOffsetRef.current = dragOffset;

    // Attach stream to preview video as soon as the portal mounts the video element
    useEffect(() => {
        if (isRecording && recordMode === 'video' && activeStreamRef.current && previewVideoRef.current) {
            previewVideoRef.current.srcObject = activeStreamRef.current;
            previewVideoRef.current.play().catch(() => {});
        }
    }, [isRecording, recordMode]);

    // Notify parent about recording state
    useEffect(() => {
        onRecordingActiveChange?.(isRecording);
    }, [isRecording, onRecordingActiveChange]);

    // Auto-scroll waveform track as new voice bars are added
    useEffect(() => {
        if (waveformScrollRef.current) {
            waveformScrollRef.current.scrollLeft = waveformScrollRef.current.scrollWidth;
        }
    }, [waveformBars]);

    // Keep track of message-input-container bounding box so video backdrop blurs above it
    useEffect(() => {
        if (!isRecording || recordMode !== 'video') {
            setContainerRect(null);
            return;
        }

        const containerEl = (
            composerBarRef.current?.closest('.message-input-container') ||
            composerBarRef.current?.closest('.message-form') ||
            composerBarRef.current
        ) as HTMLElement | null;

        if (containerEl) {
            containerEl.classList.add('zv-recording-video-active');
        }

        const updateRect = () => {
            const el = (
                composerBarRef.current?.closest('.message-input-container') ||
                composerBarRef.current?.closest('.message-form') ||
                composerBarRef.current
            ) as HTMLElement | null;
            if (el) {
                const r = el.getBoundingClientRect();
                setContainerRect({
                    left: Math.round(r.left),
                    top: Math.round(r.top),
                    right: Math.round(r.right),
                    bottom: Math.round(r.bottom)
                });
            }
        };

        updateRect();
        const animId = requestAnimationFrame(updateRect);

        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
            if (containerEl) {
                containerEl.classList.remove('zv-recording-video-active');
            }
        };
    }, [isRecording, recordMode]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupRecording();
        };
    }, []);

    const cleanupRecording = useCallback(() => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        if (audioAnimFrameRef.current) {
            cancelAnimationFrame(audioAnimFrameRef.current);
            audioAnimFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;

        if (activeStreamRef.current) {
            activeStreamRef.current.getTracks().forEach(track => track.stop());
            activeStreamRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
                mediaRecorderRef.current.stop();
            } catch {}
        }
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];

        setIsRecording(false);
        setIsLocked(false);
        setIsPaused(false);
        setCanFlipCamera(false);
        setDragOffset({ x: 0, y: 0 });
        setDuration(0);
        setWaveformBars([]);
        pointerDownRef.current = false;
        recordStartTimeRef.current = 0;
        primaryCameraIdRef.current = '';
        secondaryCameraIdRef.current = '';
    }, []);

    // Get front camera constraints first
    const getFrontCameraConstraints = async (): Promise<MediaTrackConstraints> => {
        try {
            if (navigator.mediaDevices?.enumerateDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                // Look for explicit front / selfie / user camera
                const frontDevice = videoInputs.find(d => {
                    const label = (d.label || '').toLowerCase();
                    return label.includes('front') || label.includes('user') || label.includes('selfie') ||
                           label.includes('передн') || label.includes('фронтальн');
                });
                if (frontDevice && frontDevice.deviceId) {
                    return {
                        deviceId: { exact: frontDevice.deviceId },
                        width: { ideal: 720 },
                        height: { ideal: 720 }
                    };
                }
            }
        } catch {}

        // Standard facingMode: 'user' for front camera
        return {
            facingMode: { ideal: 'user' },
            width: { ideal: 720 },
            height: { ideal: 720 }
        };
    };

    // Permission check & acquisition: ensures FRONT camera is selected first
    const getMediaStreamWithPermissionCheck = async (
        mode: RecordMode
    ): Promise<MediaStream | null> => {
        if (!navigator.mediaDevices?.getUserMedia) {
            await showDialogAlert('Запись не поддерживается данным браузером');
            return null;
        }

        if (mode === 'voice') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                return stream;
            } catch {
                await showDialogAlert('Запись невозможна: нет доступа к микрофону');
                return null;
            }
        }

        // Mode: 'video' -> Needs both camera and microphone, prioritizing FRONT camera
        let micStream: MediaStream | null = null;
        let camStream: MediaStream | null = null;

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {}

        try {
            const frontConstraints = await getFrontCameraConstraints();
            camStream = await navigator.mediaDevices.getUserMedia({
                video: frontConstraints
            });
        } catch {
            // Fallback with facingMode: 'user'
            try {
                camStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'user' },
                        width: { ideal: 720 },
                        height: { ideal: 720 }
                    }
                });
            } catch {
                try {
                    camStream = await navigator.mediaDevices.getUserMedia({ video: true });
                } catch {}
            }
        }

        const hasMic = Boolean(micStream);
        const hasCam = Boolean(camStream);

        if (!hasMic || !hasCam) {
            if (micStream) micStream.getTracks().forEach(t => t.stop());
            if (camStream) camStream.getTracks().forEach(t => t.stop());

            let hardware = '';
            if (!hasMic && !hasCam) {
                hardware = 'камере и микрофону';
            } else if (!hasCam) {
                hardware = 'камере';
            } else {
                hardware = 'микрофону';
            }

            await showDialogAlert(`Запись невозможна: нет доступа к ${hardware}`);
            return null;
        }

        const combined = new MediaStream([
            ...camStream!.getVideoTracks(),
            ...micStream!.getAudioTracks()
        ]);
        return combined;
    };

    // Verify whether a genuine second camera exists and has a live signal
    const verifySecondaryCamera = async (currentDevId: string) => {
        try {
            if (!navigator.mediaDevices?.enumerateDevices) {
                setCanFlipCamera(false);
                return;
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');

            // If only 1 camera device exists in system -> no flip button!
            if (videoInputs.length < 2) {
                setCanFlipCamera(false);
                return;
            }

            // Find candidate for the OTHER camera (e.g. back / main camera)
            const backDevice = videoInputs.find(d => {
                const label = (d.label || '').toLowerCase();
                return (label.includes('back') || label.includes('rear') || label.includes('environment') ||
                        label.includes('задн') || label.includes('основн')) && d.deviceId !== currentDevId;
            }) || videoInputs.find(d => d.deviceId && d.deviceId !== currentDevId);

            if (!backDevice || !backDevice.deviceId) {
                setCanFlipCamera(false);
                return;
            }

            // Test if we can actually get a live video signal from this second camera
            try {
                const testStream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: backDevice.deviceId } }
                });
                const testTrack = testStream.getVideoTracks()[0];
                const hasLiveSignal = Boolean(testTrack && testTrack.readyState === 'live' && testTrack.enabled);
                testStream.getTracks().forEach(t => t.stop());

                if (hasLiveSignal) {
                    secondaryCameraIdRef.current = backDevice.deviceId;
                    setCanFlipCamera(true);
                } else {
                    setCanFlipCamera(false);
                }
            } catch {
                // Second camera failed or is unavailable -> do not show flip button!
                setCanFlipCamera(false);
            }
        } catch {
            setCanFlipCamera(false);
        }
    };

    // Setup real acoustic voice volume sampling for waveform
    const setupAudioAnalyser = (stream: MediaStream) => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.25;
            source.connect(analyser);
            analyserRef.current = analyser;

            const timeData = new Uint8Array(analyser.frequencyBinCount);
            let lastSampleTime = 0;

            const sampleLoop = (now: number) => {
                if (!analyserRef.current || !isRecordingRef.current) return;

                // Sample actual voice amplitude every 85ms
                if (now - lastSampleTime >= 85) {
                    lastSampleTime = now;
                    if (!isPausedRef.current) {
                        analyserRef.current.getByteTimeDomainData(timeData);

                        let sum = 0;
                        for (let i = 0; i < timeData.length; i++) {
                            const val = (timeData[i] - 128) / 128; // Normalize -1 to 1
                            sum += val * val;
                        }
                        const rms = Math.sqrt(sum / timeData.length);

                        // Human voice RMS ranges from 0.012 to 0.22+
                        const normalized = Math.min(1, Math.max(0, (rms - 0.012) / 0.22));
                        const barHeight = Math.round(3 + normalized * 25);

                        setWaveformBars(prev => [...prev, barHeight]);
                    }
                }

                audioAnimFrameRef.current = requestAnimationFrame(sampleLoop);
            };

            audioAnimFrameRef.current = requestAnimationFrame(sampleLoop);
        } catch {}
    };

    // Start recording procedure
    const startRecording = async () => {
        const stream = await getMediaStreamWithPermissionCheck(recordMode);
        if (!stream) {
            cleanupRecording();
            return;
        }

        activeStreamRef.current = stream;
        recordedChunksRef.current = [];
        setWaveformBars([]);

        let streamToRecord: MediaStream = stream;

        // If video: record center square (1:1 aspect ratio) via canvas capture
        if (recordMode === 'video') {
            const videoTrack = stream.getVideoTracks()[0];
            const currentDevId = videoTrack?.getSettings()?.deviceId || '';
            primaryCameraIdRef.current = currentDevId;

            // Verify if genuine second camera exists and has live signal
            verifySecondaryCamera(currentDevId);

            const canvas = hiddenCanvasRef.current || document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 480;
            hiddenCanvasRef.current = canvas;
            const ctx = canvas.getContext('2d');

            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            await video.play().catch(() => {});

            if (previewVideoRef.current) {
                previewVideoRef.current.srcObject = stream;
                previewVideoRef.current.play().catch(() => {});
            }

            const drawSquareFrame = () => {
                if (video.videoWidth > 0 && video.videoHeight > 0 && ctx) {
                    const minDim = Math.min(video.videoWidth, video.videoHeight);
                    const sx = (video.videoWidth - minDim) / 2;
                    const sy = (video.videoHeight - minDim) / 2;
                    ctx.clearRect(0, 0, 480, 480);
                    // No artificial mirroring - record natural camera feed
                    ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 480, 480);
                }
                if (isRecordingRef.current) {
                    animFrameRef.current = requestAnimationFrame(drawSquareFrame);
                }
            };
            animFrameRef.current = requestAnimationFrame(drawSquareFrame);

            const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : stream;
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0 && canvasStream !== stream) {
                canvasStream.addTrack(audioTracks[0]);
            }
            streamToRecord = canvasStream;
        } else {
            setupAudioAnalyser(stream);
        }

        const mimeType = recordMode === 'video' ? getSupportedVideoMime() : getSupportedAudioMime();
        const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

        try {
            const recorder = new MediaRecorder(streamToRecord, options);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.start(100);
            recordStartTimeRef.current = Date.now();
            setIsRecording(true);
            setDuration(0);

            timerIntervalRef.current = setInterval(() => {
                if (!isPausedRef.current) {
                    setDuration(d => d + 1);
                }
            }, 1000);
        } catch {
            await showDialogAlert('Не удалось запустить запись');
            cleanupRecording();
        }
    };

    // Camera flip handler (switches actual hardware camera between front and back)
    const handleFlipCamera = async () => {
        if (!isRecording || recordMode !== 'video' || !activeStreamRef.current) return;
        const currentTrack = activeStreamRef.current.getVideoTracks()[0];
        if (!currentTrack) return;

        const currentId = currentTrack.getSettings()?.deviceId;
        const targetDeviceId = (currentId === secondaryCameraIdRef.current)
            ? primaryCameraIdRef.current
            : secondaryCameraIdRef.current;

        if (!targetDeviceId) return;

        try {
            const newCamStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: targetDeviceId },
                    width: { ideal: 720 },
                    height: { ideal: 720 }
                }
            });

            const newVideoTrack = newCamStream.getVideoTracks()[0];
            if (newVideoTrack) {
                currentTrack.stop();
                activeStreamRef.current.removeTrack(currentTrack);
                activeStreamRef.current.addTrack(newVideoTrack);

                if (previewVideoRef.current) {
                    previewVideoRef.current.srcObject = new MediaStream([newVideoTrack]);
                    previewVideoRef.current.play().catch(() => {});
                }
            }
        } catch {}
    };

    // Pause / Resume recording handler
    const handleTogglePause = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;

        if (recorder.state === 'recording') {
            recorder.pause();
            setIsPaused(true);
        } else if (recorder.state === 'paused') {
            recorder.resume();
            setIsPaused(false);
        }
    };

    // Finish recording & send
    const stopAndSend = () => {
        const recorder = mediaRecorderRef.current;

        if (recorder && recorder.state !== 'inactive') {
            recorder.onstop = () => {
                const chunks = recordedChunksRef.current;
                const mimeType = recorder.mimeType || (recordMode === 'video' ? 'video/webm' : 'audio/webm');
                const ext = mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('ogg') ? 'ogg' : 'webm');
                const blob = new Blob(chunks, { type: mimeType });
                const filename = recordMode === 'video'
                    ? `video-message-${Date.now()}.${ext}`
                    : `voice-message-${Date.now()}.${ext}`;

                const file = new File([blob], filename, { type: mimeType });
                cleanupRecording();
                onSendMedia(file);
            };
            recorder.stop();
        } else {
            cleanupRecording();
        }
    };

    // Pointer events: press & hold, drag up with pointer to lock, drag left to delete
    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled || isRecording) return;
        pointerDownRef.current = true;
        startXRef.current = e.clientX;
        startYRef.current = e.clientY;
        setDragOffset({ x: 0, y: 0 });

        e.currentTarget.setPointerCapture?.(e.pointerId);

        // Long press detection: after 200ms, start recording
        holdTimeoutRef.current = setTimeout(() => {
            if (pointerDownRef.current) {
                startRecording();
            }
        }, 200);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!pointerDownRef.current || !isRecordingRef.current || isLockedRef.current) return;
        const deltaX = e.clientX - startXRef.current;
        const deltaY = e.clientY - startYRef.current;

        // If pulling UP: button travels upward with pointer
        const clampedY = Math.max(-80, Math.min(0, deltaY));
        // If pulling LEFT: button travels left with pointer
        const clampedX = Math.max(-90, Math.min(0, deltaX));

        setDragOffset({ x: clampedX, y: clampedY });

        // If pulled UP by 55+ pixels -> lock recording!
        if (deltaY <= -55) {
            setIsLocked(true);
            setDragOffset({ x: 0, y: 0 });
        }
    };

    const handlePointerUp = () => {
        if (!pointerDownRef.current) return;
        pointerDownRef.current = false;

        if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
        }

        // Was a tap/click without recording start?
        if (!isRecordingRef.current) {
            // For PC version: do not switch to video message!
            if (!isPC) {
                setRecordMode(m => (m === 'voice' ? 'video' : 'voice'));
            }
            return;
        }

        // If recording was locked, do not stop on pointer up
        if (isLockedRef.current) {
            return;
        }

        const currentOffset = dragOffsetRef.current;

        // 1. If dragged LEFT into trash (<= -65px) -> Delete / Cancel recording!
        if (currentOffset.x <= -65) {
            cleanupRecording();
            return;
        }

        // 2. If held and released: check duration
        // Requirement: if duration is 2+ seconds -> send to chat! If < 2 seconds -> cancel!
        const elapsedMs = recordStartTimeRef.current > 0 ? (Date.now() - recordStartTimeRef.current) : 0;
        if (elapsedMs >= 2000) {
            stopAndSend();
        } else {
            cleanupRecording();
        }
    };

    const handleCancelRecording = () => {
        cleanupRecording();
    };

    const isNearTrash = dragOffset.x <= -45;
    const isNearLock = dragOffset.y <= -40;
    const buttonTitle = recordMode === 'video' ? 'Видеосообщение' : 'Голосовое сообщение';

    const getBackdropClipStyle = (): React.CSSProperties => {
        const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;

        if (!containerRect) {
            const defaultPolygon = 'polygon(0px 0px, 100% 0px, 100% calc(100% - 90px), 0px calc(100% - 90px))';
            return {
                clipPath: defaultPolygon,
                WebkitClipPath: defaultPolygon
            };
        }

        const safeTop = Math.max(0, containerRect.top - 4);
        const left = Math.max(0, containerRect.left);
        const right = Math.min(winW, containerRect.right);

        let polygonStr: string;

        if (!isLocked) {
            // Cutout around the vertical lock rail on the right side of the container
            const lockTop = Math.max(0, safeTop - 85);
            const lockLeft = Math.max(left, right - 70);
            polygonStr = `polygon(
                0px 0px,
                100% 0px,
                100% 100%,
                ${right}px 100%,
                ${right}px ${lockTop}px,
                ${lockLeft}px ${lockTop}px,
                ${lockLeft}px ${safeTop}px,
                ${left}px ${safeTop}px,
                ${left}px 100%,
                0px 100%
            )`;
        } else {
            // Locked mode: clean horizontal cutout across message-input-container
            polygonStr = `polygon(
                0px 0px,
                100% 0px,
                100% 100%,
                ${right}px 100%,
                ${right}px ${safeTop}px,
                ${left}px ${safeTop}px,
                ${left}px 100%,
                0px 100%
            )`;
        }

        const cleanPolygon = polygonStr.replace(/\s+/g, ' ').trim();
        return {
            clipPath: cleanPolygon,
            WebkitClipPath: cleanPolygon
        };
    };

    // 1. ACTIVE RECORDING STATE (both holding and locked take 100% full composer width)
    if (isRecording) {
        return (
            <div ref={composerBarRef} className="zv-rec-composer-bar" style={style}>
                {/* Floating round video live preview IN THE EXACT CENTER OF THE SCREEN (React Portal) */}
                {recordMode === 'video' && typeof document !== 'undefined' && createPortal(
                    <>
                        <div
                            className="zv-rec-video-preview-backdrop"
                            style={getBackdropClipStyle()}
                        />
                        <div className="zv-rec-video-preview-wrapper">
                            <div className="zv-rec-video-circle">
                                <video
                                    ref={previewVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                />
                                <div className="zv-rec-video-badge">
                                    <div className={`zv-rec-indicator-dot ${isPaused ? 'is-paused' : ''}`} />
                                    <span>{isPaused ? 'Пауза' : formatTime(duration)}</span>
                                </div>
                            </div>
                        </div>
                    </>,
                    document.body
                )}

                {/* Left side: if locked -> trash button; if holding -> slide-cancel indicator */}
                {isLocked ? (
                    <button
                        type="button"
                        className="zv-rec-cancel-btn"
                        onClick={handleCancelRecording}
                        title="Удалить запись"
                        aria-label="Удалить запись"
                    >
                        <Trash2 size={18 * interfaceScale} />
                    </button>
                ) : (
                    <div className={`zv-slide-cancel-track ${isNearTrash ? 'is-near-trash' : ''}`}>
                        <div className="zv-slide-cancel-icon">
                            <Trash2 size={16 * interfaceScale} />
                        </div>
                        <span className="zv-slide-cancel-arrow">‹‹</span>
                    </div>
                )}

                {/* Center waveform and timer stretching across full width */}
                <div className="zv-rec-center-info">
                    <div className={`zv-rec-indicator-dot ${isPaused ? 'is-paused' : ''}`} />
                    <span className="zv-rec-timer-text">{formatTime(duration)}</span>
                    {isPaused && <span className="zv-rec-paused-label">(Пауза)</span>}

                    {recordMode === 'voice' && (
                        <div ref={waveformScrollRef} className="zv-rec-waveform-track">
                            {waveformBars.map((h, idx) => (
                                <div
                                    key={idx}
                                    className="zv-rec-voice-bar"
                                    style={{ height: `${h}px` }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right controls row: ALWAYS anchored on the right */}
                <div className="zv-rec-right-row">
                    {isLocked ? (
                        <>
                            {recordMode === 'video' && canFlipCamera && (
                                <button
                                    type="button"
                                    className="zv-rec-flip-btn"
                                    onClick={handleFlipCamera}
                                    title="Перевернуть камеру"
                                    aria-label="Перевернуть камеру"
                                >
                                    <SwitchCamera size={18 * interfaceScale} />
                                </button>
                            )}

                            {/* Pause button: icon only, no text */}
                            <button
                                type="button"
                                className={`zv-rec-pause-btn ${isPaused ? 'is-paused' : ''}`}
                                onClick={handleTogglePause}
                                title={isPaused ? 'Продолжить запись' : 'Поставить запись на паузу'}
                                aria-label={isPaused ? 'Продолжить запись' : 'Поставить запись на паузу'}
                            >
                                {isPaused ? (
                                    <PlayIcon size={18 * interfaceScale} color="#f1c40f" />
                                ) : (
                                    <PauseIcon size={18 * interfaceScale} color="var(--text-main)" />
                                )}
                            </button>

                            {/* Send button (locked) */}
                            <button
                                type="button"
                                className="zv-rec-send-btn"
                                onClick={stopAndSend}
                                title={recordMode === 'video' ? 'Отправить видеосообщение' : 'Отправить голосовое сообщение'}
                                aria-label={recordMode === 'video' ? 'Отправить видеосообщение' : 'Отправить голосовое сообщение'}
                            >
                                <SendIcon size={18 * interfaceScale} />
                            </button>
                        </>
                    ) : (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            {/* Vertical lock rail above button */}
                            <div className="zv-lock-drag-rail">
                                <div className={`zv-lock-drag-target ${isNearLock ? 'is-near-lock' : ''}`}>
                                    <Lock size={15} />
                                </div>
                            </div>

                            {/* Record button traveling up with pointer */}
                            <button
                                type="button"
                                className="voice-video-btn is-active-recording"
                                style={{
                                    transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
                                }}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                title={buttonTitle}
                                aria-label={buttonTitle}
                            >
                                {recordMode === 'video' ? (
                                    <VideoIcon size={18 * interfaceScale} />
                                ) : (
                                    <MicIcon size={18 * interfaceScale} />
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 2. DEFAULT STATE: Voice/Video Record Button (not recording)
    return (
        <div style={{ position: 'relative', display: 'inline-flex', ...style }}>
            <button
                type="button"
                className="voice-video-btn"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                disabled={disabled}
                title={buttonTitle}
                aria-label={buttonTitle}
            >
                {recordMode === 'video' ? (
                    <VideoIcon size={18 * interfaceScale} />
                ) : (
                    <MicIcon size={18 * interfaceScale} />
                )}
            </button>
        </div>
    );
};

export default VoiceVideoRecorder;
