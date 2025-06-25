#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

const char* ssid = "Biznet";
const char* password = "11223344";

const char* vercelAppHost = "tubesiot-one.vercel.app";

const int trigPin = 5;
const int echoPin = 18;
const int relayPin = 23;

bool currentTvStatus = false;
bool currentSensorActive = false;

unsigned long lastDistanceSendTime = 0;
const long distanceSendInterval = 500;

unsigned long lastStatusFetchTime = 0;
const long statusFetchInterval = 1000;

int systemThresholdDistance;

WiFiClientSecure client;

void setup() {
    Serial.begin(115200);

    pinMode(trigPin, OUTPUT);
    pinMode(echoPin, INPUT);
    pinMode(relayPin, OUTPUT);

    digitalWrite(relayPin, HIGH);
    currentTvStatus = false;
    Serial.println("Relay diset OFF (TV mati) saat booting.");

    Serial.print("Menghubungkan ke WiFi...");
    WiFi.begin(ssid, password);
    unsigned long connectStartTime = millis();
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        if (millis() - connectStartTime > 20000) {
            Serial.println("\nKoneksi WiFi GAGAL! Memulai ulang...");
            ESP.restart();
        }
    }
    Serial.println("\nTerhubung ke WiFi!");
    Serial.print("Alamat IP ESP32: ");
    Serial.println(WiFi.localIP());
    Serial.println("Sistem monitoring jarak aman dimulai.");
    
    client.setInsecure(); 

    fetchAndUpdateStatusFromFlask();
}

long getDistanceCm() {
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    long duration = pulseIn(echoPin, HIGH);
    long distanceCm = duration * 0.034 / 2;

    if (distanceCm > 400 || distanceCm < 2) {
        return -1;
    }
    return distanceCm;
}

void setTvRelayState(bool turnOn) {
    if (turnOn && !currentTvStatus) {
        digitalWrite(relayPin, LOW);
        currentTvStatus = true;
        Serial.println("ESP32: Mengaktifkan TV (Relay ON).");
    } else if (!turnOn && currentTvStatus) {
        digitalWrite(relayPin, HIGH);
        currentTvStatus = false;
        Serial.println("ESP32: Mematikan TV (Relay OFF).");
    }
}

void sendDistanceToFlask(long distance) {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        // Gunakan begin() dengan client dan URL lengkap
        String serverPath = String("https://") + String(vercelAppHost) + "/api/update_distance";
        http.begin(client, serverPath);

        http.addHeader("Content-Type", "application/json");

        String httpRequestData = "{\"distance\": " + String(distance) + "}";

        Serial.print("Mengirim jarak: ");
        Serial.print(distance);
        Serial.print("cm ke ");
        Serial.println(serverPath);

        int httpResponseCode = http.POST(httpRequestData);

        if (httpResponseCode > 0) {
            String payload = http.getString();
            Serial.printf("POST /api/update_distance Response (%d): %s\n", httpResponseCode, payload.c_str());
        } else {
            Serial.printf("Error POST /api/update_distance: %d - %s\n", httpResponseCode, http.errorToString(httpResponseCode).c_str());
        }
        http.end();
    } else {
        Serial.println("WiFi tidak terhubung, gagal mengirim jarak.");
    }
}

void fetchAndUpdateStatusFromFlask() {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        
        String serverPath = String("https://") + String(vercelAppHost) + "/api/get_esp32_status";
        http.begin(client, serverPath); 
        
        Serial.print("Mengambil status dari ");
        Serial.println(serverPath);

        int httpResponseCode = http.GET();

        if (httpResponseCode > 0) {
            String payload = http.getString();
            Serial.printf("GET /api/get_esp32_status Response (%d): %s\n", httpResponseCode, payload.c_str());

            StaticJsonDocument<256> doc;
            DeserializationError error = deserializeJson(doc, payload);

            if (error) {
                Serial.print(F("deserializeJson() gagal: "));
                Serial.println(error.f_str());
                return;
            }

            bool tv_on_from_flask = doc["tv_on"];
            bool sensor_active_from_flask = doc["distance_monitoring_active"];
            systemThresholdDistance = doc["threshold_distance"] | 10;

            setTvRelayState(tv_on_from_flask);
            currentSensorActive = sensor_active_from_flask;
            Serial.printf("Status diperbarui dari Vercel: TV %s, Sensor %s, Threshold %d cm\n",
                          currentTvStatus ? "ON" : "OFF",
                          currentSensorActive ? "AKTIF" : "NONAKTIF",
                          systemThresholdDistance);
        } else {
            Serial.printf("Error GET /api/get_esp32_status: %d - %s\n", httpResponseCode, http.errorToString(httpResponseCode).c_str());
        }
        http.end();
    } else {
        Serial.println("WiFi tidak terhubung, gagal mengambil status.");
    }
}

void loop() {
    if (millis() - lastStatusFetchTime >= statusFetchInterval) {
        fetchAndUpdateStatusFromFlask();
        lastStatusFetchTime = millis();
    }

    if (currentSensorActive && currentTvStatus && millis() - lastDistanceSendTime >= distanceSendInterval) {
        long currentDistance = getDistanceCm();
        if (currentDistance != -1) {
            sendDistanceToFlask(currentDistance);
        } else {
            Serial.println("Jarak tidak valid, tidak dikirim.");
        }
        lastDistanceSendTime = millis();
    }
    delay(10);
}
