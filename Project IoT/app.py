from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

is_sensor_active = False
threshold_jarak = 10 
is_tv_on = False         
current_distance = 0 

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/update_distance', methods=['POST'])
def update_distance():
    global current_distance

    data = request.get_json()
    received_distance = data.get('distance')

    if received_distance is not None:
        current_distance = int(received_distance)
        print(f"[Flask] Menerima jarak dari ESP32: {current_distance} cm")
        return jsonify(message="Jarak berhasil diperbarui"), 200
    return jsonify(message="Data tidak valid"), 400

@app.route('/api/control_tv', methods=['POST'])
def control_tv():
    global is_tv_on, is_sensor_active 

    data = request.get_json()
    action = data.get('action')
    reason = data.get('reason', 'manual_control')

    if action == 'on':
        is_tv_on = True
        print(f"[Flask] Perintah: Menyalakan TV ({reason})")
        return jsonify(message="Televisi dinyalakan!", tv_on=is_tv_on)
    elif action == 'off':
        is_tv_on = False
        is_sensor_active = False
        print(f"[Flask] Perintah: Mematikan TV ({reason}) & Sensor dinonaktifkan.")
        return jsonify(message="Televisi dimatikan & Sensor dinonaktifkan.", tv_on=is_tv_on, sensor_active=is_sensor_active)
    return jsonify(message="Aksi TV tidak valid."), 400

@app.route('/api/toggle_sensor', methods=['POST'])
def toggle_sensor():
    global is_sensor_active, is_tv_on 

    data = request.get_json()
    status = data.get('status')

    if status == 'enable':
        if is_tv_on:
            is_sensor_active = True
            print("[Flask] Sensor monitoring jarak diaktifkan.")
            return jsonify(message="Sensor monitoring jarak diaktifkan.", sensor_active=is_sensor_active)
        else:
            print("[Flask] Gagal mengaktifkan sensor: TV sedang mati.")
            return jsonify(message="Sensor hanya bisa diaktifkan saat TV menyala.", sensor_active=False), 400
    elif status == 'disable':
        is_sensor_active = False
        print("[Flask] Sensor monitoring jarak dinonaktifkan.")
        return jsonify(message="Sensor monitoring jarak dinonaktifkan.", sensor_active=is_sensor_active)
    return jsonify(message="Status sensor tidak valid."), 400

@app.route('/api/get_esp32_status', methods=['GET'])
def get_esp32_status():
    global is_sensor_active, is_tv_on, threshold_jarak 
    return jsonify({
        'tv_on': is_tv_on, 
        'distance_monitoring_active': is_sensor_active, 
        'threshold_distance': threshold_jarak
    })

@app.route('/api/status', methods=['GET'])
def get_status_for_frontend():
    global is_sensor_active, threshold_jarak, is_tv_on, current_distance
    return jsonify({
        'sensor_active': is_sensor_active,
        'threshold_distance': threshold_jarak,
        'tv_status': "on" if is_tv_on else "off", 
        'current_distance': current_distance
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
