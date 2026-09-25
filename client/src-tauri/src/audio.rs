//! Захват звука отдельного процесса (WASAPI process loopback).
//!
//! Замена нативного модуля native-audio/main.cpp. Режим 0 — звук только
//! указанного процесса и его потомков (демонстрация окна), режим 1 — всё,
//! кроме указанного процесса (демонстрация экрана без эха самого Zvon).
//!
//! Отсчёты уходят в интерфейс как float32 LE (строкой base64) через Channel,
//! пачками по три пакета или раз в 10 мс — как делал главный процесс Electron.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};

pub struct Capture {
    running: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl Default for Capture {
    fn default() -> Self {
        Self { running: Arc::new(AtomicBool::new(false)), thread: Mutex::new(None) }
    }
}

impl Capture {
    pub fn start(&self, pid: u32, mode: u32, channel: Channel<InvokeResponseBody>) {
        self.stop();
        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let handle = std::thread::Builder::new()
            .name("zvon-audio-capture".into())
            .spawn(move || {
                if let Err(e) = imp::capture_loop(pid, mode, &running, &channel) {
                    log::error!("[NativeAudio] ошибка захвата: {e}");
                }
                running.store(false, Ordering::SeqCst);
            });
        match handle {
            Ok(h) => *self.thread.lock() = Some(h),
            Err(e) => log::error!("[NativeAudio] поток не запущен: {e}"),
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(h) = self.thread.lock().take() {
            let _ = h.join();
        }
    }
}

struct Batcher<'a> {
    channel: &'a Channel<InvokeResponseBody>,
    buf: Vec<u8>,
    packets: usize,
    since: Option<Instant>,
}

impl<'a> Batcher<'a> {
    fn push(&mut self, bytes: &[u8]) {
        if self.since.is_none() {
            self.since = Some(Instant::now());
        }
        self.buf.extend_from_slice(bytes);
        self.packets += 1;
        if self.packets >= 3 {
            self.flush();
        }
    }

    fn tick(&mut self) {
        if self.since.map(|t| t.elapsed() >= Duration::from_millis(10)).unwrap_or(false) {
            self.flush();
        }
    }

    fn flush(&mut self) {
        if !self.buf.is_empty() {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&self.buf);
            self.buf.clear();
            let _ = self.channel.send(InvokeResponseBody::Json(format!("\"{b64}\"")));
        }
        self.packets = 0;
        self.since = None;
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use windows::core::{implement, Interface, Ref, HRESULT, IUnknown};
    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::Media::Audio::*;
    use windows::Win32::Media::KernelStreaming::{KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE};
    use windows::Win32::Media::Multimedia::{KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT};
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, CoUninitialize, IAgileObject, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{CreateEventW, SetEvent, WaitForSingleObject};

    const WAVE_FORMAT_PCM_TAG: u16 = 1;
    const KSAUDIO_SPEAKER_STEREO: u32 = 0x3;

    #[implement(IActivateAudioInterfaceCompletionHandler, IAgileObject)]
    struct Handler {
        event: windows::Win32::Foundation::HANDLE,
    }

    impl IActivateAudioInterfaceCompletionHandler_Impl for Handler_Impl {
        fn ActivateCompleted(&self, _op: Ref<IActivateAudioInterfaceAsyncOperation>) -> windows::core::Result<()> {
            unsafe { SetEvent(self.event) }
        }
    }

    impl windows::Win32::System::Com::IAgileObject_Impl for Handler_Impl {}

    /// PROPVARIANT с VT_BLOB. Раскладка совпадает с системной (24 байта на x64):
    /// vt и три резервных слова, затем BLOB { cbSize, pBlobData }.
    #[repr(C)]
    struct BlobVariant {
        vt: u16,
        r1: u16,
        r2: u16,
        r3: u16,
        cb: u32,
        _pad: u32,
        data: *mut u8,
    }
    const VT_BLOB: u16 = 65;

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) { unsafe { CoUninitialize() } }
    }

    pub fn capture_loop(pid: u32, mode: u32, running: &AtomicBool, channel: &Channel<InvokeResponseBody>) -> Result<(), String> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().map_err(|e| format!("CoInitializeEx: {e}"))?;
            let _com = ComGuard;

            let done = CreateEventW(None, false, false, None).map_err(|e| format!("CreateEvent: {e}"))?;
            let handler: IActivateAudioInterfaceCompletionHandler = Handler { event: done }.into();

            let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
                ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                    ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                        TargetProcessId: pid,
                        ProcessLoopbackMode: if mode == 1 {
                            PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
                        } else {
                            PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                        },
                    },
                },
            };
            let variant = BlobVariant {
                vt: VT_BLOB, r1: 0, r2: 0, r3: 0,
                cb: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                _pad: 0,
                data: &mut params as *mut _ as *mut u8,
            };

            let op = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(&variant as *const BlobVariant as *const PROPVARIANT),
                &handler,
            ).map_err(|e| format!("ActivateAudioInterfaceAsync: {e}"))?;

            if WaitForSingleObject(done, 5000) != WAIT_OBJECT_0 {
                let _ = CloseHandle(done);
                return Err("WaitForCompletion: таймаут".into());
            }
            let _ = CloseHandle(done);

            let mut hr = HRESULT(0);
            let mut unk: Option<IUnknown> = None;
            op.GetActivateResult(&mut hr, &mut unk).map_err(|e| format!("GetActivateResult: {e}"))?;
            hr.ok().map_err(|e| format!("активация: {e}"))?;
            let client: IAudioClient = unk.ok_or("пустой интерфейс")?.cast().map_err(|e| format!("IAudioClient: {e}"))?;

            // У process loopback GetMixFormat обычно не реализован — тогда,
            // как и раньше, 48 кГц стерео float.
            let mut fallback = WAVEFORMATEXTENSIBLE::default();
            let (fmt_ptr, owned): (*const WAVEFORMATEX, bool) = match client.GetMixFormat() {
                Ok(p) => (p as *const WAVEFORMATEX, true),
                Err(_) => {
                    fallback.Format = WAVEFORMATEX {
                        wFormatTag: WAVE_FORMAT_EXTENSIBLE as u16,
                        nChannels: 2,
                        nSamplesPerSec: 48000,
                        nAvgBytesPerSec: 48000 * 8,
                        nBlockAlign: 8,
                        wBitsPerSample: 32,
                        cbSize: 22,
                    };
                    fallback.Samples.wValidBitsPerSample = 32;
                    fallback.dwChannelMask = KSAUDIO_SPEAKER_STEREO;
                    fallback.SubFormat = KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
                    (&fallback.Format as *const WAVEFORMATEX, false)
                }
            };
            let fmt = *fmt_ptr;
            let sub = if fmt.wFormatTag == WAVE_FORMAT_EXTENSIBLE as u16 {
                Some(std::ptr::addr_of!((*(fmt_ptr as *const WAVEFORMATEXTENSIBLE)).SubFormat).read_unaligned())
            } else {
                None
            };
            let is_float = fmt.wFormatTag == WAVE_FORMAT_IEEE_FLOAT as u16 || sub == Some(KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
            let is_pcm16 = fmt.wBitsPerSample == 16
                && (fmt.wFormatTag == WAVE_FORMAT_PCM_TAG || sub == Some(KSDATAFORMAT_SUBTYPE_PCM));
            let channels = { let c = fmt.nChannels; c as usize };

            let (rate, chans) = (fmt.nSamplesPerSec, fmt.nChannels);
            let meta = format!(r#"{{"sampleRate":{rate},"channels":{chans}}}"#);
            let _ = channel.send(InvokeResponseBody::Json(meta));

            let init = client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK
                    | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                    | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                    | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                0,
                0,
                fmt_ptr,
                None,
            );
            if owned {
                CoTaskMemFree(Some(fmt_ptr as *const c_void));
            }
            init.map_err(|e| format!("Initialize: {e}"))?;

            let ready = CreateEventW(None, false, false, None).map_err(|e| format!("CreateEvent: {e}"))?;
            client.SetEventHandle(ready).map_err(|e| format!("SetEventHandle: {e}"))?;
            let capture: IAudioCaptureClient = client.GetService().map_err(|e| format!("GetService: {e}"))?;
            client.Start().map_err(|e| format!("Start: {e}"))?;

            let mut batch = Batcher { channel, buf: Vec::with_capacity(64 * 1024), packets: 0, since: None };
            let mut samples: Vec<f32> = Vec::new();

            while running.load(Ordering::SeqCst) {
                let wait = WaitForSingleObject(ready, 10);
                if wait == WAIT_OBJECT_0 {
                    let mut packet = capture.GetNextPacketSize().unwrap_or(0);
                    while packet != 0 {
                        let mut data: *mut u8 = std::ptr::null_mut();
                        let mut frames = 0u32;
                        let mut flags = 0u32;
                        if capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None).is_ok() {
                            let silent = flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;
                            if !silent && frames > 0 && !data.is_null() {
                                let count = frames as usize * channels;
                                if is_float {
                                    batch.push(std::slice::from_raw_parts(data, count * 4));
                                } else if is_pcm16 {
                                    let src = std::slice::from_raw_parts(data as *const i16, count);
                                    samples.clear();
                                    samples.extend(src.iter().map(|&s| s as f32 / 32768.0));
                                    batch.push(std::slice::from_raw_parts(samples.as_ptr() as *const u8, count * 4));
                                }
                            }
                            let _ = capture.ReleaseBuffer(frames);
                        }
                        packet = capture.GetNextPacketSize().unwrap_or(0);
                    }
                }
                batch.tick();
            }

            batch.flush();
            let _ = client.Stop();
            let _ = CloseHandle(ready);
            Ok(())
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn capture_loop(_: u32, _: u32, _: &AtomicBool, _: &Channel<InvokeResponseBody>) -> Result<(), String> {
        Err("захват звука процесса есть только в Windows".into())
    }
}
