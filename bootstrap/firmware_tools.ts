


import type { ToolCreatorPayload } from '../types';

const SMART_HYBRID_FIRMWARE_CODE = `/**
 * @file FreeEEG8_TriLink_v3.1.ino
 * @author AI Assistant & Synergy Forge
 * @brief Firmware v3.1: Tri-Link (WiFi + BLE + USB Serial)
 * @version 3.1.1
 * @date 2025-01-01
 *
 * --- FEATURES ---
 * 1. ALWAYS-ON BLE: Device is always discoverable.
 * 2. TRI-LINK STREAMING: Stream to WebSocket, BLE, and USB Serial simultaneously.
 * 3. ROBUST COMMANDS: Control streaming via BLE or Serial commands.
 * 4. SELF-HOSTING: Serves its own source code via HTTP.
 *
 * --- CONNECTION GUIDE ---
 * - PROVISIONING: Connect via BLE, write SSID/PASS, write "CONNECT".
 * - DATA (WiFi): Connect via ws://<IP>:81.
 * - DATA (BLE): Enable notifications on Data Characteristic.
 * - DATA (USB): Open Serial (115200 baud), send "STREAM_ON".
 */

#include <SPI.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <WebServer.h>

// --- CONFIGURATION ---
#define DEVICE_NAME_PREFIX "FreeEEG8"
// Uncomment to enable Secure WebSockets (Requires modifying WebSockets.h library)
// #define ENABLE_SSL 

// --- MANIFEST ---
const char* DEVICE_MANIFEST = "{"
  "\\"name\\": \\"FreeEEG8\\","
  "\\"version\\": \\"3.1.1-TriLink\\","
  "\\"mode\\": \\"Tri-Link WiFi+BLE+Serial\\","
  "\\"channels\\": 8,"
  "\\"sample_rate\\": 250,"
  "\\"endpoints\\": [\\"/manifest\\", \\"/source\\", \\"/schematic\\", \\"/pcb\\"]"
"}";

// --- GLOBAL STATE ---
bool deviceConnected = false;
bool oldDeviceConnected = false;
bool bleStreamingEnabled = false;
bool serialStreamingEnabled = false; // New for v3.1
bool wifiConnected = false;

// --- BLE GLOBALS ---
BLEServer* pServer = NULL;
BLECharacteristic* pSsidChar = NULL;
BLECharacteristic* pPassChar = NULL;
BLECharacteristic* pCmdChar = NULL;
BLECharacteristic* pIpChar = NULL;
BLECharacteristic* pStatusChar = NULL;
BLECharacteristic* pDataChar = NULL;

// --- WIFI GLOBALS ---
Preferences preferences;
String stored_ssid = "";
String stored_password = "";
#ifdef ENABLE_SSL
  WebSocketsServer webSocket = WebSocketsServer(443);
#else
  WebSocketsServer webSocket = WebSocketsServer(81);
#endif
WebServer server(80);

// --- SSL CERTIFICATES (If Enabled) ---
#ifdef ENABLE_SSL
  const char* server_cert = R"CERT(
-----BEGIN CERTIFICATE-----
MIIDKTCCAhGgAwIBAgIJAJ8+R9Xq5u5WMA0GCSqGSIb3DQEBCwUAMCwxKjAoBgNV
BAMMIUZyZWVFRUc4IExvY2FsIFNlbGYtU2lnbmVkIENlcnQwHhcNMjUwNTIwMDAw
MDAwWhcNMzUwNTE4MDAwMDAwWjAsMSowKAYDVQQDDCFGcmVlRUVGOCBMb2NhbCBT
ZWxmLVNpZ25lZCBDZXJ0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
w/C8h+XqZzT2Xw+K1b/5pY0k+Q2Xq3Z4Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5
Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5
Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5
Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5
Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5QwIDAQABo1AwTjAdBgNVHQ4EFgQU1a2b3c4d5e6f7g8h
9i0j1k2l3m4nMB8GA1UdIwQYMBaAFNWtm93OHeXuX+4PIfYtI9ZNpd5uMAwGA1Ud
EwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAF/G7h8i9j0k1l2m3n4o5p6q7r8s
9t0u1v2w3x4y5z6A7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y
1z2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e
3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k
5l6m7n8o9p0q1r2s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q
-----END CERTIFICATE-----
)CERT";
  const char* server_private_key = R"KEY(
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDD8LyH5epnNPZf
D4rVv/mljST5DZero9nhnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnl
nlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnl
nlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnlnl
nlnlnlnlnlnlnlnlnlnlnUMCAwEAAoIBAG+A1b2c3d4e5f6g7h8i9j0k1l2m3n4o
5p6q7r8s9t0u1v2w3x4y5z6A7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u
7v8w9x0y1z2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a
9b0c1d2e3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0g
1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h8i9j0k1l2m
3n4o5p6q7r8s9t0u1v2w3x4y5z6A7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s
5t6u7v8w9x0y1z2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y
7z8a9b0c1d2e3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e
9f0g1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h8i9j0k
1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6A7b8c9d0e1f2g3h4i5j6k
7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q
-----END PRIVATE KEY-----
)KEY";
#endif

// --- UUIDS ---
#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SSID_UUID              "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define PASS_UUID              "beb5483f-36e1-4688-b7f5-ea07361b26a8"
#define CMD_UUID               "beb54840-36e1-4688-b7f5-ea07361b26a8"
#define IP_UUID                "beb54841-36e1-4688-b7f5-ea07361b26a8"
#define STATUS_UUID            "beb54842-36e1-4688-b7f5-ea07361b26a8"
#define DATA_UUID              "beb54843-36e1-4688-b7f5-ea07361b26a8"

// --- SELF-HOSTING CONTENT HOLDERS ---
const char* FIRMWARE_SOURCE = R"=====(
[[SOURCE_CODE_PLACEHOLDER]]
)=====";
const char* SCHEMATIC_DATA = R"=====(
[[SCHEMATIC_PLACEHOLDER]]
)=====";
const char* PCB_DATA = R"=====(
[[PCB_PLACEHOLDER]]
)=====";

// --- HELPER FUNCTIONS ---
void connectToWiFi();
void handleManifest();
void handleSource();
void handleSchematic();
void handlePCB();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);

// --- BLE CALLBACKS ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("BLE: Client Connected");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("BLE: Client Disconnected");
      // Restart advertising happens in main loop to avoid stack issues
    }
};

class CmdCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue().c_str();
      Serial.println("BLE CMD: " + value);
      
      if (value == "CONNECT") {
          // Save credentials and connect
          stored_ssid = pSsidChar->getValue().c_str();
          stored_password = pPassChar->getValue().c_str();
          
          preferences.begin("wifi-creds", false);
          preferences.putString("ssid", stored_ssid);
          preferences.putString("password", stored_password);
          preferences.end();
          
          connectToWiFi();
      } 
      else if (value == "WIFI_ON") {
          connectToWiFi();
      }
      else if (value == "WIFI_OFF") {
          WiFi.disconnect(true);
          WiFi.mode(WIFI_OFF);
          wifiConnected = false;
          pStatusChar->setValue("WIFI_OFF");
          pStatusChar->notify();
      }
      else if (value == "BLE_STREAM_ON") {
          bleStreamingEnabled = true;
      }
      else if (value == "BLE_STREAM_OFF") {
          bleStreamingEnabled = false;
      }
    }
};

void setup() {
  Serial.begin(115200);
  Serial.println("--- FreeEEG8 TriLink v3.1 Starting ---");

  // 1. Hardware Init
  // pinMode(DRDY, INPUT)... 
  
  // 2. Preferences
  preferences.begin("wifi-creds", true);
  stored_ssid = preferences.getString("ssid", "");
  stored_password = preferences.getString("password", "");
  preferences.end();

  // 3. BLE Init (Always On)
  uint64_t chipid = ESP.getEfuseMac();
  char devName[30];
  // Use lower 32 bits of MAC for 8-digit uniqueness as per user request
  snprintf(devName, 30, "%s-%08X", DEVICE_NAME_PREFIX, (uint32_t)chipid);
  
  BLEDevice::init(devName);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  pSsidChar = pService->createCharacteristic(SSID_UUID, BLECharacteristic::PROPERTY_WRITE);
  pPassChar = pService->createCharacteristic(PASS_UUID, BLECharacteristic::PROPERTY_WRITE);
  pCmdChar = pService->createCharacteristic(CMD_UUID, BLECharacteristic::PROPERTY_WRITE);
  pCmdChar->setCallbacks(new CmdCallbacks());
  
  pIpChar = pService->createCharacteristic(IP_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pStatusChar = pService->createCharacteristic(STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pDataChar = pService->createCharacteristic(DATA_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  pDataChar->addDescriptor(new BLE2902());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); 
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("BLE: Advertising started.");
  pStatusChar->setValue("READY");

  // 4. Auto-Connect WiFi if configured
  if (stored_ssid.length() > 0) {
      Serial.println("Auto-connecting to WiFi...");
      connectToWiFi();
  }
}

void loop() {
    // --- 1. Serial Command Handling (New in v3.1) ---
    if (Serial.available()) {
        // Use readStringUntil to correctly handle line endings
        String cmd = Serial.readStringUntil('\\n');
        cmd.trim();
        if (cmd == "STREAM_ON") {
            serialStreamingEnabled = true;
            Serial.println("ACK: STREAM_ON");
        } else if (cmd == "STREAM_OFF") {
            serialStreamingEnabled = false;
            Serial.println("ACK: STREAM_OFF");
        }
    }

    // --- 2. Connection Maintenance ---
    // Re-advertise if BLE disconnected
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); 
        pServer->startAdvertising(); 
        Serial.println("BLE: Restarted advertising.");
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }

    // WiFi / WS Tasks
    if (wifiConnected) {
        webSocket.loop();
        server.handleClient();
        ArduinoOTA.handle();
    }

    // --- 3. Data Generation & Streaming (Mock 250Hz) ---
    static unsigned long lastSampleTime = 0;
    unsigned long now = millis();
    
    if (now - lastSampleTime >= 4) { // 4ms = 250Hz
        lastSampleTime = now;
        
        // Generate Mock Data
        long ch_data[8];
        float alpha = sin((float)now / 500.0) * 180.0; 
        for(int i=0; i<8; i++) ch_data[i] = (long)(alpha + random(-20, 20));
        
        // Format Data Packet
        String dataStr = String(now);
        for(int i=0; i<8; i++) { dataStr += ","; dataStr += String(ch_data[i]); }
        
        // A. Stream to WebSocket (WiFi)
        if (wifiConnected && webSocket.connectedClients() > 0) {
            webSocket.broadcastTXT(dataStr);
        }
        
        // B. Stream to BLE
        if (deviceConnected && bleStreamingEnabled) {
            pDataChar->setValue(dataStr.c_str());
            pDataChar->notify();
        }
        
        // C. Stream to USB Serial (New in v3.1)
        if (serialStreamingEnabled) {
            Serial.println(dataStr);
        }
    }
}

void connectToWiFi() {
    if (stored_ssid.length() == 0) return;
    
    pStatusChar->setValue("CONNECTING_WIFI");
    pStatusChar->notify();
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(stored_ssid.c_str(), stored_password.c_str());
    
    // Non-blocking attempt would be better, but for simplicity in a tool:
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        String ip = WiFi.localIP().toString();
        Serial.println("\\nWiFi Connected! IP: " + ip);
        
        pIpChar->setValue(ip.c_str());
        pIpChar->notify();
        pStatusChar->setValue("WIFI_ACTIVE");
        pStatusChar->notify();
        
        // Init Network Services
        ArduinoOTA.begin();
        MDNS.begin("freeeeg8");
        
        server.on("/manifest", HTTP_GET, handleManifest);
        server.on("/source", HTTP_GET, handleSource);
        server.on("/schematic", HTTP_GET, handleSchematic);
        server.on("/pcb", HTTP_GET, handlePCB);
        server.begin();
        
        #ifdef ENABLE_SSL
          webSocket.beginSSL(server_cert, server_private_key);
        #else
          webSocket.begin();
        #endif
        webSocket.onEvent(webSocketEvent);
        
    } else {
        Serial.println("\\nWiFi Failed.");
        pStatusChar->setValue("WIFI_FAILED");
        pStatusChar->notify();
        wifiConnected = false;
    }
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    // Handle WS events
}

void handleManifest() { server.send(200, "application/json", DEVICE_MANIFEST); }
void handleSource() { server.send(200, "text/plain", FIRMWARE_SOURCE); }
void handleSchematic() { server.send(200, "text/plain", SCHEMATIC_DATA); }
void handlePCB() { server.send(200, "text/plain", PCB_DATA); }
`;

const AUDIT_DEVICE_SWARM: ToolCreatorPayload = {
    name: 'Audit Swarm Hardware',
    description: "Connects to a list of devices via their introspection endpoints (/manifest, /source, /schematic) and retrieves their firmware version, source code, and hardware design files for comparison.",
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable the agent to audit the hardware and firmware state of the entire swarm, identifying inconsistencies or outdated devices.',
    parameters: [
        { name: 'deviceIps', type: 'array', description: 'An array of IP address strings for the devices to audit.', required: true },
    ],
    implementationCode: `
        const { deviceIps } = args;
        const auditResults = [];
        const referenceFirmware = ${JSON.stringify(SMART_HYBRID_FIRMWARE_CODE)};

        runtime.logEvent(\`[Auditor] Starting audit of \${deviceIps.length} devices...\`);

        for (const ip of deviceIps) {
            try {
                // Try direct fetch first, fallback to proxy
                const fetchWithFallback = async (path) => {
                    const url = \`http://\${ip}\${path}\`;
                    try {
                        const controller = new AbortController();
                        setTimeout(() => controller.abort(), 2000);
                        const res = await fetch(url, { signal: controller.signal });
                        if(res.ok) return await res.text();
                    } catch(e) {}
                    
                    // Proxy fallback
                    const proxyUrl = 'http://localhost:3001';
                    const res = await fetch(proxyUrl + '/browse', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ url })
                    });
                    if(res.ok) return await res.text();
                    throw new Error('Failed to fetch');
                };

                runtime.logEvent(\`[Auditor] Probing \${ip}...\`);
                const manifestText = await fetchWithFallback('/manifest');
                const manifest = JSON.parse(manifestText);
                const sourceCode = await fetchWithFallback('/source');
                const isSourceMatch = sourceCode.trim() === referenceFirmware.trim();
                
                auditResults.push({
                    ip,
                    status: 'Online',
                    name: manifest.name,
                    version: manifest.version,
                    firmwareMatch: isSourceMatch,
                    license: manifest.license
                });

            } catch (e) {
                auditResults.push({ ip, status: 'Unreachable', error: e.message });
            }
        }
        return { success: true, auditResults };
    `
};

export const FIRMWARE_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Load Smart Hybrid Firmware',
        description: 'Loads the Smart Hybrid firmware v3.1.1 for the FreeEEG8 device. This version supports simultaneous Tri-Link operation (WiFi + BLE + USB Serial), persistent BLE advertising, and dual data streaming with 8-digit unique IDs.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide the current, recommended firmware for development and OTA updates.',
        parameters: [],
        implementationCode: `
            const firmware = ${JSON.stringify(SMART_HYBRID_FIRMWARE_CODE)};
            return { success: true, firmwareCode: firmware };
        `
    },
    {
        name: 'Compile ESP32 Firmware',
        description: 'Compiles Arduino source code for an ESP32-S3 board using a server-side process.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To validate and prepare firmware for over-the-air (OTA) updates.',
        parameters: [
            { name: 'firmwareCode', type: 'string', description: 'The complete Arduino source code to be compiled.', required: true },
            { name: 'boardFQBN', type: 'string', description: 'The fully qualified board name (FQBN) for the target device.', required: false, defaultValue: 'esp32:esp32:esp32s3' }
        ],
        implementationCode: 'compile_firmware'
    },
    {
        name: 'Flash ESP32 Firmware (OTA)',
        description: 'Flashes a compiled firmware binary to an ESP32 device over the air.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To deploy new firmware to a remote ESP32 device without a physical connection.',
        parameters: [
            { name: 'firmwarePath', type: 'string', description: 'The path to the compiled firmware binary on the server.', required: true },
            { name: 'deviceIp', type: 'string', description: 'The IP address of the target ESP32 device.', required: true }
        ],
        implementationCode: 'flash_firmware_ota'
    },
    {
        name: 'Configure WiFi via Bluetooth',
        description: 'Scans for a FreeEEG8 device, connects via BLE, sends Wi-Fi credentials, and waits for a successful IP report.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provision a new device with Wi-Fi credentials directly from the web interface.',
        parameters: [
            { name: 'ssid', type: 'string', description: 'The SSID (name) of the Wi-Fi network.', required: true },
            { name: 'password', type: 'string', description: 'The password for the Wi-Fi network.', required: true },
        ],
        implementationCode: `
            const { ssid, password } = args;
            // v3.1 Firmware UUIDs
            const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
            const SSID_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
            const PASS_UUID = "beb5483f-36e1-4688-b7f5-ea07361b26a8";
            const CMD_UUID = "beb54840-36e1-4688-b7f5-ea07361b26a8";
            const IP_UUID = "beb54841-36e1-4688-b7f5-ea07361b26a8";
            const STATUS_UUID = "beb54842-36e1-4688-b7f5-ea07361b26a8";
            
            if (!navigator.bluetooth) throw new Error("Web Bluetooth API not available.");

            let device;
            try {
                runtime.logEvent('[BLE Provision] Scanning for FreeEEG8...');
                device = await navigator.bluetooth.requestDevice({
                    filters: [{ namePrefix: 'FreeEEG8' }],
                    optionalServices: [SERVICE_UUID]
                });

                if (!device) throw new Error("User cancelled selection.");
                
                const deviceName = device.name;
                runtime.logEvent('[BLE Provision] Connecting to ' + deviceName + '...');
                const server = await device.gatt.connect();
                const service = await server.getPrimaryService(SERVICE_UUID);

                const ssidChar = await service.getCharacteristic(SSID_UUID);
                const passChar = await service.getCharacteristic(PASS_UUID);
                const cmdChar = await service.getCharacteristic(CMD_UUID);
                const ipChar = await service.getCharacteristic(IP_UUID);
                const statusChar = await service.getCharacteristic(STATUS_UUID);

                const encoder = new TextEncoder();
                const decoder = new TextDecoder();

                runtime.logEvent('[BLE Provision] Writing credentials...');
                await ssidChar.writeValue(encoder.encode(ssid));
                await passChar.writeValue(encoder.encode(password));
                
                // Wait for IP
                const ipPromise = new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => reject(new Error("Timed out waiting for IP.")), 25000);
                    
                    const onIpChanged = (event) => {
                         const ip = decoder.decode(event.target.value);
                         if (ip && ip.length > 6) { 
                             clearTimeout(timeoutId);
                             ipChar.removeEventListener('characteristicvaluechanged', onIpChanged);
                             resolve(ip);
                         }
                    };
                    ipChar.addEventListener('characteristicvaluechanged', onIpChanged);
                });
                
                await ipChar.startNotifications();
                await statusChar.startNotifications();

                runtime.logEvent('[BLE Provision] Sending CONNECT command...');
                await cmdChar.writeValue(encoder.encode('CONNECT'));
                
                const ipAddress = await ipPromise;
                runtime.logEvent('✅ [BLE Provision] Success! IP: ' + ipAddress);
                
                // In v3.1 Dual Stack, we can disconnect BLE now, or keep it open.
                // We disconnect to be clean.
                device.gatt.disconnect();

                return { success: true, message: 'Device online. You can now monitor via WiFi + BLE + USB Serial.', deviceName: deviceName, ipAddress: ipAddress };

            } catch (error) {
                throw new Error('Provisioning failed: ' + error.message);
            }
        `
    },
    AUDIT_DEVICE_SWARM
];
