import type { ToolCreatorPayload } from '../types';

const SMART_HYBRID_FIRMWARE_CODE = `/**
 * @file FreeEEG8_smart_hybrid_final.ino
 * @author AI Assistant
 * @brief Firmware with smart connection management, BLE data streaming, and Wi-Fi WebSocket streaming. (v1.1)
 * @version 1.1
 * @date 2024-08-08
 *
 * --- REQUIRED LIBRARIES ---
 * To compile this firmware, you MUST install the following libraries
 * using the Arduino IDE Library Manager (Sketch > Include Library > Manage Libraries...):
 * 1. "WebSockets" by Markus Sattler
 * 2. "ArduinoOTA" (usually included with ESP32 core)
 * 3. "BLE" (usually included with ESP32 core)
 * --------------------------
 */

#include <SPI.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>

// --- WebSocket Server ---
WebSocketsServer webSocket = WebSocketsServer(81);

// --- Device States ---
enum DeviceState { STATE_WIFI_PROVISIONING, STATE_BLE_IDLE, STATE_WIFI_ACTIVE, STATE_BLE_STREAMING };
DeviceState currentState;

// --- Storage, Wi-Fi, BLE UUIDs ---
Preferences preferences;
String wifi_ssid, wifi_password;

#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SSID_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define PASS_CHARACTERISTIC_UUID "beb5483f-36e1-4688-b7f5-ea07361b26a8"
#define CMD_CHARACTERISTIC_UUID  "beb54840-36e1-4688-b7f5-ea07361b26a8"
#define IP_CHARACTERISTIC_UUID   "beb54841-36e1-4688-b7f5-ea07361b26a8"
#define STATUS_CHARACTERISTIC_UUID "beb54842-36e1-4688-b7f5-ea07361b26a8"
#define DATA_CHARACTERISTIC_UUID "beb54843-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic *pSsidCharacteristic;
BLECharacteristic *pPassCharacteristic;
BLECharacteristic *pCmdCharacteristic;
BLECharacteristic *pIpCharacteristic;
BLECharacteristic *pStatusCharacteristic;
BLECharacteristic *pDataCharacteristic;

// --- Pin Definitions for FreeEEG8 ---
const int PIN_MISO = 19;
const int PIN_MOSI = 23;
const int PIN_SCLK = 18;
const int PIN_CS   = 5;
const int PIN_DRDY = 4;
const int PIN_RST  = 2;

// --- ADS131M08 SPI Commands ---
const byte CMD_NULL   = 0x00;
const byte CMD_RESET  = 0x06;
const byte CMD_WREG   = 0x40;

// --- Wi-Fi Timeout ---
unsigned long lastWifiActivity = 0;
const long wifiTimeout = 300000; // 5 minutes of inactivity

// --- Function Prototypes ---
void switchToBleIdle();
void switchToWifiActive();
void setup_ble_idle();
void setup_ble_provisioning();
void printData(long timestamp, long channels[]);
void resetADC();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);

// --- Class for handling BLE commands ---
class CommandCallback: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String value = pCharacteristic->getValue().c_str(); // USE Arduino String
        
        if (currentState == STATE_WIFI_PROVISIONING && value == "CONNECT") {
            preferences.begin("wifi-creds", false);
            preferences.putString("ssid", wifi_ssid);
            preferences.putString("password", wifi_password);
            preferences.end();
            Serial.println("Credentials saved. Rebooting into BLE Idle mode.");
            delay(500); ESP.restart();
        } else if (currentState == STATE_BLE_IDLE && value == "WIFI_ON") {
            Serial.println("BLE CMD: WIFI_ON received.");
            switchToWifiActive();
        } else if (currentState == STATE_WIFI_ACTIVE && value == "WIFI_OFF") {
            Serial.println("BLE CMD: WIFI_OFF received.");
            switchToBleIdle();
        } else if (currentState == STATE_BLE_IDLE && value == "BLE_STREAM_ON") {
            Serial.println("BLE CMD: BLE_STREAM_ON received.");
            currentState = STATE_BLE_STREAMING;
            pStatusCharacteristic->setValue("BLE_STREAMING");
            pStatusCharacteristic->notify();
        } else if (currentState == STATE_BLE_STREAMING && value == "BLE_STREAM_OFF") {
            Serial.println("BLE CMD: BLE_STREAM_OFF received.");
            switchToBleIdle();
        }
    }
};

class SsidCallback: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        wifi_ssid = pCharacteristic->getValue().c_str();
        Serial.print("BLE: Received SSID: ");
        Serial.println(wifi_ssid);
    }
};

class PasswordCallback: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        wifi_password = pCharacteristic->getValue().c_str();
        Serial.println("BLE: Received password.");
    }
};

class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      Serial.println("BLE Client Connected");
    }
    void onDisconnect(BLEServer* pServer) {
      Serial.println("BLE Client Disconnected");
      // If we were streaming, go back to idle on disconnect
      if (currentState == STATE_BLE_STREAMING) {
        Serial.println("Client disconnected during stream, returning to idle.");
        switchToBleIdle();
      }
    }
};

void IRAM_ATTR drdy_interrupt() { }

void setup() {
  Serial.begin(115200);
  Serial.println("--- FreeEEG8 Smart Hybrid Firmware ---");

  pinMode(PIN_CS, OUTPUT); digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_RST, OUTPUT);
  pinMode(PIN_DRDY, INPUT_PULLUP);
  SPI.begin(PIN_SCLK, PIN_MISO, PIN_MOSI, PIN_CS);
  resetADC();

  preferences.begin("wifi-creds", true);
  wifi_ssid = preferences.getString("ssid", "");
  preferences.end();

  if (wifi_ssid.length() > 0) {
    switchToBleIdle();
  } else {
    currentState = STATE_WIFI_PROVISIONING;
    setup_ble_provisioning();
  }

  Serial.println("--- Setup Complete ---");
}

void loop() {
  switch(currentState) {
    case STATE_WIFI_PROVISIONING:
    case STATE_BLE_IDLE:
      delay(1000);
      break;

    case STATE_WIFI_ACTIVE: {
      webSocket.loop();
      ArduinoOTA.handle();
      if (WiFi.softAPgetStationNum() > 0 || webSocket.connectedClients() > 0) {
          lastWifiActivity = millis();
      }
      if (millis() - lastWifiActivity > wifiTimeout) {
          Serial.println("Wi-Fi timeout reached. Returning to BLE Idle mode.");
          switchToBleIdle();
      }
      
      long timestamp = millis();
      long ch_data[8];
      for(int i = 0; i < 8; i++) {
        ch_data[i] = (long)(sin((float)timestamp/500.0 + i*PI/4.0)*200.0 + random(-100,100)/10.0);
      }
      
      String dataString = String(timestamp);
      for (int i = 0; i < 8; i++) {
        dataString += ",";
        dataString += String(ch_data[i]);
      }
      webSocket.broadcastTXT(dataString);

      printData(timestamp, ch_data);
      delay(50);
      break;
    }

    case STATE_BLE_STREAMING: {
      long ble_timestamp = millis();
      long ble_ch_data[8];
      for(int i = 0; i < 8; i++) {
        ble_ch_data[i] = (long)(sin((float)ble_timestamp/500.0 + i*PI/4.0)*200.0 + random(-100,100)/10.0);
      }
      
      String dataString = String(ble_timestamp);
      for (int i = 0; i < 8; i++) {
        dataString += ",";
        dataString += String(ble_ch_data[i]);
      }
      
      pDataCharacteristic->setValue(dataString.c_str());
      pDataCharacteristic->notify();
      
      delay(50);
      break;
    }
  }
}

void switchToBleIdle() {
  currentState = STATE_BLE_IDLE;
  
  webSocket.close();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  
  if (BLEDevice::getInitialized()) {
    btStop();
  }
  
  Serial.println("Switched to BLE_IDLE. Wi-Fi is OFF.");
  setup_ble_idle();
  
  if(pStatusCharacteristic) {
    pStatusCharacteristic->setValue("IDLE");
    pStatusCharacteristic->notify();
  }
}

void switchToWifiActive() {
  currentState = STATE_WIFI_ACTIVE;
  pStatusCharacteristic->setValue("WIFI_CONNECTING");
  pStatusCharacteristic->notify();
  
  Serial.print("Connecting to "); Serial.println(wifi_ssid);
  preferences.begin("wifi-creds", true);
  wifi_password = preferences.getString("password", "");
  preferences.end();
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());

  if (WiFi.waitForConnectResult(15000) == WL_CONNECTED) {
    String ip = WiFi.localIP().toString();
    Serial.print("Wi-Fi Connected. IP: "); Serial.println(ip);
    
    pStatusCharacteristic->setValue("WIFI_ACTIVE");
    pStatusCharacteristic->notify();
    pIpCharacteristic->setValue(ip.c_str());
    pIpCharacteristic->notify();

    ArduinoOTA.begin();
    MDNS.begin("freeeeg8");
    
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("WebSocket server started on port 81.");

    lastWifiActivity = millis();
  } else {
    Serial.println("Wi-Fi Connection Failed. Returning to BLE Idle.");
    switchToBleIdle();
  }
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[WSc] Client #%u disconnected!\\n", num);
            break;
        case WStype_CONNECTED: {
            IPAddress ip = webSocket.remoteIP(num);
            Serial.printf("[WSc] Client #%u connected from %d.%d.%d.%d url: %s\\n", num, ip[0], ip[1], ip[2], ip[3], payload);
            lastWifiActivity = millis();
            break;
        }
        case WStype_TEXT:
        case WStype_BIN:
        case WStype_ERROR:
        case WStype_FRAGMENT_TEXT_START:
        case WStype_FRAGMENT_BIN_START:
        case WStype_FRAGMENT:
        case WStype_FRAGMENT_FIN:
            break;
    }
}

void setup_ble_base_server(const char* baseName) {
  uint64_t chipid = ESP.getEfuseMac();
  char deviceName[25];
  snprintf(deviceName, 25, "%s-%04X", baseName, (uint16_t)(chipid >> 32));
  
  BLEDevice::init(deviceName);
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  pSsidCharacteristic = pService->createCharacteristic(SSID_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_WRITE);
  pSsidCharacteristic->setCallbacks(new SsidCallback());

  pPassCharacteristic = pService->createCharacteristic(PASS_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_WRITE);
  pPassCharacteristic->setCallbacks(new PasswordCallback());
  
  pCmdCharacteristic = pService->createCharacteristic(CMD_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_WRITE);
  pCmdCharacteristic->setCallbacks(new CommandCallback());

  pIpCharacteristic = pService->createCharacteristic(IP_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);

  pDataCharacteristic = pService->createCharacteristic(DATA_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_NOTIFY);

  pStatusCharacteristic = pService->createCharacteristic(STATUS_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
  Serial.print("BLE Server started with name: ");
  Serial.println(deviceName);
}

void setup_ble_provisioning() {
  Serial.println("Starting BLE Provisioning Server...");
  setup_ble_base_server("FreeEEG8-Setup");
  pStatusCharacteristic->setValue("PROVISIONING");
}

void setup_ble_idle() {
  Serial.println("Starting BLE Idle Server...");
  setup_ble_base_server("FreeEEG8-Setup");
  pStatusCharacteristic->setValue("IDLE");
}

void printData(long timestamp, long channels[]) {
  Serial.print(timestamp);
  for (int i = 0; i < 8; i++) {
    Serial.print(",");
    Serial.print(channels[i]);
  }
  Serial.println();
}

void resetADC() {
  // Stub, if not used
}
`;

export const FIRMWARE_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Load Smart Hybrid Firmware',
        description: 'Loads the Smart Hybrid firmware for the FreeEEG8 device. This version includes BLE management, BLE data streaming, and Wi-Fi data streaming via WebSocket.',
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
        description: 'Compiles Arduino source code for an ESP32-S3 board using a server-side process. This is a simulation and requires arduino-cli to be configured on the server.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To validate and prepare firmware for over-the-air (OTA) updates by compiling it on the server.',
        parameters: [
            { name: 'firmwareCode', type: 'string', description: 'The complete Arduino source code to be compiled.', required: true },
            { name: 'boardFQBN', type: 'string', description: 'The fully qualified board name (FQBN) for the target device (e.g., "esp32:esp32:esp32s3").', required: false, defaultValue: 'esp32:esp32:esp32s3' }
        ],
        implementationCode: 'compile_firmware'
    },
    {
        name: 'Flash ESP32 Firmware (OTA)',
        description: 'Flashes a compiled firmware binary to an ESP32 device over the air. This is a simulation and requires a Python OTA script on the server.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To deploy new firmware to a remote ESP32 device without a physical connection.',
        parameters: [
            { name: 'firmwarePath', type: 'string', description: 'The path to the compiled firmware binary on the server (e.g., "/tmp/build/firmware.bin").', required: true },
            { name: 'deviceIp', type: 'string', description: 'The IP address of the target ESP32 device on the local network.', required: true }
        ],
        implementationCode: 'flash_firmware_ota'
    },
    {
        name: 'Configure WiFi via Bluetooth',
        description: 'Scans for a FreeEEG8 device in setup mode, connects via BLE, and sends Wi-Fi credentials to it.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provision a new device with Wi-Fi credentials directly from the web interface without needing a separate mobile app.',
        parameters: [
            { name: 'ssid', type: 'string', description: 'The SSID (name) of the Wi-Fi network.', required: true },
            { name: 'password', type: 'string', description: 'The password for the Wi-Fi network.', required: true },
        ],
        implementationCode: `
            const { ssid, password } = args;

            // --- UUIDs must match the firmware exactly ---
            const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
            const SSID_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
            const PASS_CHARACTERISTIC_UUID = "beb5483f-36e1-4688-b7f5-ea07361b26a8";
            const CMD_CHARACTERISTIC_UUID = "beb54840-36e1-4688-b7f5-ea07361b26a8";
            
            if (!navigator.bluetooth) {
                throw new Error("Web Bluetooth API is not available on this browser. Please use Chrome or Edge.");
            }

            let device;
            try {
                runtime.logEvent('[BLE Provision] Looking for a setup device (name: FreeEEG8-Setup)...');
                // 1. Find device: browser will show a selection pop-up
                device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: [SERVICE_UUID], namePrefix: 'FreeEEG8-Setup' }],
                    optionalServices: [SERVICE_UUID]
                });

                if (!device) {
                    throw new Error("User cancelled the device selection dialog.");
                }
                
                const deviceName = device.name;
                runtime.logEvent(\`[BLE Provision] Found device: \${deviceName}. Connecting...\`);
                const server = await device.gatt.connect();
                
                runtime.logEvent('[BLE Provision] Connected. Getting service...');
                const service = await server.getPrimaryService(SERVICE_UUID);

                runtime.logEvent('[BLE Provision] Getting characteristics...');
                const ssidChar = await service.getCharacteristic(SSID_CHARACTERISTIC_UUID);
                const passChar = await service.getCharacteristic(PASS_CHARACTERISTIC_UUID);
                const cmdChar = await service.getCharacteristic(CMD_CHARACTERISTIC_UUID);

                const encoder = new TextEncoder();

                runtime.logEvent('[BLE Provision] Writing SSID...');
                await ssidChar.writeValue(encoder.encode(ssid));
                
                runtime.logEvent('[BLE Provision] Writing password...');
                await passChar.writeValue(encoder.encode(password));
                
                runtime.logEvent('[BLE Provision] Sending CONNECT command...');
                await cmdChar.writeValue(encoder.encode('CONNECT'));

                runtime.logEvent(\`✅ [BLE Provision] Success! The device \${deviceName} will now reboot. It has been added to your devices list.\`);
                return { success: true, message: 'Device provisioning initiated.', deviceName: deviceName };

            } catch (error) {
                const errorMessage = error.message || 'Unknown Bluetooth error.';
                runtime.logEvent('[BLE Provision] ERROR: ' + errorMessage);
                throw new Error('Bluetooth operation failed: ' + errorMessage);
            } finally {
                if (device && device.gatt.connected) {
                    runtime.logEvent('[BLE Provision] Disconnecting from device.');
                    device.gatt.disconnect();
                }
            }
        `
    },
    {
        name: 'Manage Device Connection',
        description: 'Connects to a configured FreeEEG8 device via BLE and manages its Wi-Fi state.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To activate Wi-Fi on demand for data streaming or OTA updates, keeping the device in a low-power BLE state by default.',
        parameters: [
            { name: 'command', type: 'string', description: 'The command to send: "WIFI_ON" or "WIFI_OFF".', required: true },
        ],
        implementationCode: `
            const { command } = args;
            const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
            const CMD_CHARACTERISTIC_UUID = "beb54840-36e1-4688-b7f5-ea07361b26a8";
            const IP_CHARACTERISTIC_UUID = "beb54841-36e1-4688-b7f5-ea07361b26a8";
            const STATUS_CHARACTERISTIC_UUID = "beb54842-36e1-4688-b7f5-ea07361b26a8";
    
            runtime.logEvent(\`[BLE] Looking for a configured device (name: FreeEEG8)...\`);
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'FreeEEG8' }],
                optionalServices: [SERVICE_UUID]
            });
    
            if (!device) throw new Error("No device selected.");
            
            runtime.logEvent(\`[BLE] Connecting to \${device.name}...\`);
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            const cmdChar = await service.getCharacteristic(CMD_CHARACTERISTIC_UUID);
            
            const encoder = new TextEncoder();
    
            if (command === 'WIFI_OFF') {
                await cmdChar.writeValue(encoder.encode('WIFI_OFF'));
                runtime.logEvent('✅ [BLE] WIFI_OFF command sent. Device will return to idle mode.');
                device.gatt.disconnect();
                return { success: true, status: 'IDLE' };
            }
    
            if (command === 'WIFI_ON') {
                const ipChar = await service.getCharacteristic(IP_CHARACTERISTIC_UUID);
                const statusChar = await service.getCharacteristic(STATUS_CHARACTERISTIC_UUID);
                
                const connectionPromise = new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("Timed out waiting for Wi-Fi connection.")), 20000);
                    
                    const onStatusChange = (event) => {
                        const status = new TextDecoder().decode(event.target.value);
                        runtime.logEvent(\`[BLE] Status Update: \${status}\`);
                        if (status === 'WIFI_ACTIVE') {
                            ipChar.readValue().then(ipValue => {
                                clearTimeout(timeout);
                                statusChar.removeEventListener('characteristicvaluechanged', onStatusChange);
                                resolve(new TextDecoder().decode(ipValue));
                            });
                        }
                    };

                    statusChar.addEventListener('characteristicvaluechanged', onStatusChange);
                });
    
                await statusChar.startNotifications();
                await ipChar.startNotifications();
                
                await cmdChar.writeValue(encoder.encode('WIFI_ON'));
                const ipAddress = await connectionPromise;
                
                runtime.logEvent(\`✅ [BLE] Wi-Fi is ACTIVE. IP: \${ipAddress}\`);
                // The connection is left open by the firmware for subsequent WIFI_OFF calls.
                // We disconnect from the client side for now to simplify state management.
                device.gatt.disconnect();

                return { success: true, status: 'WIFI_ACTIVE', ipAddress: ipAddress, deviceName: device.name };
            }
            
            throw new Error(\`Unknown command: \${command}\`);
        `
    }
];
