document.addEventListener('DOMContentLoaded', () => {

    const tvControlToggle = document.getElementById('tvControlToggle');
    const distanceControlToggle = document.getElementById('distanceControlToggle');
    const screenTimeSelect = document.getElementById('screenTimeSelect');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const hoursSpan = document.getElementById('hours');
    const minutesSpan = document.getElementById('minutes');
    const secondsSpan = document.getElementById('seconds');
    const objectDistanceSpan = document.getElementById('objectDistance');
    const distanceMessage = document.getElementById('distanceMessage');
    const warningCard = document.getElementById('warningCard');

    let screenTimeInterval; 
    let currentRemainingTime = 0; 
    let isScreenTimerRunning = false; 
    
    let closeDistanceWarningTimer; 
    let closeDistanceDetectedTimeJs = 0; 
    const VISUAL_WARNING_DURATION_JS = 5000; 

    let isDistanceMonitoringActive = false; 
    let isTvOn = false; 
    let currentObjectDistance = 0; 

    function formatTime(seconds) {
        const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return { h, m, s };
    }

    function updateTimerDisplay() {
        const { h, m, s } = formatTime(currentRemainingTime);
        hoursSpan.textContent = h;
        minutesSpan.textContent = m;
        secondsSpan.textContent = s;
    }

    function updateSystemStatusText() {
        console.log(`System Status: TV On: ${isTvOn}, Distance Monitoring Active: ${isDistanceMonitoringActive}, Screen Timer Running: ${isScreenTimerRunning}`);
    }

    async function controlTv(action, reason = '') {
        try {
            const response = await fetch('/api/control_tv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action, reason: reason })
            });
            const data = await response.json();
            console.log('Respon TV Control:', data);

            if (data.tv_on !== undefined) {
                isTvOn = data.tv_on;
                tvControlToggle.checked = isTvOn;
                localStorage.setItem('isTvOn', isTvOn);

                if (!isTvOn) { 
                    isDistanceMonitoringActive = false; 
                    distanceControlToggle.checked = isDistanceMonitoringActive;
                    distanceControlToggle.disabled = true;
                    localStorage.setItem('isDistanceMonitoringActive', false);
                    stopScreenTime(); 
                } else {
                    distanceControlToggle.disabled = false;
                }
            }
        } catch (error) {
            console.error('Error TV Control:', error);
            alert('Gagal mengontrol TV. Periksa koneksi ke server Flask.');
        } finally {
            updateSystemStatusText();
            updateDistanceDisplay();
            closeDistanceDetectedTimeJs = 0; 
            clearTimeout(closeDistanceWarningTimer);
            warningCard.classList.add('hidden');
        }
    }

    async function controlDistanceMonitoring(action) {
        try {
            if (action === 'enable' && !isTvOn) {
                alert('Sistem monitoring tidak dapat diaktifkan saat TV mati. Harap nyalakan TV terlebih dahulu.');
                distanceControlToggle.checked = false;
                isDistanceMonitoringActive = false;
                localStorage.setItem('isDistanceMonitoringActive', false);
                updateSystemStatusText();
                updateDistanceDisplay();
                return;
            }

            const response = await fetch('/api/toggle_sensor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: action })
            });
            const data = await response.json();
            console.log('Respon Distance Control:', data);

            if (data.sensor_active !== undefined) {
                isDistanceMonitoringActive = data.sensor_active;
                distanceControlToggle.checked = isDistanceMonitoringActive;
                localStorage.setItem('isDistanceMonitoringActive', isDistanceMonitoringActive);
            } else {
                isDistanceMonitoringActive = false;
                distanceControlToggle.checked = false;
                localStorage.setItem('isDistanceMonitoringActive', false);
                if (data.message) {
                    alert(data.message);
                }
            }
        } catch (error) {
            console.error('Error Distance Control:', error);
            alert('Gagal mengontrol sensor jarak. Periksa koneksi ke server Flask.');
        } finally {
            updateSystemStatusText();
            updateDistanceDisplay();
            closeDistanceDetectedTimeJs = 0; 
            clearTimeout(closeDistanceWarningTimer);
            warningCard.classList.add('hidden');
        }
    }

    function updateDistanceDisplay() {
        if (isDistanceMonitoringActive) {
            if (currentObjectDistance === -1) {
                objectDistanceSpan.classList.add('hidden');
                distanceMessage.textContent = "Jarak tidak valid (di luar jangkauan)";
                distanceMessage.classList.remove('hidden');
            } else {
                objectDistanceSpan.textContent = currentObjectDistance;
                objectDistanceSpan.classList.remove('hidden');
                distanceMessage.classList.add('hidden');
            }
        } else {
            objectDistanceSpan.classList.add('hidden');
            distanceMessage.textContent = "Sistem monitoring dimatikan";
            distanceMessage.classList.remove('hidden');
        }
    }

    function startScreenTime(initialTimeInSeconds) {
        clearInterval(screenTimeInterval);

        currentRemainingTime = initialTimeInSeconds;
        isScreenTimerRunning = true;
        updateTimerDisplay();
        localStorage.setItem('screenTimeRemaining', currentRemainingTime);
        localStorage.setItem('isScreenTimerRunning', true);

        screenTimeInterval = setInterval(() => {
            if (currentRemainingTime > 0) {
                currentRemainingTime--;
                updateTimerDisplay();
                localStorage.setItem('screenTimeRemaining', currentRemainingTime);
            } else {
                stopScreenTime();
                console.log('Screen Time Selesai! Mematikan TV...');
                controlTv('off', 'screen_time_finished');
            }
        }, 1000);
        updateSystemStatusText();
        console.log(`Memulai Screen Time: ${initialTimeInSeconds / 60} menit (${initialTimeInSeconds} detik)`);
    }

    function stopScreenTime() {
        clearInterval(screenTimeInterval);
        screenTimeInterval = null;
        isScreenTimerRunning = false;
        currentRemainingTime = 0;
        updateTimerDisplay();
        localStorage.removeItem('screenTimeRemaining');
        localStorage.setItem('isScreenTimerRunning', false);
        updateSystemStatusText();
        console.log('Screen Time Dihentikan.');
    }

    tvControlToggle.addEventListener('change', () => {
        const action = tvControlToggle.checked ? 'on' : 'off';
        controlTv(action);
    });

    distanceControlToggle.addEventListener('change', () => {
        const action = distanceControlToggle.checked ? 'enable' : 'disable';
        controlDistanceMonitoring(action);
    });

    startButton.addEventListener('click', () => {
        if (!isTvOn) {
            alert('Screen Time hanya dapat dimulai ketika TV menyala.');
            return;
        }

        const durationMinutes = parseFloat(screenTimeSelect.value);
        
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
            alert('Pilih durasi Screen Time yang valid.');
            return;
        }

        startScreenTime(durationMinutes * 60);
    });

    stopButton.addEventListener('click', () => {
        stopScreenTime();
    });

    async function fetchAndUpdateStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();

            currentObjectDistance = data.current_distance; 
            systemThresholdDistance = data.threshold_distance;

            if (isTvOn !== (data.tv_status === "on")) {
                isTvOn = (data.tv_status === "on");
                tvControlToggle.checked = isTvOn;
                localStorage.setItem('isTvOn', isTvOn);
            }
            if (isDistanceMonitoringActive !== data.sensor_active) {
                isDistanceMonitoringActive = data.sensor_active;
                distanceControlToggle.checked = isDistanceMonitoringActive;
                localStorage.setItem('isDistanceMonitoringActive', isDistanceMonitoringActive);
            }
            if (!isTvOn) {
                distanceControlToggle.disabled = true;
            } else {
                distanceControlToggle.disabled = false;
            }

            if (isDistanceMonitoringActive && isTvOn && currentObjectDistance > 0 && currentObjectDistance < systemThresholdDistance) {
                warningCard.classList.remove('hidden');

                if (closeDistanceDetectedTimeJs === 0) { 
                    closeDistanceDetectedTimeJs = Date.now();
                    console.log('JS: Jarak terlalu dekat! Memulai hitung mundur untuk mematikan TV.');
                } else if ((Date.now() - closeDistanceDetectedTimeJs) >= VISUAL_WARNING_DURATION_JS) {
                    console.log(`JS: Jarak terlalu dekat selama ${VISUAL_WARNING_DURATION_JS / 1000} detik. Mematikan TV.`);
                    controlTv('off', 'distance_warning');
                    closeDistanceDetectedTimeJs = 0;
                    clearTimeout(closeDistanceWarningTimer);
                    warningCard.classList.add('hidden');
                }
            } else {
                if (closeDistanceDetectedTimeJs !== 0) {
                    console.log('JS: Jarak sudah aman kembali. Timer peringatan visual dan pematian TV direset.');
                }
                closeDistanceDetectedTimeJs = 0; 
                clearTimeout(closeDistanceWarningTimer); 
                warningCard.classList.add('hidden'); 
            }
            updateDistanceDisplay();
            updateSystemStatusText();

        } catch (error) {
            console.error('Error fetching status from Flask:', error);
        }
    }

    function loadInitialState() {
        const storedTvOn = localStorage.getItem('isTvOn');
        const storedDistanceActive = localStorage.getItem('isDistanceMonitoringActive');
        const storedScreenTimeRemaining = localStorage.getItem('screenTimeRemaining');
        const storedIsScreenTimerRunning = localStorage.getItem('isScreenTimerRunning');

        isTvOn = (storedTvOn === 'true');
        tvControlToggle.checked = isTvOn;

        isDistanceMonitoringActive = (storedDistanceActive === 'true');
        if (!isTvOn) {
            isDistanceMonitoringActive = false;
        }
        distanceControlToggle.checked = isDistanceMonitoringActive;
        distanceControlToggle.disabled = !isTvOn;

        if (storedIsScreenTimerRunning === 'true' && storedScreenTimeRemaining) {
            currentRemainingTime = parseInt(storedScreenTimeRemaining, 10);
            if (currentRemainingTime > 0) {
                startScreenTime(currentRemainingTime);
            } else {
                stopScreenTime(); 
            }
        } else {
            currentRemainingTime = 0;
            isScreenTimerRunning = false;
            updateTimerDisplay();
        }
    }

    loadInitialState();
    warningCard.classList.add('hidden');
    fetchAndUpdateStatus();
    setInterval(fetchAndUpdateStatus, 1000);
});