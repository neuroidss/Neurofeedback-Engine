
import type { ToolCreatorPayload } from '../types';

const SMART_HYBRID_FIRMWARE_CODE = `/**
 * @file FreeEEG8_Hardware_S3.ino
 * @author Synergy Forge
 * @brief Firmware v6.1: XIAO ESP32-S3 + ADS131M08 Hardware Driver
 * 
 * Integrates real hardware SPI reading with the Agentic Manifest system.
 */

#include <SPI.h>
#include <Arduino.h>
#include <WiFi.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <Preferences.h>
#include <driver/ledc.h>

// --- HARDWARE PINOUT (XIAO ESP32S3) ---
#define PIN_CS    1
#define PIN_DRDY  2
#define PIN_RST   3
#define PIN_CLKIN 4
#define PIN_SCK   7
#define PIN_MISO  8
#define PIN_MOSI  9

// --- ADS131 SETTINGS ---
#define SPI_SPEED 4000000
#define MCLK_FREQ 4000000 

// --- MANIFEST (The "Self" of the Device) ---
const char* DEVICE_MANIFEST = R"JSON(
{
  "meta": {
    "name": "FreeEEG8-S3-Hardware",
    "version": "6.1.0",
    "hardware": "XIAO_ESP32S3 + ADS131M08",
    "description": "8-Channel 24-bit EEG Streaming Device"
  },
  "interfaces": {
    "wifi": { "endpoints": ["/manifest"] },
    "ble": { "service_uuid": "4fafc201-1fb5-459e-8fcc-c5c9c331914b" },
    "serial": { "baud": 115200 }
  }
}
)JSON";

// --- GLOBALS ---
volatile bool data_ready = false;
SPIClass *vspi = NULL;
bool streaming = false;
int32_t eegData[8];

// Connectivity
BLEServer* pServer = NULL;
BLECharacteristic* pDataChar = NULL;
bool deviceConnected = false;
Preferences preferences;
WebSocketsServer webSocket = WebSocketsServer(81);
WebServer server(80);
bool wifiConnected = false;

// --- INTERRUPT ---
void IRAM_ATTR on_drdy() {
    data_ready = true;
}

// --- ADS131 DRIVER CLASS ---
class ADS131_Driver {
public:
    void begin() {
        // 1. Pins
        pinMode(PIN_CS, OUTPUT);
        pinMode(PIN_RST, OUTPUT);
        pinMode(PIN_DRDY, INPUT_PULLUP);
        digitalWrite(PIN_CS, HIGH);
        digitalWrite(PIN_RST, LOW);

        // 2. Clock Generation (MCLK)
        // Using ledcSetup (v2) style for broader compatibility, maps to ledcAttach in v3
        ledcSetup(0, MCLK_FREQ, 2); 
        ledcAttachPin(PIN_CLKIN, 0);
        ledcWrite(0, 2); // 50% duty

        delay(50);
        digitalWrite(PIN_RST, HIGH);
        delay(50);

        // 3. SPI Init
        vspi = new SPIClass(FSPI);
        vspi->begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);

        // 4. Config Sequence
        // Unlock
        writeReg(0x0655, 0x00);
        delay(10);
        
        // CLOCK: OSR=1024 (0x0FFE for OSR 1024 + Ch Enabled)
        // User's rescue code used 0x0FFE.
        writeReg(0x03, 0x0FFE);
        
        // MODE: 24-bit (0x0510)
        writeReg(0x02, 0x0510);
        
        // GAIN: 32 (User requested) -> 0x5555 for GAIN1 and GAIN2
        // ADS131 gain map: 1=0, 2=1, 4=2, 8=3, 16=4, 32=5, 64=6, 128=7
        // 0x5555 means all nibbles are 5 (Gain 32)
        writeReg(0x04, 0x5555); 
        writeReg(0x05, 0x5555);

        // WAKEUP
        writeReg(0x0033, 0x00);

        attachInterrupt(digitalPinToInterrupt(PIN_DRDY), on_drdy, FALLING);
        Serial.println("[Hardware] ADS131 Initialized.");
    }

    void writeReg(uint16_t addr, uint16_t val) {
        // Command structure: 0x6000 | (RegAddr << 7)
        // Unless it's a command like UNLOCK (addr itself is opcode)
        // User's code handled this logic:
        uint16_t opcode = 0;
        if (addr < 0x40) {
             // It is a register address, build Write command
             opcode = 0x6000 | (addr << 7);
        } else {
             // It is a direct command (like UNLOCK 0x0655)
             opcode = addr;
        }

        vspi->beginTransaction(SPISettings(SPI_SPEED, MSBFIRST, SPI_MODE1));
        digitalWrite(PIN_CS, LOW);
        vspi->transfer16(opcode);
        vspi->transfer16(val); // Payload (or 0x0000 for commands)
        // Read trailing words if needed? ADS131 is frame based. 
        // For config, we usually just send command and ignore rest of frame or toggle CS.
        digitalWrite(PIN_CS, HIGH);
        vspi->endTransaction();
        delayMicroseconds(20); 
    }

    bool read(int32_t* out) {
        if (!data_ready) return false;
        data_ready = false;

        vspi->beginTransaction(SPISettings(SPI_SPEED, MSBFIRST, SPI_MODE1));
        digitalWrite(PIN_CS, LOW);

        // Frame: Status (24b) + 8 Channels (24b each)
        // Total 9 words * 3 bytes = 27 bytes.
        uint8_t buf[27];
        
        // Transfer 0x00 to read data
        vspi->transferBytes(NULL, buf, 27);

        digitalWrite(PIN_CS, HIGH);
        vspi->endTransaction();

        // Parse (Skip first 3 bytes status)
        for (int i = 0; i < 8; i++) {
            int off = 3 + (i * 3);
            // MSB First
            int32_t val = (buf[off] << 16) | (buf[off+1] << 8) | buf[off+2];
            
            // Sign Extension for 24-bit
            if (val & 0x800000) {
                val |= 0xFF000000;
            }
            out[i] = val;
        }
        return true;
    }
};

ADS131_Driver adc;

// --- BLE SETUP ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; };
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; BLEDevice::startAdvertising(); }
};

class CmdCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pChar) {
        String val = pChar->getValue().c_str();
        if (val == "STREAM_ON") streaming = true;
        if (val == "STREAM_OFF") streaming = false;
        
        // --- AGENTIC PROVISIONING HOOK ---
        if (val == "CONNECT") {
             // In a real scenario, we read the SSID/PASS chars here
             // For this hybrid code, we assume they were written before CONNECT
        }
    }
};

void setup() {
    Serial.begin(115200);
    
    // 1. Start ADC
    adc.begin();

    // 2. Start BLE
    BLEDevice::init("FreeEEG8-S3");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());
    BLEService *pService = pServer->createService("4fafc201-1fb5-459e-8fcc-c5c9c331914b"); // SERVICE_UUID
    
    // Command Char
    BLECharacteristic *pCmd = pService->createCharacteristic("beb54840-36e1-4688-b7f5-ea07361b26a8", BLECharacteristic::PROPERTY_WRITE);
    pCmd->setCallbacks(new CmdCallbacks());
    
    // Data Char
    pDataChar = pService->createCharacteristic("beb54843-36e1-4688-b7f5-ea07361b26a8", BLECharacteristic::PROPERTY_NOTIFY);
    pDataChar->addDescriptor(new BLE2902());
    
    // SSID/PASS Chars (for provisioning)
    pService->createCharacteristic("beb5483e-36e1-4688-b7f5-ea07361b26a8", BLECharacteristic::PROPERTY_WRITE);
    pService->createCharacteristic("beb5483f-36e1-4688-b7f5-ea07361b26a8", BLECharacteristic::PROPERTY_WRITE);
    
    // Manifest Char (Agent Discovery)
    BLECharacteristic *pManifest = pService->createCharacteristic("beb54844-36e1-4688-b7f5-ea07361b26a8", BLECharacteristic::PROPERTY_READ);
    pManifest->setValue(DEVICE_MANIFEST);

    pService->start();
    BLEDevice::startAdvertising();
    
    // 3. WiFi (Try connect if saved)
    preferences.begin("wifi-creds", true);
    String ssid = preferences.getString("ssid", "");
    String pass = preferences.getString("password", "");
    preferences.end();
    
    if (ssid.length() > 0) {
        WiFi.begin(ssid.c_str(), pass.c_str());
        // Don't block, just let loop handle it
    }
    
    server.on("/manifest", HTTP_GET, []() { server.send(200, "application/json", DEVICE_MANIFEST); });
    server.begin();
    webSocket.begin();
}

void loop() {
    // Serial Command Handler (Agent Discovery)
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\\n');
        cmd.trim();
        if (cmd == "STREAM_ON") streaming = true;
        else if (cmd == "STREAM_OFF") streaming = false;
        else if (cmd == "GET_MANIFEST") Serial.println(DEVICE_MANIFEST);
    }

    // WiFi Maintenance
    if (WiFi.status() == WL_CONNECTED) {
        if (!wifiConnected) {
            wifiConnected = true;
            Serial.println("IP:" + WiFi.localIP().toString());
        }
        webSocket.loop();
        server.handleClient();
    }

    // ADC Loop
    if (adc.read(eegData)) {
        if (streaming || (deviceConnected && streaming) || webSocket.connectedClients() > 0) {
            String packet = String(millis());
            for(int i=0; i<8; i++) {
                packet += ",";
                packet += String(eegData[i]);
            }
            
            if (streaming) Serial.println(packet);
            
            if (deviceConnected && streaming) {
                pDataChar->setValue(packet.c_str());
                pDataChar->notify();
            }
            
            if (wifiConnected && webSocket.connectedClients() > 0) {
                webSocket.broadcastTXT(packet);
            }
        }
    }
}
`;

const AUDIT_DEVICE_SWARM: ToolCreatorPayload = {
    name: 'Audit Swarm Hardware',
    description: "Connects to a list of devices via their introspection endpoints (/manifest, /schematic) and retrieves their firmware version and capabilities.",
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable the agent to audit the hardware capabilities of the swarm by reading the self-hosted manifests.',
    parameters: [
        { name: 'deviceIps', type: 'array', description: 'An array of IP address strings for the devices to audit.', required: true },
    ],
    implementationCode: `
        const { deviceIps } = args;
        const auditResults = [];

        runtime.logEvent(\`[Auditor] Starting audit of \${deviceIps.length} devices...\`);

        for (const ip of deviceIps) {
            try {
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
                
                auditResults.push({
                    ip,
                    status: 'Online',
                    name: manifest.meta?.name || 'Unknown',
                    version: manifest.meta?.version || 'Unknown',
                    capabilities: manifest.interfaces
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
        description: 'Loads the Cyber-Physical Agent Firmware v6.1 (Rescue Edition). This version includes the REAL hardware drivers for the ADS131M08 via SPI, matched to the FreeEEG8 schematics (XIAO ESP32S3).',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide working firmware that reads real EEG data.',
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
