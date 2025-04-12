// Language Handling
document.addEventListener('DOMContentLoaded', function() {
    // Set initial language from URL or session
    const urlParams = new URLSearchParams(window.location.search);
    const lang = urlParams.get('lang') || 'en';
    document.documentElement.lang = lang;
    document.getElementById('language-select').value = lang;
    
    // Initialize Google Translate
    googleTranslateElementInit();
    
    // Load doctors based on default language
    loadDoctors();
});

function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,hi,kn,ta,te',
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE
    }, 'google_translate_element');
}

function changeLanguage(lang) {
    window.location.href = /?lang=${lang};
}

// Doctor Search and Appointment Booking
document.getElementById('doctor-search').addEventListener('submit', function(e) {
    e.preventDefault();
    loadDoctors();
});

function loadDoctors() {
    const healthIssue = document.getElementById('health-issue').value;
    const language = document.getElementById('language').value;
    
    fetch(/get_doctors?specialization=${encodeURIComponent(healthIssue)}&language=${encodeURIComponent(language)})
        .then(response => response.json())
        .then(data => displayDoctors(data))
        .catch(error => console.error('Error:', error));
}

function displayDoctors(doctors) {
    const resultsContainer = document.getElementById('doctor-results');
    resultsContainer.innerHTML = '';
    
    if (doctors.length === 0) {
        resultsContainer.innerHTML = '<p>No doctors found matching your criteria.</p>';
        return;
    }
    
    doctors.forEach(doctor => {
        const doctorCard = document.createElement('div');
        doctorCard.className = 'doctor-card';
        
        const languagesHTML = doctor.languages.split(',').map(lang => 
            <span class="language-tag">${lang.trim()}</span>
        ).join('');
        
        const availabilityHTML = doctor.availability.map(slot => 
            `<span class="time-slot" onclick="selectAppointmentSlot('${slot.day}', '${slot.start_time}', ${doctor.id})">
                ${slot.day}: ${slot.start_time} - ${slot.end_time}
            </span>`
        ).join('');
        
        doctorCard.innerHTML = `
            <h3>${doctor.name}</h3>
            <p class="specialization">${doctor.specialization}</p>
            <div class="languages">${languagesHTML}</div>
            <div class="availability">
                <p>Available Slots:</p>
                ${availabilityHTML}
            </div>
            <button class="book-btn" onclick="showAppointmentForm(${doctor.id})">Book Appointment</button>
        `;
        
        resultsContainer.appendChild(doctorCard);
    });
}

function selectAppointmentSlot(day, time, doctorId) {
    document.getElementById('appointment-date').value = getNextDateForDay(day);
    document.getElementById('appointment-time').value = time.split('-')[0].trim();
    document.getElementById('doctor-id').value = doctorId;
    document.getElementById('appointment-form').style.display = 'block';
    window.scrollTo({
        top: document.getElementById('appointment-form').offsetTop,
        behavior: 'smooth'
    });
}

function getNextDateForDay(dayName) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayIndex = days.indexOf(dayName);
    const today = new Date();
    const todayIndex = today.getDay();
    
    let daysToAdd = dayIndex - todayIndex;
    if (daysToAdd <= 0) daysToAdd += 7;
    
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysToAdd);
    
    return nextDate.toISOString().split('T')[0];
}

function showAppointmentForm(doctorId) {
    document.getElementById('doctor-id').value = doctorId;
    document.getElementById('appointment-form').style.display = 'block';
    window.scrollTo({
        top: document.getElementById('appointment-form').offsetTop,
        behavior: 'smooth'
    });
}

document.getElementById('book-appointment').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = {
        doctor_id: document.getElementById('doctor-id').value,
        date: document.getElementById('appointment-date').value,
        time: document.getElementById('appointment-time').value,
        health_issue: document.getElementById('health-issue-details').value,
        name: document.getElementById('patient-name').value,
        age: document.getElementById('patient-age').value,
        gender: document.getElementById('patient-gender').value,
        phone: document.getElementById('patient-phone').value,
        email: document.getElementById('patient-email').value,
        video_consult: document.getElementById('video-consult').checked,
        emergency: document.getElementById('video-consult').checked
    };
    
    fetch('/book_appointment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Appointment booked successfully!');
            if (formData.video_consult) {
                window.location.href = /video_consult/${data.appointment_id};
            } else {
                window.location.reload();
            }
        }
    })
    .catch(error => console.error('Error:', error));
});

// Voice Assistant
let mediaRecorder;
let audioChunks = [];
const voiceModal = document.getElementById('voice-modal');

function startVoiceAssistant() {
    voiceModal.style.display = 'block';
}

function closeVoiceModal() {
    voiceModal.style.display = 'none';
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function startRecording() {
    const language = document.getElementById('language-select').value;
    const recordBtn = document.getElementById('record-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                sendAudioToServer(audioBlob, language);
            };
            
            mediaRecorder.start();
            recordBtn.disabled = true;
            stopBtn.disabled = false;
        })
        .catch(error => {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please check permissions.');
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('record-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        
        // Stop all tracks in the stream
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

function sendAudioToServer(audioBlob, language) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', language);
    
    fetch('/voice_input', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        const voiceResult = document.getElementById('voice-result');
        if (data.success) {
            voiceResult.innerHTML = <p><strong>You said:</strong> ${data.text}</p>;
            processVoiceCommand(data.text);
        } else {
            voiceResult.innerHTML = <p class="error">Error: ${data.error}</p>;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('voice-result').innerHTML = <p class="error">Error sending audio to server</p>;
    });
}

function processVoiceCommand(text) {
    // Simple voice command processing
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('book appointment') || lowerText.includes('find doctor')) {
        document.getElementById('health-issue').focus();
    } else if (lowerText.includes('emergency')) {
        startEmergencyConsult();
    } else if (lowerText.includes('heart') || lowerText.includes('chest pain')) {
        document.getElementById('health-issue').value = 'Heart';
        loadDoctors();
    } else if (lowerText.includes('diabetes') || lowerText.includes('sugar')) {
        document.getElementById('health-issue').value = 'Diabetes';
        loadDoctors();
    } else if (lowerText.includes('cancel') || lowerText.includes('close')) {
        closeVoiceModal();
    }
}

// Emergency Consultation
function startEmergencyConsult() {
    const healthIssue = prompt('Please describe your emergency health issue:');
    if (healthIssue) {
        document.getElementById('health-issue').value = healthIssue;
        document.getElementById('video-consult').checked = true;
        loadDoctors();
    }
}

// Video Consultation (WebRTC)
let localStream;
let peerConnection;
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('start-call')) {
        setupVideoConsultation();
    }
});

function setupVideoConsultation() {
    const startCallBtn = document.getElementById('start-call');
    const endCallBtn = document.getElementById('end-call');
    const muteAudioBtn = document.getElementById('mute-audio');
    const hideVideoBtn = document.getElementById('hide-video');
    
    startCallBtn.addEventListener('click', startCall);
    endCallBtn.addEventListener('click', endCall);
    muteAudioBtn.addEventListener('click', toggleAudio);
    hideVideoBtn.addEventListener('click', toggleVideo);
    
    // Initialize local video
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            document.getElementById('local-video').srcObject = stream;
        })
        .catch(error => {
            console.error('Error accessing media devices:', error);
            alert('Could not access camera/microphone. Please check permissions.');
        });
}

function startCall() {
    const startCallBtn = document.getElementById('start-call');
    const endCallBtn = document.getElementById('end-call');
    
    startCallBtn.disabled = true;
    endCallBtn.disabled = false;
    
    // In a real application, you would signal the doctor and set up the peer connection
    // This is a simplified version for demonstration
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream to connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Set up remote stream
    peerConnection.ontrack = event => {
        document.getElementById('remote-video').srcObject = event.streams[0];
    };
    
    // Simulate call establishment (in real app, you'd exchange ICE candidates)
    setTimeout(() => {
        document.getElementById('prescription-form').style.display = 'block';
    }, 2000);
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    document.getElementById('remote-video').srcObject = null;
    document.getElementById('start-call').disabled = false;
    document.getElementById('end-call').disabled = true;
}

function toggleAudio() {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        const isMuted = !audioTracks[0].enabled;
        audioTracks[0].enabled = isMuted;
        document.getElementById('mute-audio').textContent = isMuted ? 'Mute' : 'Unmute';
    }
}

function toggleVideo() {
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        const isHidden = !videoTracks[0].enabled;
        videoTracks[0].enabled = isHidden;
        document.getElementById('hide-video').textContent = isHidden ? 'Hide Video' : 'Show Video';
    }
}

// Prescription Upload
if (document.getElementById('upload-prescription')) {
    document.getElementById('upload-prescription').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('appointment_id', document.getElementById('appointment-id').value);
        formData.append('medicines', document.getElementById('medicines').value);
        formData.append('instructions', document.getElementById('instructions').value);
        
        const fileInput = document.getElementById('prescription-file');
        if (fileInput.files.length > 0) {
            formData.append('file', fileInput.files[0]);
        }
        
        fetch('/upload_prescription', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Prescription submitted successfully!');
                window.location.href = '/';
            } else {
                alert('Error submitting prescription: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error submitting prescription');
        });
    });
}