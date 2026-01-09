#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <atlbase.h>
#include <atlcomcli.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <endpointvolume.h>
#include <wrl.h>
#include <napi.h>
#include <iostream>
#include <vector>
#include <thread>
#include <atomic>
#include <mutex>

// Polyfill definitions
#ifndef AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
typedef enum AUDIOCLIENT_ACTIVATION_TYPE {
    AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT = 0,
    AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1
} AUDIOCLIENT_ACTIVATION_TYPE;

typedef enum PROCESS_LOOPBACK_MODE {
    PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0,
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1
} PROCESS_LOOPBACK_MODE;

typedef struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
    DWORD TargetProcessId;
    PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
} AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS;

typedef struct AUDIOCLIENT_ACTIVATION_PARAMS {
    AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
    union {
        AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
    } DUMMYUNIONNAME;
} AUDIOCLIENT_ACTIVATION_PARAMS;
#endif

using namespace Napi;
using namespace Microsoft::WRL;

// --- Helper Functions ---
void CheckHR(HRESULT hr, const char* msg) {
    if (FAILED(hr)) {
        char buf[64];
        snprintf(buf, sizeof(buf), " (0x%08X)", hr);
        throw std::runtime_error(std::string(msg) + " failed" + buf);
    }
}

// --- Completion Handler for Async Activation ---
// Must implement IAgileObject (via FtmBase) for async callbacks on worker threads
class CompletionHandler : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IActivateAudioInterfaceCompletionHandler, FtmBase> {
public:
    CompletionHandler() {
        m_hEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    }
    ~CompletionHandler() {
        if (m_hEvent) CloseHandle(m_hEvent);
    }

    STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* activateOperation) {
        m_activateResult = activateOperation;
        SetEvent(m_hEvent);
        return S_OK;
    }

    HRESULT WaitForCompletion(DWORD timeoutMs, IUnknown** ppUnknown) {
        DWORD wait = WaitForSingleObject(m_hEvent, timeoutMs);
        if (wait != WAIT_OBJECT_0) return E_FAIL;
        
        HRESULT hrActivateResult = E_FAIL;
        CComPtr<IUnknown> punkAudioInterface;
        HRESULT hr = m_activateResult->GetActivateResult(&hrActivateResult, &punkAudioInterface);
        if (SUCCEEDED(hr) && SUCCEEDED(hrActivateResult)) {
            *ppUnknown = punkAudioInterface.Detach();
            return S_OK;
        }
        return hrActivateResult;
    }

private:
    CComPtr<IActivateAudioInterfaceAsyncOperation> m_activateResult;
    HANDLE m_hEvent;
};

// --- Capture Logic ---
std::atomic<bool> g_isCapturing(false);
std::thread g_captureThread;
Napi::ThreadSafeFunction g_tsfn;

void CaptureLoop(DWORD pid) {
    CoInitializeEx(NULL, COINIT_MULTITHREADED);

    try {
        ComPtr<CompletionHandler> pHandler = Make<CompletionHandler>();
        
        AUDIOCLIENT_ACTIVATION_PARAMS params = {};
        params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
        params.ProcessLoopbackParams.TargetProcessId = pid;
        params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

        PROPVARIANT activateParams = {};
        activateParams.vt = VT_BLOB;
        activateParams.blob.cbSize = sizeof(params);
        activateParams.blob.pBlobData = (BYTE*)&params;

        CComPtr<IActivateAudioInterfaceAsyncOperation> pOp;
        
        // VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK is technically "VAD" endpoint string or similar, usually null for default loopback?
        // ActivateAudioInterfaceAsync requires a device interface path.
        // But for Process Loopback, we should use VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK (defined in headers usually).
        // If not defined, we might need to look it up.
        // Actually, it is L"VAD\\Process_Loopback"
        
        LPCWSTR devInterface = L"VAD\\Process_Loopback"; 
        
        HRESULT hr = ActivateAudioInterfaceAsync(
            devInterface,
            __uuidof(IAudioClient),
            &activateParams,
            pHandler.Get(),
            &pOp
        );
        CheckHR(hr, "ActivateAudioInterfaceAsync");

        CComPtr<IUnknown> pUnknown;
        hr = pHandler->WaitForCompletion(5000, &pUnknown);
        CheckHR(hr, "WaitForCompletion");

        CComQIPtr<IAudioClient> pAudioClient(pUnknown);
        if (!pAudioClient) throw std::runtime_error("Interface is not IAudioClient");

        WAVEFORMATEX* pwfx = NULL;
        hr = pAudioClient->GetMixFormat(&pwfx);
        CheckHR(hr, "GetMixFormat");
        
        // Force standard format if possible or stick to MixFormat?
        // MixFormat is best.
        
        hr = pAudioClient->Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            1000 * 10000, // 1 sec buffer
            0,
            pwfx,
            NULL
        );
        CheckHR(hr, "Initialize");

        HANDLE hEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
        pAudioClient->SetEventHandle(hEvent);

        CComPtr<IAudioCaptureClient> pCaptureClient;
        hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&pCaptureClient);
        CheckHR(hr, "GetService");

        hr = pAudioClient->Start();
        CheckHR(hr, "Start");

        while (g_isCapturing) {
            DWORD retval = WaitForSingleObject(hEvent, 500);
            if (retval != WAIT_OBJECT_0) continue;

            UINT32 packetLength = 0;
            hr = pCaptureClient->GetNextPacketSize(&packetLength);
            
            while (packetLength != 0) {
                BYTE* pData;
                UINT32 numFramesAvailable;
                DWORD flags;

                hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);
                if (SUCCEEDED(hr)) {
                    if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                        // Silent Packet
                    } else {
                        // Copy data
                        size_t bytes = numFramesAvailable * pwfx->nBlockAlign;
                        std::vector<uint8_t> buffer(bytes);
                        memcpy(buffer.data(), pData, bytes);

                        auto callback = [buffer = std::move(buffer)](Napi::Env env, Napi::Function jsCallback) {
                             jsCallback.Call({ Napi::Buffer<uint8_t>::Copy(env, buffer.data(), buffer.size()) });
                        };
                        g_tsfn.BlockingCall(callback);
                    }
                    pCaptureClient->ReleaseBuffer(numFramesAvailable);
                }
                hr = pCaptureClient->GetNextPacketSize(&packetLength);
            }
        }
        
        pAudioClient->Stop();
        CoTaskMemFree(pwfx);
        CloseHandle(hEvent);
    } catch (const std::exception& e) {
        std::cerr << "Capture Error: " << e.what() << std::endl;
    }
    CoUninitialize();
}

Napi::Value Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected PID (number) and callback (function)").ThrowAsJavaScriptException();
        return env.Null();
    }

    DWORD pid = info[0].As<Napi::Number>().Uint32Value();
    Napi::Function cb = info[1].As<Napi::Function>();

    if (g_isCapturing) {
        // Already running
        return Napi::Boolean::New(env, false);
    }

    g_tsfn = Napi::ThreadSafeFunction::New(env, cb, "AudioCapture", 0, 1);
    g_isCapturing = true;
    g_captureThread = std::thread(CaptureLoop, pid);

    return Napi::Boolean::New(env, true);
}

// Helper to get PID from HWND (passed as number)
Napi::Value GetPidFromWindowHandle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected HWND (number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // HWND can be large, use Int64
    int64_t hwndVal = info[0].As<Napi::Number>().Int64Value();
    HWND hwnd = (HWND)hwndVal;
    
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    
    return Napi::Number::New(env, pid);
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
    if (g_isCapturing) {
        g_isCapturing = false;
        if (g_captureThread.joinable()) {
            g_captureThread.join();
        }
        g_tsfn.Release();
    }
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("start", Napi::Function::New(env, Start));
    exports.Set("stop", Napi::Function::New(env, Stop));
    exports.Set("getPidFromWindowHandle", Napi::Function::New(env, GetPidFromWindowHandle));
    return exports;
}

NODE_API_MODULE(zvon_audio, Init)
