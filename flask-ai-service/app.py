#!/usr/bin/env python3
"""
MediScan Flask AI Service
Medical document processing with OCR, text extraction, and AI analysis
"""

import os
import logging
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
import tempfile
import traceback

from flask import Flask, request, jsonify
import requests
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Optional imports with graceful fallbacks
try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    pytesseract = None
    PYTESSERACT_AVAILABLE = False
    
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    PIL_AVAILABLE = False
    
try:
    import pdf2image
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    pdf2image = None
    PDF2IMAGE_AVAILABLE = False
    
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    cv2 = None
    np = None
    CV2_AVAILABLE = False
    
try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    pipeline = None
    TRANSFORMERS_AVAILABLE = False
    
try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    spacy = None
    SPACY_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.getenv('LOG_FILE', 'mediscan_ai.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def check_tesseract_availability():
    """Check if Tesseract OCR is available and working."""
    try:
        if not PYTESSERACT_AVAILABLE:
            return False
        version = pytesseract.get_tesseract_version()
        return version is not None and 'tesseract' in str(version).lower()
    except Exception:
        return False

# Initialize Flask app
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 16 * 1024 * 1024))  # 16MB default max file size

# Configuration
CONFIG = {
    'SECRET_KEY': os.getenv('AI_SERVICE_SECRET', 'default-secret-change-in-production'),
    'TEMP_DIR': os.getenv('TEMP_DIR', '/tmp/mediscan'),
    'OCR_LANGUAGE': os.getenv('OCR_LANGUAGE', 'eng'),
    'MODEL_CACHE_DIR': os.getenv('MODEL_CACHE_DIR', './models'),
    'MAX_PROCESSING_TIME': int(os.getenv('MAX_PROCESSING_TIME', '300')),  # 5 minutes
    'SUPPORTED_FORMATS': ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp'],
    'DPI': int(os.getenv('OCR_DPI', '300')),
}

# Create temp directory
Path(CONFIG['TEMP_DIR']).mkdir(parents=True, exist_ok=True)

# Initialize AI models with graceful fallbacks
nlp_model = None
medical_ner = None

if SPACY_AVAILABLE:
    try:
        # Load NLP model for medical text processing
        nlp_model = spacy.load("en_core_web_sm")
        logger.info("Loaded spaCy model successfully")
    except OSError:
        logger.warning("spaCy model not found. Install with: python -m spacy download en_core_web_sm")
        nlp_model = None
else:
    logger.warning("spaCy not available. Text analysis will use basic patterns.")

if TRANSFORMERS_AVAILABLE:
    try:
        # This would use a medical NER model in production
        medical_ner = pipeline("ner", model="dbmdz/bert-large-cased-finetuned-conll03-english")
        logger.info("Loaded medical NER model successfully")
    except Exception as e:
        logger.warning(f"Failed to load NER model: {e}")
        medical_ner = None
else:
    logger.warning("Transformers not available. Entity extraction will use pattern matching.")

def verify_signature(payload: bytes, signature: str) -> bool:
    """Verify HMAC signature from backend service."""
    try:
        expected_signature = hmac.new(
            CONFIG['SECRET_KEY'].encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected_signature)
    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return False

def send_callback(callback_url: str, payload: dict) -> bool:
    """Send processing results back to the backend via callback."""
    try:
        logger.info(f"Sending callback to: {callback_url}")
        
        # Generate HMAC signature for the callback (must match backend's expectation)
        payload_bytes = json.dumps(payload).encode()
        signature = hmac.new(
            CONFIG['SECRET_KEY'].encode(),
            payload_bytes,
            hashlib.sha256
        ).hexdigest()
        
        response = requests.post(
            callback_url,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'X-Signature': signature,
                'User-Agent': 'MediScan-AI-Service/1.0'
            },
            timeout=30
        )
        
        response.raise_for_status()
        logger.info(f"Callback sent successfully. Status: {response.status_code}")
        return True
        
    except Exception as e:
        logger.error(f"Callback failed: {e}")
        return False

def extract_text_from_image(image_path: str) -> Dict[str, Any]:
    """Extract text from image using OCR."""
    try:
        logger.info(f"Starting OCR processing for: {image_path}")
        
        # Check if required libraries are available
        if not PYTESSERACT_AVAILABLE:
            logger.error("Pytesseract is not available. Please install tesseract-ocr and pytesseract.")
            return {
                'text': '',
                'confidence': 0.0,
                'word_count': 0,
                'words_with_positions': [],
                'error': 'OCR library not available'
            }
        
        if not CV2_AVAILABLE:
            logger.error("OpenCV is not available. Please install opencv-python.")
            return {
                'text': '',
                'confidence': 0.0,
                'word_count': 0,
                'words_with_positions': [],
                'error': 'Computer vision library not available'
            }
        
        # Load and preprocess image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Could not load image")
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply noise reduction
        denoised = cv2.medianBlur(gray, 3)
        
        # Apply thresholding
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # OCR configuration
        custom_config = f'--oem 3 --psm 6 -l {CONFIG["OCR_LANGUAGE"]}'
        
        # Extract text with confidence scores
        ocr_data = pytesseract.image_to_data(
            thresh, 
            config=custom_config,
            output_type=pytesseract.Output.DICT
        )
        
        # Extract plain text
        text = pytesseract.image_to_string(thresh, config=custom_config)
        
        # Calculate average confidence
        confidences = [int(conf) for conf in ocr_data['conf'] if int(conf) > 0]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        # Extract word positions
        words_with_positions = []
        for i, word in enumerate(ocr_data['text']):
            if word.strip() and int(ocr_data['conf'][i]) > 30:  # Filter low confidence
                words_with_positions.append({
                    'text': word,
                    'confidence': int(ocr_data['conf'][i]),
                    'x': int(ocr_data['left'][i]),
                    'y': int(ocr_data['top'][i]),
                    'width': int(ocr_data['width'][i]),
                    'height': int(ocr_data['height'][i])
                })
        
        logger.info(f"OCR completed. Text length: {len(text)}, Confidence: {avg_confidence:.2f}")
        
        return {
            'text': text.strip(),
            'confidence': avg_confidence / 100.0,  # Normalize to 0-1
            'word_count': len(text.split()),
            'words_with_positions': words_with_positions,
            'image_dimensions': {
                'width': image.shape[1],
                'height': image.shape[0]
            }
        }
        
    except Exception as e:
        logger.error(f"OCR processing error: {e}")
        return {
            'text': '',
            'confidence': 0.0,
            'word_count': 0,
            'words_with_positions': [],
            'error': str(e)
        }

def process_pdf(pdf_path: str) -> List[Dict[str, Any]]:
    """Process PDF file and extract text from all pages."""
    try:
        logger.info(f"Processing PDF: {pdf_path}")
        
        # Convert PDF to images
        images = pdf2image.convert_from_path(
            pdf_path,
            dpi=CONFIG['DPI'],
            first_page=1,
            last_page=10  # Limit to first 10 pages for performance
        )
        
        pages_data = []
        for page_num, image in enumerate(images, 1):
            # Save temporary image
            temp_image_path = os.path.join(
                CONFIG['TEMP_DIR'], 
                f"temp_page_{page_num}_{int(time.time())}.png"
            )
            
            try:
                image.save(temp_image_path, 'PNG')
                
                # Process page
                page_result = extract_text_from_image(temp_image_path)
                page_result['page_number'] = page_num
                pages_data.append(page_result)
                
            finally:
                # Clean up temp file
                if os.path.exists(temp_image_path):
                    os.unlink(temp_image_path)
        
        logger.info(f"PDF processing completed. {len(pages_data)} pages processed")
        return pages_data
        
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        return [{'text': '', 'confidence': 0.0, 'error': str(e)}]

def extract_medical_entities(text: str) -> Dict[str, List[Dict[str, Any]]]:
    """Extract medical entities from text using NLP models."""
    try:
        if not text or not nlp_model:
            return {
                'vitals': [],
                'medications': [],
                'lab_results': [],
                'diagnoses': [],
                'procedures': []
            }
        
        # Process text with spaCy
        doc = nlp_model(text)
        
        # Extract basic entities
        entities = []
        for ent in doc.ents:
            entities.append({
                'text': ent.text,
                'label': ent.label_,
                'start': ent.start_char,
                'end': ent.end_char,
                'confidence': 0.8  # Placeholder confidence
            })
        
        # Medical-specific extraction (simplified for demo)
        vitals = extract_vitals(text)
        medications = extract_medications(text)
        lab_results = extract_lab_results(text)
        diagnoses = extract_diagnoses(text)
        procedures = extract_procedures(text)
        
        return {
            'vitals': vitals,
            'medications': medications,
            'lab_results': lab_results,
            'diagnoses': diagnoses,
            'procedures': procedures,
            'general_entities': entities
        }
        
    except Exception as e:
        logger.error(f"Medical entity extraction error: {e}")
        return {
            'vitals': [],
            'medications': [],
            'lab_results': [],
            'diagnoses': [],
            'procedures': [],
            'error': str(e)
        }

def extract_vitals(text: str) -> List[Dict[str, Any]]:
    """Extract vital signs from text."""
    vitals = []
    
    # Blood pressure patterns
    import re
    bp_pattern = r'(\d{2,3})/(\d{2,3})\s*(?:mmHg|mm\s*Hg)?'
    bp_matches = re.finditer(bp_pattern, text, re.IGNORECASE)
    
    for match in bp_matches:
        systolic = int(match.group(1))
        diastolic = int(match.group(2))
        
        # Determine status
        if systolic >= 140 or diastolic >= 90:
            status = 'high'
        elif systolic < 90 or diastolic < 60:
            status = 'low'
        else:
            status = 'normal'
        
        vitals.append({
            'name': 'blood_pressure',
            'value': f"{systolic}/{diastolic}",
            'unit': 'mmHg',
            'systolic': systolic,
            'diastolic': diastolic,
            'status': status,
            'confidence': 0.9,
            'position': {
                'start': match.start(),
                'end': match.end()
            }
        })
    
    # Heart rate patterns
    hr_pattern = r'(?:HR|heart rate|pulse)[\s:]*(\d{2,3})\s*(?:bpm|beats?/min|/min)?'
    hr_matches = re.finditer(hr_pattern, text, re.IGNORECASE)
    
    for match in hr_matches:
        hr_value = int(match.group(1))
        
        # Determine status
        if hr_value > 100:
            status = 'high'
        elif hr_value < 60:
            status = 'low'
        else:
            status = 'normal'
        
        vitals.append({
            'name': 'heart_rate',
            'value': str(hr_value),
            'unit': 'bpm',
            'status': status,
            'confidence': 0.85,
            'position': {
                'start': match.start(),
                'end': match.end()
            }
        })
    
    # Temperature patterns
    temp_pattern = r'(?:temp|temperature)[\s:]*(\d{2,3}(?:\.\d)?)\s*(?:°?F|°?C|fahrenheit|celsius)?'
    temp_matches = re.finditer(temp_pattern, text, re.IGNORECASE)
    
    for match in temp_matches:
        temp_value = float(match.group(1))
        
        # Assume Fahrenheit if > 50, else Celsius
        unit = 'F' if temp_value > 50 else 'C'
        
        # Determine status (assuming Fahrenheit)
        if unit == 'F':
            if temp_value > 100.4:
                status = 'high'
            elif temp_value < 96:
                status = 'low'
            else:
                status = 'normal'
        else:  # Celsius
            if temp_value > 38:
                status = 'high'
            elif temp_value < 35.5:
                status = 'low'
            else:
                status = 'normal'
        
        vitals.append({
            'name': 'temperature',
            'value': str(temp_value),
            'unit': f'°{unit}',
            'status': status,
            'confidence': 0.8,
            'position': {
                'start': match.start(),
                'end': match.end()
            }
        })
    
    return vitals

def extract_medications(text: str) -> List[Dict[str, Any]]:
    """Extract medications from text."""
    medications = []
    
    # Common medication patterns
    med_patterns = [
        r'(?:taking|prescribed|medication|drug|rx)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg)'
    ]
    
    import re
    for pattern in med_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        
        for match in matches:
            med_name = match.group(1).strip()
            dosage = match.group(2) if len(match.groups()) > 1 else None
            unit = match.group(3) if len(match.groups()) > 2 else None
            
            medications.append({
                'name': med_name,
                'dosage': dosage,
                'unit': unit,
                'confidence': 0.75,
                'position': {
                    'start': match.start(),
                    'end': match.end()
                }
            })
    
    return medications

def extract_lab_results(text: str) -> List[Dict[str, Any]]:
    """Extract laboratory results from text."""
    lab_results = []
    
    # Common lab value patterns
    lab_patterns = [
        r'(?:glucose|blood sugar)[\s:]*(\d+(?:\.\d+)?)\s*(mg/dl|mmol/l)?',
        r'(?:cholesterol|chol)[\s:]*(\d+(?:\.\d+)?)\s*(mg/dl|mmol/l)?',
        r'(?:hemoglobin|hgb|hb)[\s:]*(\d+(?:\.\d+)?)\s*(g/dl|g/l)?',
        r'(?:white blood cell|wbc)[\s:]*(\d+(?:\.\d+)?)\s*(k/ul|×10³/ul)?'
    ]
    
    import re
    for pattern in lab_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        
        for match in matches:
            test_name = match.group(0).split()[0]  # First word
            value = match.group(1)
            unit = match.group(2) if len(match.groups()) > 1 else None
            
            lab_results.append({
                'test': test_name.lower(),
                'value': value,
                'unit': unit or 'unknown',
                'confidence': 0.8,
                'position': {
                    'start': match.start(),
                    'end': match.end()
                }
            })
    
    return lab_results

def extract_diagnoses(text: str) -> List[Dict[str, Any]]:
    """Extract diagnoses from text."""
    diagnoses = []
    
    # Diagnosis patterns
    diag_patterns = [
        r'(?:diagnosis|dx|diagnosed with)[\s:]*([A-Z][a-z]+(?:\s+[a-z]+)*)',
        r'(?:impression|assessment)[\s:]*([A-Z][a-z]+(?:\s+[a-z]+)*)'
    ]
    
    import re
    for pattern in diag_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        
        for match in matches:
            diagnosis = match.group(1).strip()
            
            diagnoses.append({
                'primary': diagnosis,
                'confidence': 0.7,
                'position': {
                    'start': match.start(),
                    'end': match.end()
                }
            })
    
    return diagnoses

def extract_procedures(text: str) -> List[Dict[str, Any]]:
    """Extract medical procedures from text."""
    procedures = []
    
    # Procedure patterns
    proc_patterns = [
        r'(?:procedure|surgery|operation)[\s:]*([A-Z][a-z]+(?:\s+[a-z]+)*)',
        r'(?:performed|completed)[\s:]*([A-Z][a-z]+(?:\s+[a-z]+)*)'
    ]
    
    import re
    for pattern in proc_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        
        for match in matches:
            procedure = match.group(1).strip()
            
            procedures.append({
                'name': procedure,
                'confidence': 0.7,
                'position': {
                    'start': match.start(),
                    'end': match.end()
                }
            })
    
    return procedures

def generate_summary(extracted_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate clinician-friendly summary from extracted data."""
    try:
        vitals = extracted_data.get('vitals', [])
        medications = extracted_data.get('medications', [])
        lab_results = extracted_data.get('lab_results', [])
        diagnoses = extracted_data.get('diagnoses', [])
        procedures = extracted_data.get('procedures', [])
        
        # Key findings
        key_findings = []
        abnormal_values = []
        
        # Analyze vitals
        for vital in vitals:
            if vital.get('status') in ['high', 'low', 'critical']:
                key_findings.append(f"{vital['name'].replace('_', ' ').title()}: {vital['value']} {vital.get('unit', '')} ({vital['status']})")
                abnormal_values.append({
                    'parameter': vital['name'].replace('_', ' ').title(),
                    'value': f"{vital['value']} {vital.get('unit', '')}",
                    'severity': vital['status'],
                    'recommendation': f"Monitor {vital['name'].replace('_', ' ')} closely"
                })
        
        # Analyze lab results
        for lab in lab_results:
            key_findings.append(f"{lab['test'].title()}: {lab['value']} {lab.get('unit', '')}")
        
        # Patient info extraction (basic)
        patient_info = {
            'name': 'Not specified',
            'age': None,
            'gender': None,
            'mrn': None
        }
        
        # Recommended actions
        recommended_actions = []
        if abnormal_values:
            recommended_actions.append("Follow up on abnormal vital signs")
        if medications:
            recommended_actions.append("Review current medications")
        if not recommended_actions:
            recommended_actions.append("Continue routine monitoring")
        
        # Overall risk assessment
        high_risk_indicators = sum(1 for val in abnormal_values if val['severity'] in ['high', 'critical'])
        
        if high_risk_indicators >= 2:
            risk_level = 'high'
        elif high_risk_indicators == 1:
            risk_level = 'moderate'
        else:
            risk_level = 'low'
        
        return {
            'patient_info': patient_info,
            'key_findings': key_findings[:10],  # Limit to top 10
            'abnormal_values': abnormal_values,
            'clinician_notes': f"Document processed with {len(vitals)} vitals, {len(medications)} medications, and {len(lab_results)} lab results identified.",
            'recommended_actions': recommended_actions,
            'overall_risk': {
                'level': risk_level,
                'factors': [val['parameter'] for val in abnormal_values if val['severity'] in ['high', 'critical']]
            }
        }
        
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return {
            'patient_info': {'name': 'Error processing'},
            'key_findings': [],
            'abnormal_values': [],
            'clinician_notes': f"Error generating summary: {str(e)}",
            'recommended_actions': ["Manual review required"],
            'overall_risk': {'level': 'unknown', 'factors': []}
        }

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'success': True,
        'message': 'MediScan AI Service is healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'models': {
            'nlp': nlp_model is not None,
            'medical_ner': medical_ner is not None,
            'ocr': check_tesseract_availability()
        }
    })

@app.route('/internal/ai/process-text', methods=['POST'])
def process_extracted_text():
    """Process already extracted text from medical documents."""
    start_time = time.time()
    
    try:
        # Verify HMAC signature
        signature = request.headers.get('X-Signature')
        if not signature:
            logger.warning("Missing signature in request")
            return jsonify({
                'success': False,
                'message': 'Missing signature',
                'code': 'MISSING_SIGNATURE'
            }), 403
        
        if not verify_signature(request.data, signature):
            logger.warning("Invalid signature in request")
            return jsonify({
                'success': False,
                'message': 'Invalid signature',
                'code': 'INVALID_SIGNATURE'
            }), 403
        
        # Parse request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'No JSON data provided',
                'code': 'NO_DATA'
            }), 400
        
        job_id = data.get('jobId')
        file_id = data.get('fileId')
        extracted_text = data.get('extractedText')
        file_name = data.get('fileName', 'unknown')
        callback_url = data.get('callbackUrl')
        
        if not all([job_id, file_id, extracted_text, callback_url]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields',
                'code': 'MISSING_FIELDS',
                'required': ['jobId', 'fileId', 'extractedText', 'callbackUrl']
            }), 400
        
        logger.info(f"Processing extracted text for job {job_id}, file {file_id}")
        logger.info(f"Text length: {len(extracted_text)} characters")
        
        # Process the extracted text directly
        processing_result = process_medical_text(extracted_text, file_name)
        
        # Prepare result payload
        result_payload = {
            'jobId': job_id,
            'fileId': file_id,
            'fileName': file_name,
            'status': 'completed',
            'processingTime': time.time() - start_time,
            'extractedText': extracted_text[:1000] + '...' if len(extracted_text) > 1000 else extracted_text,
            'textLength': len(extracted_text),
            'analysis': processing_result,
            'timestamp': datetime.now().isoformat(),
            'processingMethod': 'text_direct'
        }
        
        # Send callback
        try:
            callback_response = send_callback(callback_url, result_payload)
            logger.info(f"Callback sent successfully for job {job_id}")
        except Exception as callback_error:
            logger.error(f"Callback failed for job {job_id}: {callback_error}")
            # Continue processing even if callback fails
        
        processing_time = time.time() - start_time
        logger.info(f"Text processing completed for job {job_id} in {processing_time:.2f}s")
        
        return jsonify({
            'success': True,
            'message': 'Text processed successfully',
            'data': {
                'jobId': job_id,
                'processingTime': processing_time,
                'textLength': len(extracted_text),
                'analysisComplete': True
            }
        })
        
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"Text processing error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Send error callback if possible
        try:
            if 'callback_url' in locals() and 'job_id' in locals():
                error_payload = {
                    'jobId': job_id,
                    'status': 'failed',
                    'error': str(e),
                    'processingTime': processing_time,
                    'timestamp': datetime.now().isoformat()
                }
                send_callback(callback_url, error_payload)
        except:
            pass
        
        return jsonify({
            'success': False,
            'message': 'Text processing failed',
            'code': 'PROCESSING_ERROR',
            'error': str(e)
        }), 500

def process_medical_text(text: str, filename: str) -> Dict[str, Any]:
    """Process medical text and extract structured information."""
    try:
        logger.info(f"Starting medical text analysis for {filename}")
        
        # Extract various medical components
        entities = extract_medical_entities(text)
        vitals = extract_vitals(text)
        medications = extract_medications(text)
        lab_results = extract_lab_results(text)
        diagnoses = extract_diagnoses(text)
        procedures = extract_procedures(text)
        
        # Generate summary
        summary = generate_medical_summary(text, {
            'entities': entities,
            'vitals': vitals,
            'medications': medications,
            'lab_results': lab_results,
            'diagnoses': diagnoses,
            'procedures': procedures
        })
        
        # Classify document type
        doc_type = classify_document_type(text)
        
        # Calculate confidence score based on extracted information
        confidence_score = calculate_confidence_score(entities, vitals, medications, lab_results, diagnoses, procedures)
        
        result = {
            'documentType': doc_type,
            'confidence': confidence_score,
            'summary': summary,
            'entities': entities,
            'vitals': vitals,
            'medications': medications,
            'labResults': lab_results,
            'diagnoses': diagnoses,
            'procedures': procedures,
            'statistics': {
                'totalEntities': sum(len(entities[key]) for key in entities),
                'totalVitals': len(vitals),
                'totalMedications': len(medications),
                'totalLabResults': len(lab_results),
                'totalDiagnoses': len(diagnoses),
                'totalProcedures': len(procedures)
            },
            'processingInfo': {
                'textLength': len(text),
                'wordCount': len(text.split()),
                'processingMethod': 'nlp_analysis',
                'timestamp': datetime.now().isoformat()
            }
        }
        
        logger.info(f"Medical text analysis completed successfully")
        return result
        
    except Exception as e:
        logger.error(f"Medical text processing error: {e}")
        return {
            'error': str(e),
            'documentType': 'unknown',
            'confidence': 0.0,
            'summary': 'Processing failed',
            'entities': {},
            'vitals': [],
            'medications': [],
            'labResults': [],
            'diagnoses': [],
            'procedures': []
        }

def generate_medical_summary(text: str, analysis_data: Dict) -> Dict[str, str]:
    """Generate a comprehensive medical summary."""
    try:
        # Extract key information for summary
        entities = analysis_data.get('entities', {})
        vitals = analysis_data.get('vitals', [])
        medications = analysis_data.get('medications', [])
        lab_results = analysis_data.get('lab_results', [])
        diagnoses = analysis_data.get('diagnoses', [])
        procedures = analysis_data.get('procedures', [])
        
        # Patient information
        patient_info = "Patient information extracted from document."
        if 'PERSON' in entities and entities['PERSON']:
            patient_info = f"Patient: {', '.join([p['text'] for p in entities['PERSON'][:2]])}"
        
        # Key findings
        key_findings = []
        if diagnoses:
            key_findings.append(f"Diagnoses: {', '.join([d['diagnosis'] for d in diagnoses[:3]])}")
        if vitals:
            vital_summary = ', '.join([f"{v['vital']}: {v['value']}" for v in vitals[:3]])
            key_findings.append(f"Vital signs: {vital_summary}")
        if lab_results:
            lab_summary = ', '.join([f"{l['test']}: {l['value']}" for l in lab_results[:3]])
            key_findings.append(f"Lab results: {lab_summary}")
        
        # Treatment information
        treatment_info = "No specific treatment information extracted."
        if medications:
            med_list = ', '.join([m['medication'] for m in medications[:3]])
            treatment_info = f"Medications: {med_list}"
        if procedures:
            proc_list = ', '.join([p['procedure'] for p in procedures[:2]])
            if treatment_info.startswith("No specific"):
                treatment_info = f"Procedures: {proc_list}"
            else:
                treatment_info += f"; Procedures: {proc_list}"
        
        # Overall summary
        overall_summary = f"Medical document analysis shows {len(diagnoses)} diagnoses, {len(medications)} medications, and {len(lab_results)} lab results."
        
        return {
            'patient': patient_info,
            'keyFindings': '; '.join(key_findings) if key_findings else "No key findings extracted.",
            'treatment': treatment_info,
            'overall': overall_summary,
            'recommendedActions': generate_recommendations(analysis_data)
        }
        
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return {
            'patient': 'Unable to extract patient information',
            'keyFindings': 'Unable to extract key findings',
            'treatment': 'Unable to extract treatment information',
            'overall': f'Summary generation failed: {str(e)}',
            'recommendedActions': 'Please review document manually'
        }

def generate_recommendations(analysis_data: Dict) -> str:
    """Generate recommendations based on analysis."""
    try:
        recommendations = []
        
        vitals = analysis_data.get('vitals', [])
        lab_results = analysis_data.get('lab_results', [])
        medications = analysis_data.get('medications', [])
        
        # Check for abnormal vitals
        for vital in vitals:
            if vital.get('status') == 'abnormal':
                recommendations.append(f"Monitor {vital['vital']} - currently {vital['value']}")
        
        # Check for abnormal lab results
        abnormal_labs = [lab for lab in lab_results if lab.get('status') == 'abnormal']
        if abnormal_labs:
            recommendations.append(f"Follow up on {len(abnormal_labs)} abnormal lab result(s)")
        
        # Medication review
        if len(medications) > 5:
            recommendations.append("Consider medication review due to multiple prescriptions")
        
        if not recommendations:
            recommendations.append("Continue regular monitoring and follow-up as scheduled")
        
        return '; '.join(recommendations[:3])  # Limit to top 3 recommendations
        
    except Exception as e:
        logger.error(f"Recommendation generation error: {e}")
        return "Unable to generate recommendations"

def classify_document_type(text: str) -> str:
    """Classify the type of medical document."""
    text_lower = text.lower()
    
    # Check for specific document types
    if 'prescription' in text_lower or 'rx:' in text_lower:
        return 'prescription'
    elif 'lab result' in text_lower or 'laboratory' in text_lower:
        return 'lab_report'
    elif 'discharge' in text_lower and 'summary' in text_lower:
        return 'discharge_summary'
    elif 'radiology' in text_lower or 'x-ray' in text_lower or 'mri' in text_lower:
        return 'radiology_report'
    elif 'pathology' in text_lower or 'biopsy' in text_lower:
        return 'pathology_report'
    elif 'consultation' in text_lower or 'visit' in text_lower:
        return 'consultation_note'
    elif 'insurance' in text_lower or 'coverage' in text_lower:
        return 'insurance_document'
    else:
        return 'general_medical'

def calculate_confidence_score(entities, vitals, medications, lab_results, diagnoses, procedures) -> float:
    """Calculate confidence score based on extracted information."""
    try:
        total_items = (
            sum(len(entities[key]) for key in entities) +
            len(vitals) + len(medications) + len(lab_results) + 
            len(diagnoses) + len(procedures)
        )
        
        # Base confidence on amount of structured data extracted
        if total_items >= 10:
            return 0.95
        elif total_items >= 5:
            return 0.80
        elif total_items >= 2:
            return 0.65
        elif total_items >= 1:
            return 0.50
        else:
            return 0.30
            
    except Exception:
        return 0.40

@app.route('/internal/ai/process', methods=['POST'])
def process_document():
    """Main endpoint for processing medical documents."""
    start_time = time.time()
    
    try:
        # Verify HMAC signature
        signature = request.headers.get('X-Signature')
        if not signature:
            logger.warning("Missing signature in request")
            return jsonify({
                'success': False,
                'message': 'Missing signature',
                'code': 'MISSING_SIGNATURE'
            }), 403
        
        if not verify_signature(request.data, signature):
            logger.warning("Invalid signature in request")
            return jsonify({
                'success': False,
                'message': 'Invalid signature',
                'code': 'INVALID_SIGNATURE'
            }), 403
        
        # Parse request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'No JSON data provided',
                'code': 'NO_DATA'
            }), 400
        
        job_id = data.get('jobId')
        file_id = data.get('fileId')
        file_url = data.get('fileUrl')
        file_name = data.get('fileName', 'unknown')
        mime_type = data.get('mimeType', 'application/octet-stream')
        callback_url = data.get('callbackUrl')
        
        if not all([job_id, file_id, file_url, callback_url]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields',
                'code': 'MISSING_FIELDS',
                'required': ['jobId', 'fileId', 'fileUrl', 'callbackUrl']
            }), 400
        
        logger.info(f"Processing job {job_id} for file {file_id}")
        
        # Download file
        try:
            response = requests.get(file_url, timeout=30)
            response.raise_for_status()
            
            file_extension = Path(file_name).suffix.lower().lstrip('.')
            if file_extension not in CONFIG['SUPPORTED_FORMATS']:
                raise ValueError(f"Unsupported file format: {file_extension}")
            
            # Save to temporary file
            temp_file_path = os.path.join(
                CONFIG['TEMP_DIR'],
                f"{job_id}_{secure_filename(file_name)}"
            )
            
            with open(temp_file_path, 'wb') as f:
                f.write(response.content)
            
            logger.info(f"Downloaded file: {temp_file_path}")
            
        except Exception as e:
            logger.error(f"File download error: {e}")
            return jsonify({
                'success': False,
                'message': 'Failed to download file',
                'code': 'DOWNLOAD_ERROR',
                'error': str(e)
            }), 400
        
        try:
            # Process file based on type
            if file_extension == 'pdf':
                pages_data = process_pdf(temp_file_path)
                # Combine all pages text
                combined_text = '\n\n'.join([page.get('text', '') for page in pages_data])
                ocr_confidence = sum([page.get('confidence', 0) for page in pages_data]) / len(pages_data) if pages_data else 0
                word_count = sum([page.get('word_count', 0) for page in pages_data])
                page_count = len(pages_data)
            else:
                # Image file
                ocr_result = extract_text_from_image(temp_file_path)
                combined_text = ocr_result.get('text', '')
                ocr_confidence = ocr_result.get('confidence', 0)
                word_count = ocr_result.get('word_count', 0)
                page_count = 1
            
            # Extract medical entities
            extracted_entities = extract_medical_entities(combined_text)
            
            # Generate summary
            summary = generate_summary(extracted_entities)
            
            # Calculate quality metrics
            document_quality = 'excellent' if ocr_confidence > 0.9 else 'good' if ocr_confidence > 0.7 else 'fair' if ocr_confidence > 0.5 else 'poor'
            
            processing_time = int((time.time() - start_time) * 1000)
            
            # Prepare results
            results = {
                'ocrText': combined_text,
                'extractedEntities': extracted_entities,
                'summary': summary,
                'qualityMetrics': {
                    'ocrConfidence': ocr_confidence,
                    'extractionConfidence': 0.8,  # Placeholder
                    'documentQuality': document_quality,
                    'processingTime': processing_time,
                    'wordCount': word_count,
                    'pageCount': page_count
                },
                'flags': []
            }
            
            # Add quality flags
            if ocr_confidence < 0.6:
                results['flags'].append({
                    'type': 'quality_issue',
                    'message': 'Low OCR confidence detected',
                    'severity': 'warning',
                    'details': {'confidence': ocr_confidence}
                })
            
            if word_count < 10:
                results['flags'].append({
                    'type': 'missing_data',
                    'message': 'Very little text extracted',
                    'severity': 'warning',
                    'details': {'word_count': word_count}
                })
            
            # Send results back to backend
            callback_payload = {
                'jobId': job_id,
                'fileId': file_id,
                'status': 'completed',
                'results': results,
                'metadata': {
                    'processingTime': processing_time,
                    'serviceVersion': '1.0.0',
                    'modelVersion': 'tesseract-5.0',
                    'timestamp': datetime.utcnow().isoformat()
                }
            }
            
            # Generate HMAC signature for callback (must match backend's expectation)
            callback_signature = hmac.new(
                CONFIG['SECRET_KEY'].encode(),
                json.dumps(callback_payload).encode(),
                hashlib.sha256
            ).hexdigest()
            
            # Send callback
            try:
                callback_response = requests.post(
                    callback_url,
                    json=callback_payload,
                    headers={
                        'Content-Type': 'application/json',
                        'X-Signature': callback_signature,
                        'User-Agent': 'MediScan-AI-Service/1.0'
                    },
                    timeout=30
                )
                callback_response.raise_for_status()
                logger.info(f"Callback sent successfully for job {job_id}")
                
            except Exception as e:
                logger.error(f"Callback failed for job {job_id}: {e}")
                # Don't return error to client, as processing was successful
            
            logger.info(f"Processing completed for job {job_id} in {processing_time}ms")
            
            return jsonify({
                'success': True,
                'message': 'Processing completed successfully',
                'jobId': job_id,
                'processingTime': processing_time
            })
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                try:
                    os.unlink(temp_file_path)
                    logger.debug(f"Cleaned up temp file: {temp_file_path}")
                except Exception as e:
                    logger.warning(f"Failed to clean up temp file: {e}")
        
    except Exception as e:
        logger.error(f"Processing error: {e}\n{traceback.format_exc()}")
        
        # Send failure callback if possible
        try:
            if 'job_id' in locals() and 'callback_url' in locals():
                failure_payload = {
                    'jobId': job_id,
                    'fileId': file_id,
                    'status': 'failed',
                    'error': {
                        'code': 'PROCESSING_ERROR',
                        'message': str(e)
                    },
                    'metadata': {
                        'processingTime': int((time.time() - start_time) * 1000),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                }
                
                failure_signature = hmac.new(
                    CONFIG['SECRET_KEY'].encode(),
                    json.dumps(failure_payload, separators=(',', ':')).encode(),
                    hashlib.sha256
                ).hexdigest()
                
                requests.post(
                    callback_url,
                    json=failure_payload,
                    headers={
                        'Content-Type': 'application/json',
                        'X-Signature': failure_signature,
                        'User-Agent': 'MediScan-AI-Service/1.0'
                    },
                    timeout=30
                )
        except:
            pass  # Ignore callback errors on failure
        
        return jsonify({
            'success': False,
            'message': 'Processing failed',
            'code': 'PROCESSING_ERROR',
            'error': str(e)
        }), 500

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        'success': False,
        'message': 'File too large',
        'code': 'FILE_TOO_LARGE',
        'maxSize': '16MB'
    }), 413

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({
        'success': False,
        'message': 'Internal server error',
        'code': 'INTERNAL_ERROR'
    }), 500

@app.route('/api/analyze-text', methods=['POST'])
def analyze_text():
    """Simple text analysis endpoint that takes text and returns summary with insights."""
    try:
        # Get request data
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'message': 'Text field is required',
                'code': 'MISSING_TEXT'
            }), 400
        
        text = data['text']
        
        if not text or len(text.strip()) == 0:
            return jsonify({
                'success': False,
                'message': 'Text cannot be empty',
                'code': 'EMPTY_TEXT'
            }), 400
        
        logger.info(f"Processing text analysis request - Length: {len(text)} characters")
        
        # Basic text analysis
        word_count = len(text.split())
        sentence_count = len([s for s in text.split('.') if s.strip()])
        char_count = len(text)
        
        # Simple medical keyword detection
        medical_keywords = [
            'patient', 'doctor', 'hospital', 'medicine', 'diagnosis', 'treatment', 
            'prescription', 'symptoms', 'pain', 'fever', 'blood', 'pressure',
            'heart', 'lung', 'kidney', 'liver', 'brain', 'surgery', 'therapy',
            'medication', 'dose', 'mg', 'ml', 'tablet', 'capsule'
        ]
        
        found_keywords = []
        text_lower = text.lower()
        for keyword in medical_keywords:
            if keyword in text_lower:
                found_keywords.append(keyword)
        
        # Generate simple summary (first 200 characters + "...")
        summary = text[:200] + "..." if len(text) > 200 else text
        
        # Medical entity extraction using spaCy if available
        entities = []
        if SPACY_AVAILABLE and nlp_model:
            try:
                doc = nlp_model(text)
                for ent in doc.ents:
                    if ent.label_ in ['PERSON', 'ORG', 'DATE', 'CARDINAL', 'MONEY']:
                        entities.append({
                            'text': ent.text,
                            'label': ent.label_,
                            'start': ent.start_char,
                            'end': ent.end_char
                        })
            except Exception as e:
                logger.warning(f"Entity extraction failed: {e}")
        
        # Generate insights
        insights = []
        
        if word_count > 100:
            insights.append("Document contains substantial medical information")
        elif word_count < 20:
            insights.append("Document appears to be brief or incomplete")
        
        if len(found_keywords) > 5:
            insights.append(f"High medical content detected ({len(found_keywords)} medical terms found)")
        elif len(found_keywords) > 0:
            insights.append(f"Medical content detected ({len(found_keywords)} medical terms found)")
        else:
            insights.append("Limited medical terminology detected")
        
        if any(word in text_lower for word in ['urgent', 'emergency', 'critical', 'severe']):
            insights.append("Document may indicate urgent medical condition")
        
        if any(word in text_lower for word in ['prescription', 'dosage', 'medication', 'mg', 'ml']):
            insights.append("Document contains prescription or medication information")
        
        # Response
        result = {
            'success': True,
            'message': 'Text analysis completed successfully',
            'data': {
                'summary': summary,
                'insights': insights,
                'statistics': {
                    'word_count': word_count,
                    'sentence_count': sentence_count,
                    'character_count': char_count,
                    'medical_keywords_found': len(found_keywords)
                },
                'medical_keywords': found_keywords[:10],  # Limit to first 10
                'entities': entities[:20],  # Limit to first 20 entities
                'analysis_timestamp': datetime.utcnow().isoformat(),
                'processing_time_ms': 0  # Would be calculated in real implementation
            }
        }
        
        logger.info(f"Text analysis completed - {word_count} words, {len(insights)} insights generated")
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error in text analysis: {e}")
        return jsonify({
            'success': False,
            'message': 'Text analysis failed',
            'code': 'ANALYSIS_ERROR',
            'error': str(e)
        }), 500

if __name__ == '__main__':
    logger.info("Starting MediScan AI Service")
    logger.info(f"Temp directory: {CONFIG['TEMP_DIR']}")
    logger.info(f"Supported formats: {', '.join(CONFIG['SUPPORTED_FORMATS'])}")
    logger.info(f"OCR language: {CONFIG['OCR_LANGUAGE']}")
    
    # Check dependencies
    logger.info(f"Pytesseract available: {PYTESSERACT_AVAILABLE}")
    logger.info(f"OpenCV available: {CV2_AVAILABLE}")
    logger.info(f"PIL available: {PIL_AVAILABLE}")
    logger.info(f"PDF2Image available: {PDF2IMAGE_AVAILABLE}")
    
    if PYTESSERACT_AVAILABLE and check_tesseract_availability():
        logger.info("✅ Tesseract OCR is ready")
    else:
        logger.warning("⚠️  Tesseract OCR may not be available")
    
    # Run Flask app
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', 5001)),
        debug=False,
        threaded=True
    )