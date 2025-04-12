from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from werkzeug.utils import secure_filename
import speech_recognition as sr
from googletrans import Translator

app = Flask(_name_)
app.secret_key = 'your_secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///appointments.db'
app.config['UPLOAD_FOLDER'] = 'static/prescriptions'
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'png', 'jpg', 'jpeg'}

db = SQLAlchemy(app)
translator = Translator()

# Database Models
class Doctor(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    specialization = db.Column(db.String(100), nullable=False)
    languages = db.Column(db.String(200), nullable=False)
    availability = db.relationship('Availability', backref='doctor', lazy=True)

class Availability(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey('doctor.id'), nullable=False)
    day = db.Column(db.String(20), nullable=False)
    start_time = db.Column(db.String(10), nullable=False)
    end_time = db.Column(db.String(10), nullable=False)

class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(10), nullable=False)
    phone = db.Column(db.String(15), nullable=False)
    email = db.Column(db.String(100))
    language = db.Column(db.String(20), default='English')

class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient.id'), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey('doctor.id'), nullable=False)
    date = db.Column(db.String(20), nullable=False)
    time = db.Column(db.String(10), nullable=False)
    health_issue = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='Scheduled')
    emergency = db.Column(db.Boolean, default=False)
    video_consult = db.Column(db.Boolean, default=False)

class Prescription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'), nullable=False)
    medicines = db.Column(db.Text, nullable=False)
    instructions = db.Column(db.Text)
    file_path = db.Column(db.String(200))

# Initialize database
with app.app_context():
    db.create_all()

# Helper Functions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def translate_text(text, dest_language):
    try:
        translation = translator.translate(text, dest=dest_language)
        return translation.text
    except:
        return text

# Routes
@app.route('/')
def home():
    language = request.args.get('lang', 'en')
    return render_template('index.html', language=language)

@app.route('/set_language', methods=['POST'])
def set_language():
    language = request.form.get('language', 'en')
    session['language'] = language
    return redirect(url_for('home', lang=language))

@app.route('/get_doctors', methods=['GET'])
def get_doctors():
    specialization = request.args.get('specialization')
    language = request.args.get('language', 'English')
    
    if specialization:
        doctors = Doctor.query.filter(Doctor.specialization.ilike(f'%{specialization}%')).all()
    else:
        doctors = Doctor.query.all()
    
    doctors_data = []
    for doctor in doctors:
        if language in doctor.languages:
            availabilities = [{
                'day': avail.day,
                'start_time': avail.start_time,
                'end_time': avail.end_time
            } for avail in doctor.availability]
            
            doctors_data.append({
                'id': doctor.id,
                'name': doctor.name,
                'specialization': doctor.specialization,
                'languages': doctor.languages,
                'availability': availabilities
            })
    
    return jsonify(doctors_data)

@app.route('/book_appointment', methods=['POST'])
def book_appointment():
    data = request.form
    language = session.get('language', 'en')
    
    # Create or update patient
    patient = Patient(
        name=data['name'],
        age=data['age'],
        gender=data['gender'],
        phone=data['phone'],
        email=data.get('email', ''),
        language=language
    )
    db.session.add(patient)
    db.session.commit()
    
    # Create appointment
    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=data['doctor_id'],
        date=data['date'],
        time=data['time'],
        health_issue=data['health_issue'],
        emergency=data.get('emergency', 'false') == 'true',
        video_consult=data.get('video_consult', 'false') == 'true'
    )
    db.session.add(appointment)
    db.session.commit()
    
    return jsonify({'success': True, 'appointment_id': appointment.id})

@app.route('/video_consult/<int:appointment_id>')
def video_consult(appointment_id):
    appointment = Appointment.query.get_or_404(appointment_id)
    if appointment.video_consult:
        return render_template('video_consult.html', appointment=appointment)
    return redirect(url_for('home'))

@app.route('/upload_prescription', methods=['POST'])
def upload_prescription():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'})
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        prescription = Prescription(
            appointment_id=request.form['appointment_id'],
            medicines=request.form['medicines'],
            instructions=request.form['instructions'],
            file_path=filepath
        )
        db.session.add(prescription)
        db.session.commit()
        
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Invalid file type'})

@app.route('/voice_input', methods=['POST'])
def voice_input():
    language = request.form.get('language', 'en')
    audio_file = request.files['audio']
    
    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(audio_file) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data, language=language)
            return jsonify({'success': True, 'text': text})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if _name_ == '_main_':
    app.run(debug=True)