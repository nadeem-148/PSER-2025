// PSER Survey Mobile-Compatible Version with IndexedDB
let surveyManager;

class PSERSurvey {
    constructor() {
        this.database = null;
        this.surveys = [];
        this.currentEditId = null;
        this.currentLocation = null;
        this.currentPhoto = null;
        this.currentSignature = null;
        this.defaultBlockCode = "162030416";
        this.isDrawing = false;
        this.deferredPrompt = null;
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        console.log('Initializing PSER Survey with Database...');
        
        // Initialize database first
        await this.initDatabase();
        
        setTimeout(() => {
            this.bindEvents();
            this.setupAutoCalculations();
            this.setupInputFormats();
            this.setupSignatureCanvas();
            this.setupBackupRestore();
            this.setupPWAInstall();
            this.setDefaultBlockCode();
            
            // Request location permission on first open
            this.requestLocationPermissionOnStart();
            
            console.log('PSER Survey initialized successfully with Database');
        }, 100);
    }

    // Auto location permission request
    async requestLocationPermissionOnStart() {
        // Check if this is first time or permission was never requested
        const locationPermissionAsked = localStorage.getItem('locationPermissionAsked');
        
        if (!locationPermissionAsked) {
            setTimeout(() => {
                if (confirm('PSER Survey App needs location access to capture house coordinates. Allow location access for better data collection?')) {
                    this.captureLocation();
                }
                // Mark that we've asked for permission
                localStorage.setItem('locationPermissionAsked', 'true');
            }, 2000);
        }
    }

    // Database Methods - Using IndexedDB
    async initDatabase() {
        return new Promise((resolve) => {
            const request = indexedDB.open('PSERDatabase', 2);
            
            request.onerror = (event) => {
                console.error('Database failed to open:', event.target.error);
                this.loadFromLocalStorage();
                resolve();
            };
            
            request.onsuccess = (event) => {
                this.database = event.target.result;
                console.log('Database opened successfully');
                this.loadFromDatabase().then(resolve);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('Database upgrade needed');
                
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains('surveys')) {
                    const store = db.createObjectStore('surveys', { keyPath: 'id' });
                    store.createIndex('houseNumber', 'houseNumber', { unique: false });
                    store.createIndex('hohCnic', 'hohCnic', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('Object store created');
                }
            };
        });
    }

    async loadFromDatabase() {
        return new Promise((resolve) => {
            if (!this.database) {
                console.log('No database available, loading from localStorage');
                this.loadFromLocalStorage();
                resolve();
                return;
            }
            
            const transaction = this.database.transaction(['surveys'], 'readonly');
            const store = transaction.objectStore('surveys');
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                this.surveys = event.target.result || [];
                console.log(`Loaded ${this.surveys.length} records from database`);
                
                // Also save to localStorage as backup
                if (this.surveys.length > 0) {
                    this.saveToLocalStorage();
                }
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Error loading from database:', event.target.error);
                this.loadFromLocalStorage();
                resolve();
            };
        });
    }

    async saveToDatabase() {
        if (!this.database) {
            console.log('No database available, saving to localStorage only');
            this.saveToLocalStorage();
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.database.transaction(['surveys'], 'readwrite');
            const store = transaction.objectStore('surveys');
            
            // Clear all existing data first
            const clearRequest = store.clear();
            
            clearRequest.onsuccess = () => {
                // Add all surveys
                const addPromises = this.surveys.map(survey => {
                    return new Promise((resolveAdd, rejectAdd) => {
                        const addRequest = store.add(survey);
                        addRequest.onsuccess = () => resolveAdd();
                        addRequest.onerror = () => rejectAdd(addRequest.error);
                    });
                });
                
                Promise.all(addPromises).then(() => {
                    console.log(`Saved ${this.surveys.length} records to database`);
                    // Also save to localStorage as backup
                    this.saveToLocalStorage();
                    resolve();
                }).catch(error => {
                    console.error('Error adding records to database:', error);
                    this.saveToLocalStorage();
                    resolve();
                });
            };
            
            clearRequest.onerror = (event) => {
                console.error('Error clearing database:', event.target.error);
                this.saveToLocalStorage();
                resolve();
            };
            
            transaction.onerror = (event) => {
                console.error('Transaction error:', event.target.error);
                this.saveToLocalStorage();
                resolve();
            };
        });
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('pserSurveys');
            this.surveys = stored ? JSON.parse(stored) : [];
            console.log(`Loaded ${this.surveys.length} records from localStorage`);
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            this.surveys = [];
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem('pserSurveys', JSON.stringify(this.surveys));
            console.log('Data saved to localStorage. Total records:', this.surveys.length);
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            alert('Error saving data. Please try again.');
        }
    }
}
    // Event Binding Methods
bindEvents() {
    console.log('Binding events...');
    
    // Main action buttons
    this.safeAddEventListener('saveBtn', 'click', () => this.saveSurvey());
    this.safeAddEventListener('saveNewBtn', 'click', () => this.saveSurvey(true));
    this.safeAddEventListener('searchBtn', 'click', () => this.searchSurvey());
    this.safeAddEventListener('exportExcel', 'click', () => this.exportToExcel());
    this.safeAddEventListener('exportPDF', 'click', () => this.exportToPDF());
    this.safeAddEventListener('clearAllData', 'click', () => this.showPasswordModal());
    this.safeAddEventListener('captureLocation', 'click', () => this.captureLocation());
    this.safeAddEventListener('capturePhoto', 'click', () => this.capturePhoto());
    this.safeAddEventListener('captureSignature', 'click', () => this.showSignatureModal());
    this.safeAddEventListener('changeBlockCode', 'click', () => this.changeBlockCode());
    this.safeAddEventListener('backupBtn', 'click', () => this.showBackupModal());
    this.safeAddEventListener('restoreBtn', 'click', () => this.showBackupModal());
    this.safeAddEventListener('installBtn', 'click', () => this.installPWA());
    
    // Form field events
    this.safeAddEventListener('houseNumber', 'input', () => this.generateHouseCode());
    this.safeAddEventListener('familiesCount', 'input', () => this.generateHouseCode());
    
    // Radio button events
    const xFamilyRadios = document.querySelectorAll('input[name="xFamily"]');
    if (xFamilyRadios) {
        xFamilyRadios.forEach(radio => {
            radio.addEventListener('change', () => this.generateHouseCode());
        });
    }
    
    // Member calculation events
    ['maleMembers', 'femaleMembers', 'othersMembers'].forEach(id => {
        this.safeAddEventListener(id, 'input', () => this.calculateTotalMembers());
    });

    // Password modal events
    this.safeAddEventListener('confirmClear', 'click', () => this.confirmClearAll());
    this.safeAddEventListener('cancelClear', 'click', () => this.hidePasswordModal());

    this.setupZeroRemoval();
}

safeAddEventListener(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
        console.log(`Event bound to: ${elementId}`);
    } else {
        console.warn(`Element not found: ${elementId}`);
    }
}

// Form Setup Methods
setDefaultBlockCode() {
    const blockCodeInput = document.getElementById('blockCode');
    if (blockCodeInput) {
        blockCodeInput.value = this.defaultBlockCode;
    }
}

changeBlockCode() {
    const newBlockCode = prompt('Enter new Block Code:', this.defaultBlockCode);
    if (newBlockCode && newBlockCode.trim() !== '') {
        this.defaultBlockCode = newBlockCode.trim();
        this.setDefaultBlockCode();
        alert('Block code updated successfully!');
    }
}

setupAutoCalculations() {
    this.calculateTotalMembers();
    this.generateHouseCode();
}

setupInputFormats() {
    const cnicInput = document.getElementById('hohCnic');
    if (cnicInput) {
        cnicInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 13) {
                if (value.length > 5) {
                    value = value.substring(0, 5) + '-' + value.substring(5);
                }
                if (value.length > 13) {
                    value = value.substring(0, 13) + '-' + value.substring(13);
                }
                e.target.value = value;
            }
        });
    }

    const contactInput = document.getElementById('contactNumber');
    if (contactInput) {
        contactInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.startsWith('3')) {
                value = '0' + value;
            }
            if (value.length <= 11) {
                if (value.length > 4) {
                    value = value.substring(0, 4) + '-' + value.substring(4);
                }
                e.target.value = value;
            }
        });
    }

    const searchCnicInput = document.getElementById('searchCnic');
    if (searchCnicInput) {
        searchCnicInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 13) {
                if (value.length > 5) {
                    value = value.substring(0, 5) + '-' + value.substring(5);
                }
                if (value.length > 13) {
                    value = value.substring(0, 13) + '-' + value.substring(13);
                }
                e.target.value = value;
            }
        });
    }
}

setupZeroRemoval() {
    const numberInputs = [
        'maleMembers', 'femaleMembers', 'othersMembers',
        'buffalo', 'cow', 'goat', 'sheep',
        'motorcycle', 'car', 'van', 'scooter',
        'solar', 'ac', 'geyser', 'washingMachine', 'fridge',
        'registerNumber'
    ];

    numberInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('focus', (e) => {
                if (e.target.value === '0') {
                    e.target.value = '';
                }
            });
            
            input.addEventListener('blur', (e) => {
                if (e.target.value === '') {
                    e.target.value = '0';
                }
            });
        }
    });
}
// Auto-calculation Methods
generateHouseCode() {
    const houseNumberInput = document.getElementById('houseNumber');
    const familiesInput = document.getElementById('familiesCount');
    const houseCodeInput = document.getElementById('houseCode');
    const xFamilyYes = document.querySelector('input[name="xFamily"][value="yes"]');
    
    if (houseNumberInput && familiesInput && houseCodeInput) {
        const houseNumber = parseInt(houseNumberInput.value) || 0;
        const familiesCount = parseInt(familiesInput.value) || 0;
        const isXFamily = xFamilyYes ? xFamilyYes.checked : false;
        
        let houseCode = '';
        
        if (houseNumber > 0) {
            const formattedHouseNumber = houseNumber.toString().padStart(4, '0');
            houseCode = formattedHouseNumber;
            
            if (familiesCount > 0 && familiesCount <= 26) {
                const familyCode = String.fromCharCode(64 + familiesCount);
                houseCode += `/${familyCode}`;
                
                if (isXFamily) {
                    houseCode += ',X';
                }
            }
        }
        
        houseCodeInput.value = houseCode;
    }
}

calculateTotalMembers() {
    const male = parseInt(this.getValue('maleMembers')) || 0;
    const female = parseInt(this.getValue('femaleMembers')) || 0;
    const others = parseInt(this.getValue('othersMembers')) || 0;
    const total = male + female + others;
    
    const totalInput = document.getElementById('totalMembers');
    if (totalInput) {
        totalInput.value = total;
    }
}

// Utility Methods
getValue(elementId) {
    const element = document.getElementById(elementId);
    return element ? element.value : '';
}

setValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.value = value;
    }
}

getRadioValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : 'no';
}

setRadioValue(name, value) {
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) {
        radio.checked = true;
    }
}

// Location Methods
async captureLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    try {
        // Show loading state
        const locationBtn = document.getElementById('captureLocation');
        const originalText = locationBtn.textContent;
        locationBtn.textContent = 'Capturing...';
        locationBtn.disabled = true;

        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            });
        });

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        this.currentLocation = { latitude, longitude, accuracy };
        
        const locationInput = document.getElementById('houseLocation');
        const coordsDisplay = document.getElementById('locationCoords');
        
        if (locationInput) {
            locationInput.value = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
        }
        
        if (coordsDisplay) {
            coordsDisplay.textContent = `Accuracy: ${accuracy.toFixed(1)} meters`;
        }

        console.log('Location captured:', this.currentLocation);
        
    } catch (error) {
        console.error('Error getting location:', error);
        
        let errorMessage = 'Error capturing location. ';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage += 'Location access was denied. Please enable location permissions in your browser settings.';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage += 'Location information is unavailable.';
                break;
            case error.TIMEOUT:
                errorMessage += 'Location request timed out.';
                break;
            default:
                errorMessage += 'Please ensure location services are enabled.';
        }
        alert(errorMessage);
    } finally {
        // Restore button state
        const locationBtn = document.getElementById('captureLocation');
        if (locationBtn) {
            locationBtn.textContent = '📍';
            locationBtn.disabled = false;
        }
    }
}

// Photo Capture Methods
capturePhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    if ('capture' in input) {
        input.capture = 'environment';
    }
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            this.processPhoto(file);
        }
    };
    
    input.click();
}

processPhoto(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        this.currentPhoto = e.target.result;
        
        const photoPreview = document.getElementById('photoPreview');
        if (photoPreview) {
            photoPreview.innerHTML = `<img src="${this.currentPhoto}" alt="House Photo Preview" style="max-width: 150px; max-height: 100px;">`;
        }
        
        console.log('Photo captured and processed');
    };
    
    reader.onerror = () => {
        alert('Error reading photo file');
    };
    
    reader.readAsDataURL(file);
}
// Signature Methods
setupSignatureCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    this.signatureCtx = ctx;
    
    // Set canvas background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Mouse events
    canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    canvas.addEventListener('mousemove', (e) => this.draw(e));
    canvas.addEventListener('mouseup', () => this.stopDrawing());
    canvas.addEventListener('mouseout', () => this.stopDrawing());
    
    // Touch events for mobile
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.startDrawing(e);
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        this.draw(e);
    }, { passive: false });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.stopDrawing();
    }, { passive: false });
    
    // Modal buttons
    this.safeAddEventListener('clearSignature', 'click', () => this.clearSignature());
    this.safeAddEventListener('saveSignature', 'click', () => this.saveSignature());
    this.safeAddEventListener('cancelSignature', 'click', () => this.hideSignatureModal());
}

startDrawing(e) {
    this.isDrawing = true;
    const canvas = document.getElementById('signatureCanvas');
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    this.signatureCtx.beginPath();
    this.signatureCtx.moveTo(x, y);
}

draw(e) {
    if (!this.isDrawing) return;
    
    const canvas = document.getElementById('signatureCanvas');
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        e.preventDefault();
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    this.signatureCtx.lineTo(x, y);
    this.signatureCtx.stroke();
}

stopDrawing() {
    this.isDrawing = false;
    this.signatureCtx.beginPath();
}

clearSignature() {
    const canvas = document.getElementById('signatureCanvas');
    this.signatureCtx.fillStyle = 'white';
    this.signatureCtx.fillRect(0, 0, canvas.width, canvas.height);
    this.signatureCtx.strokeStyle = '#000';
    this.signatureCtx.lineWidth = 2;
    this.signatureCtx.lineCap = 'round';
    this.signatureCtx.lineJoin = 'round';
}

showSignatureModal() {
    const modal = document.getElementById('signatureModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.clearSignature();
    }
}

hideSignatureModal() {
    const modal = document.getElementById('signatureModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

saveSignature() {
    const canvas = document.getElementById('signatureCanvas');
    this.currentSignature = canvas.toDataURL('image/png');
    
    const signaturePreview = document.getElementById('signaturePreview');
    if (signaturePreview) {
        signaturePreview.innerHTML = `<img src="${this.currentSignature}" alt="Signature Preview" style="max-width: 150px; max-height: 60px;">`;
    }
    
    this.hideSignatureModal();
    // No alert message - silent save
}

// PWA Install Features
setupPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this.hideInstallButton();
        alert('Thank you for installing PSER Survey App!');
    });
}

showInstallButton() {
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'block';
    }
}

hideInstallButton() {
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
}

installPWA() {
    if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        this.deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            this.deferredPrompt = null;
        });
    }
}
// Form Validation & Data Management
validateForm() {
    const requiredFields = [
        'blockCode', 'houseNumber', 'respondentName', 'hohName', 
        'hohFatherName', 'hohCnic', 'familiesCount', 'contactNumber'
    ];

    for (let field of requiredFields) {
        const element = document.getElementById(field);
        if (!element || !element.value.trim()) {
            const fieldName = field.replace(/([A-Z])/g, ' $1').toLowerCase();
            alert(`Please fill in ${fieldName}`);
            if (element) element.focus();
            return false;
        }
    }

    const cnic = this.getValue('hohCnic');
    if (!/^\d{5}-\d{7}-\d{1}$/.test(cnic)) {
        alert('Please enter a valid CNIC in format: 33301-1234567-1');
        document.getElementById('hohCnic').focus();
        return false;
    }

    const contact = this.getValue('contactNumber');
    if (!/^03\d{2}-\d{7}$/.test(contact)) {
        alert('Please enter a valid contact number starting with 03 in format: 0345-1234567');
        document.getElementById('contactNumber').focus();
        return false;
    }

    return true;
}

getFormData() {
    return {
        id: this.currentEditId || Date.now().toString(),
        blockCode: this.getValue('blockCode'),
        houseNumber: parseInt(this.getValue('houseNumber')),
        familiesCount: parseInt(this.getValue('familiesCount')),
        xFamily: this.getRadioValue('xFamily'),
        houseCode: this.getValue('houseCode'),
        respondentName: this.getValue('respondentName').trim(),
        hohName: this.getValue('hohName').trim(),
        hohFatherName: this.getValue('hohFatherName').trim(),
        hohCnic: this.getValue('hohCnic'),
        maleMembers: parseInt(this.getValue('maleMembers')) || 0,
        femaleMembers: parseInt(this.getValue('femaleMembers')) || 0,
        othersMembers: parseInt(this.getValue('othersMembers')) || 0,
        totalMembers: parseInt(this.getValue('totalMembers')) || 0,
        registerNumber: this.getValue('registerNumber') ? parseInt(this.getValue('registerNumber')) : null,
        location: this.currentLocation,
        photo: this.currentPhoto,
        signature: this.currentSignature,
        livestock: {
            buffalo: parseInt(this.getValue('buffalo')) || 0,
            cow: parseInt(this.getValue('cow')) || 0,
            goat: parseInt(this.getValue('goat')) || 0,
            sheep: parseInt(this.getValue('sheep')) || 0
        },
        transport: {
            motorcycle: parseInt(this.getValue('motorcycle')) || 0,
            car: parseInt(this.getValue('car')) || 0,
            van: parseInt(this.getValue('van')) || 0,
            scooter: parseInt(this.getValue('scooter')) || 0
        },
        appliances: {
            solar: parseInt(this.getValue('solar')) || 0,
            ac: parseInt(this.getValue('ac')) || 0,
            geyser: parseInt(this.getValue('geyser')) || 0,
            washingMachine: parseInt(this.getValue('washingMachine')) || 0,
            fridge: parseInt(this.getValue('fridge')) || 0
        },
        contactNumber: this.getValue('contactNumber'),
        timestamp: new Date().toISOString()
    };
}

async saveSurvey(isNew = false) {
    if (!this.validateForm()) return;

    const surveyData = this.getFormData();

    if (this.currentEditId) {
        const index = this.surveys.findIndex(s => s.id === this.currentEditId);
        if (index !== -1) {
            this.surveys[index] = surveyData;
        }
    } else {
        this.surveys.push(surveyData);
    }

    await this.saveToDatabase();
    
    alert('Survey data saved successfully!');
    
    if (isNew) {
        this.clearForm();
        this.currentEditId = null;
        // Auto-focus on house number field after save
        setTimeout(() => {
            const houseNumberInput = document.getElementById('houseNumber');
            if (houseNumberInput) {
                houseNumberInput.focus();
            }
        }, 100);
    }
}

clearForm() {
    const form = document.getElementById('surveyForm');
    if (form) {
        form.reset();
    }
    this.currentEditId = null;
    this.currentLocation = null;
    this.currentPhoto = null;
    this.currentSignature = null;
    
    const photoPreview = document.getElementById('photoPreview');
    if (photoPreview) {
        photoPreview.innerHTML = '';
    }
    
    const signaturePreview = document.getElementById('signaturePreview');
    if (signaturePreview) {
        signaturePreview.innerHTML = '';
    }
    
    const coordsDisplay = document.getElementById('locationCoords');
    if (coordsDisplay) {
        coordsDisplay.textContent = '';
    }
    
    this.setDefaultBlockCode();
    this.calculateTotalMembers();
    this.generateHouseCode();
    
    // Auto-focus on house number field after clear
    setTimeout(() => {
        const houseNumberInput = document.getElementById('houseNumber');
        if (houseNumberInput) {
            houseNumberInput.focus();
        }
    }, 100);
}
// Search & Display Methods
searchSurvey() {
    const houseNumberInput = document.getElementById('searchHouseNumber');
    const cnicInput = document.getElementById('searchCnic');
    
    if ((!houseNumberInput || !houseNumberInput.value) && (!cnicInput || !cnicInput.value)) {
        alert('Please enter either House Number or CNIC Number to search');
        return;
    }

    let results = [];
    
    if (houseNumberInput && houseNumberInput.value) {
        const houseNumber = parseInt(houseNumberInput.value);
        results = this.surveys.filter(survey => survey.houseNumber === houseNumber);
    }
    
    if (cnicInput && cnicInput.value) {
        const searchCnic = cnicInput.value.replace(/\D/g, '');
        const cnicResults = this.surveys.filter(survey => 
            survey.hohCnic.replace(/\D/g, '').includes(searchCnic)
        );
        
        if (results.length > 0 && cnicResults.length > 0) {
            const combinedResults = [...results, ...cnicResults];
            results = combinedResults.filter((survey, index, self) => 
                index === self.findIndex(s => s.id === survey.id)
            );
        } else if (cnicResults.length > 0) {
            results = cnicResults;
        }
    }

    this.displaySearchResults(results);
}

displaySearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No records found for your search.</div>';
        return;
    }

    resultsContainer.innerHTML = results.map(survey => {
        // Only show items that the house actually has
        const livestockItems = [];
        if (survey.livestock.buffalo > 0) livestockItems.push(`Buffalo(${survey.livestock.buffalo})`);
        if (survey.livestock.cow > 0) livestockItems.push(`Cow(${survey.livestock.cow})`);
        if (survey.livestock.goat > 0) livestockItems.push(`Goat(${survey.livestock.goat})`);
        if (survey.livestock.sheep > 0) livestockItems.push(`Sheep(${survey.livestock.sheep})`);
        
        const transportItems = [];
        if (survey.transport.motorcycle > 0) transportItems.push(`Motorcycle(${survey.transport.motorcycle})`);
        if (survey.transport.car > 0) transportItems.push(`Car(${survey.transport.car})`);
        if (survey.transport.van > 0) transportItems.push(`Van(${survey.transport.van})`);
        if (survey.transport.scooter > 0) transportItems.push(`Scooter(${survey.transport.scooter})`);
        
        const appliancesItems = [];
        if (survey.appliances.solar > 0) appliancesItems.push(`Solar(${survey.appliances.solar})`);
        if (survey.appliances.ac > 0) appliancesItems.push(`AC(${survey.appliances.ac})`);
        if (survey.appliances.geyser > 0) appliancesItems.push(`Geyser(${survey.appliances.geyser})`);
        if (survey.appliances.washingMachine > 0) appliancesItems.push(`Washing Machine(${survey.appliances.washingMachine})`);
        if (survey.appliances.fridge > 0) appliancesItems.push(`Fridge(${survey.appliances.fridge})`);

        return `
            <div class="record-card">
                <h3>Block ${survey.blockCode} - House ${survey.houseCode} - ${survey.hohName}</h3>
                <div class="record-grid">
                    <div class="record-item"><strong>Block Code:</strong> ${survey.blockCode}</div>
                    <div class="record-item"><strong>House No:</strong> ${survey.houseNumber}</div>
                    <div class="record-item"><strong>Respondent:</strong> ${survey.respondentName}</div>
                    <div class="record-item"><strong>HOH Name:</strong> ${survey.hohName}</div>
                    <div class="record-item"><strong>HOH Father:</strong> ${survey.hohFatherName}</div>
                    <div class="record-item"><strong>HOH CNIC:</strong> ${survey.hohCnic}</div>
                    <div class="record-item"><strong>Families:</strong> ${survey.familiesCount}</div>
                    <div class="record-item"><strong>X Family:</strong> ${survey.xFamily === 'yes' ? 'Yes' : 'No'}</div>
                    <div class="record-item"><strong>Total Members:</strong> ${survey.totalMembers}</div>
                    <div class="record-item"><strong>Contact:</strong> ${survey.contactNumber}</div>
                    ${survey.registerNumber ? `<div class="record-item"><strong>Register No:</strong> ${survey.registerNumber}</div>` : ''}
                </div>
                <div class="record-grid">
                    <div class="record-item">
                        <strong>Location:</strong> 
                        ${survey.location ? 
                            `<span class="location-link" onclick="surveyManager.openInMaps(${survey.location.latitude}, ${survey.location.longitude})">
                                📍 View on Map
                            </span>` 
                            : 'Not captured'
                        }
                    </div>
                    <div class="record-item">
                        <strong>Photo:</strong> 
                        ${survey.photo ? 
                            `<img src="${survey.photo}" class="photo-thumbnail" onclick="surveyManager.viewPhoto('${survey.photo}')">` 
                            : 'Not captured'
                        }
                    </div>
                    <div class="record-item">
                        <strong>Signature:</strong> 
                        ${survey.signature ? 
                            `<img src="${survey.signature}" class="signature-thumbnail" onclick="surveyManager.viewPhoto('${survey.signature}')">` 
                            : 'Not captured'
                        }
                    </div>
                </div>
                ${livestockItems.length > 0 ? `
                <div class="record-grid">
                    <div class="record-item"><strong>Livestock:</strong> ${livestockItems.join(', ')}</div>
                </div>
                ` : ''}
                ${transportItems.length > 0 ? `
                <div class="record-grid">
                    <div class="record-item"><strong>Transport:</strong> ${transportItems.join(', ')}</div>
                </div>
                ` : ''}
                ${appliancesItems.length > 0 ? `
                <div class="record-grid">
                    <div class="record-item"><strong>Appliances:</strong> ${appliancesItems.join(', ')}</div>
                </div>
                ` : ''}
                <button onclick="surveyManager.editSurvey('${survey.id}')" class="btn btn-primary" style="margin-top: 6px; padding: 5px 10px; font-size: 12px;">Edit</button>
                <button onclick="surveyManager.deleteSurvey('${survey.id}')" class="btn btn-reset" style="margin-top: 6px; padding: 5px 10px; font-size: 12px;">Delete</button>
            </div>
        `;
    }).join('');
}

// Utility Methods for Results
openInMaps(latitude, longitude) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(url, '_blank');
}

viewPhoto(photoData) {
    const photoWindow = window.open('', '_blank');
    photoWindow.document.write(`
        <html>
            <head><title>Image View</title></head>
            <body style="margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #000;">
                <img src="${photoData}" style="max-width: 100%; max-height: 100%;">
            </body>
        </html>
    `);
}
// Edit & Delete Methods
editSurvey(id) {
    const survey = this.surveys.find(s => s.id === id);
    if (!survey) return;

    this.currentEditId = id;
    this.currentLocation = survey.location || null;
    this.currentPhoto = survey.photo || null;
    this.currentSignature = survey.signature || null;
    
    this.setValue('blockCode', survey.blockCode);
    this.setValue('houseNumber', survey.houseNumber);
    this.setValue('respondentName', survey.respondentName);
    this.setValue('hohName', survey.hohName);
    this.setValue('hohFatherName', survey.hohFatherName);
    this.setValue('hohCnic', survey.hohCnic);
    this.setValue('familiesCount', survey.familiesCount);
    this.setValue('maleMembers', survey.maleMembers);
    this.setValue('femaleMembers', survey.femaleMembers);
    this.setValue('othersMembers', survey.othersMembers);
    this.setValue('contactNumber', survey.contactNumber);
    this.setValue('registerNumber', survey.registerNumber || '');

    this.setRadioValue('xFamily', survey.xFamily);

    if (survey.location) {
        const locationInput = document.getElementById('houseLocation');
        const coordsDisplay = document.getElementById('locationCoords');
        if (locationInput) {
            locationInput.value = `Lat: ${survey.location.latitude.toFixed(6)}, Lng: ${survey.location.longitude.toFixed(6)}`;
        }
        if (coordsDisplay) {
            coordsDisplay.textContent = `Accuracy: ${survey.location.accuracy.toFixed(1)} meters`;
        }
    }

    if (survey.photo) {
        const photoPreview = document.getElementById('photoPreview');
        if (photoPreview) {
            photoPreview.innerHTML = `<img src="${survey.photo}" alt="House Photo Preview" style="max-width: 150px; max-height: 100px;">`;
        }
    }

    if (survey.signature) {
        const signaturePreview = document.getElementById('signaturePreview');
        if (signaturePreview) {
            signaturePreview.innerHTML = `<img src="${survey.signature}" alt="Signature Preview" style="max-width: 150px; max-height: 60px;">`;
        }
    }

    this.setValue('buffalo', survey.livestock.buffalo);
    this.setValue('cow', survey.livestock.cow);
    this.setValue('goat', survey.livestock.goat);
    this.setValue('sheep', survey.livestock.sheep);

    this.setValue('motorcycle', survey.transport.motorcycle);
    this.setValue('car', survey.transport.car);
    this.setValue('van', survey.transport.van);
    this.setValue('scooter', survey.transport.scooter);

    this.setValue('solar', survey.appliances.solar);
    this.setValue('ac', survey.appliances.ac);
    this.setValue('geyser', survey.appliances.geyser);
    this.setValue('washingMachine', survey.appliances.washingMachine);
    this.setValue('fridge', survey.appliances.fridge);

    this.generateHouseCode();
    this.calculateTotalMembers();

    const surveyForm = document.getElementById('surveyForm');
    if (surveyForm) {
        surveyForm.scrollIntoView({ behavior: 'smooth' });
    }
}

deleteSurvey(id) {
    if (confirm('Are you sure you want to delete this record?')) {
        this.surveys = this.surveys.filter(s => s.id !== id);
        this.saveToLocalStorage();
        this.saveToDatabase();
        this.searchSurvey();
        alert('Record deleted successfully!');
    }
}
// Export Methods
exportToExcel() {
    if (this.surveys.length === 0) {
        alert('No data to export!');
        return;
    }

    try {
        alert(`Exporting ${this.surveys.length} records to Excel...`);
        
        const headers = [
            'Block Code', 'House Number', 'House Code', 'Families Count', 'X Family',
            'Respondent Name', 'HOH Name', 'HOH Father Name', 'HOH CNIC', 'Contact Number',
            'Male Members', 'Female Members', 'Others Members', 'Total Members', 'Register Number',
            'Location Link', 'Buffalo', 'Cow', 'Goat', 'Sheep',
            'Motorcycle', 'Car', 'Van', 'Scooter',
            'Solar', 'AC', 'Geyser', 'Washing Machine', 'Fridge',
            'Timestamp'
        ];

        const csvContent = [
            headers.join(','),
            ...this.surveys.map(survey => [
                survey.blockCode,
                survey.houseNumber,
                `"${survey.houseCode}"`,
                survey.familiesCount,
                survey.xFamily === 'yes' ? 'Yes' : 'No',
                `"${survey.respondentName}"`,
                `"${survey.hohName}"`,
                `"${survey.hohFatherName}"`,
                survey.hohCnic,
                survey.contactNumber,
                survey.maleMembers,
                survey.femaleMembers,
                survey.othersMembers,
                survey.totalMembers,
                survey.registerNumber || '',
                survey.location ? `"https://maps.google.com/?q=${survey.location.latitude},${survey.location.longitude}"` : '',
                survey.livestock.buffalo,
                survey.livestock.cow,
                survey.livestock.goat,
                survey.livestock.sheep,
                survey.transport.motorcycle,
                survey.transport.car,
                survey.transport.van,
                survey.transport.scooter,
                survey.appliances.solar,
                survey.appliances.ac,
                survey.appliances.geyser,
                survey.appliances.washingMachine,
                survey.appliances.fridge,
                `"${new Date(survey.timestamp).toLocaleString()}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `PSER_Surveys_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert(`Export completed successfully! ${this.surveys.length} records exported.`);
    } catch (error) {
        console.error('Error exporting data:', error);
        alert('Error exporting data. Please try again.');
    }
}

async exportToPDF() {
    if (this.surveys.length === 0) {
        alert('No data to export!');
        return;
    }

    try {
        console.log(`Starting PDF export for ${this.surveys.length} records...`);
        
        const { jsPDF } = window.jspdf;
        
        if (!jsPDF) {
            throw new Error('PDF library not loaded');
        }

        // Create PDF in landscape mode for table view
        const pdf = new jsPDF('landscape');
        const pageWidth = pdf.internal.pageSize.width;
        const pageHeight = pdf.internal.pageSize.height;
        
        // Table configuration
        const headers = [
            'House No', 'House Code', 'Respondent', 'HOH Name', 'HOH Father',
            'CNIC', 'Contact', 'Male', 'Female', 'Others', 'Total',
            'Location', 'Register No'
        ];
        
        const columnWidths = [15, 20, 25, 25, 25, 30, 20, 10, 12, 12, 12, 25, 20];
        let startX = 10;
        let startY = 20;
        const rowHeight = 10;
        const recordsPerPage = 15;
        
        // Colors
        const headerColor = [41, 128, 185];
        const rowColor = [240, 240, 240];
        
        let currentRecord = 0;
        let currentPage = 1;

        while (currentRecord < this.surveys.length) {
            if (currentRecord > 0) {
                pdf.addPage('landscape');
                currentPage++;
                startY = 20;
            }

            // Page header
            pdf.setFontSize(16);
            pdf.setTextColor(...headerColor);
            pdf.text('PSER SURVEY DATA - TABLE VIEW', startX, 10);
            
            pdf.setFontSize(8);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`Page ${currentPage} | Exported: ${new Date().toLocaleString()}`, pageWidth - 60, 10);

            // Draw table headers
            pdf.setFillColor(...headerColor);
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(8);
            pdf.setFont(undefined, 'bold');
            
            let x = startX;
            headers.forEach((header, index) => {
                pdf.rect(x, startY, columnWidths[index], rowHeight, 'F');
                pdf.text(header, x + 2, startY + 6);
                x += columnWidths[index];
            });
            
            startY += rowHeight;
            
            // Draw table rows
            pdf.setTextColor(0, 0, 0);
            pdf.setFont(undefined, 'normal');
            
            let recordsOnThisPage = 0;
            
            for (let i = currentRecord; i < this.surveys.length && recordsOnThisPage < recordsPerPage; i++) {
                const survey = this.surveys[i];
                
                // Alternate row colors
                if (recordsOnThisPage % 2 === 0) {
                    pdf.setFillColor(...rowColor);
                    let rectX = startX;
                    headers.forEach((_, index) => {
                        pdf.rect(rectX, startY, columnWidths[index], rowHeight, 'F');
                        rectX += columnWidths[index];
                    });
                }
                
                // House No
                pdf.text(survey.houseNumber.toString(), startX + 2, startY + 6);
                
                // House Code
                pdf.text(survey.houseCode, startX + columnWidths[0] + 2, startY + 6);
                
                // Respondent Name (truncated if too long)
                const respondent = survey.respondentName.length > 15 ? 
                    survey.respondentName.substring(0, 12) + '...' : survey.respondentName;
                pdf.text(respondent, startX + columnWidths[0] + columnWidths[1] + 2, startY + 6);
                
                // HOH Name (truncated)
                const hohName = survey.hohName.length > 15 ? 
                    survey.hohName.substring(0, 12) + '...' : survey.hohName;
                pdf.text(hohName, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 2, startY + 6);
                
                // HOH Father Name (truncated)
                const hohFather = survey.hohFatherName.length > 15 ? 
                    survey.hohFatherName.substring(0, 12) + '...' : survey.hohFatherName;
                pdf.text(hohFather, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 2, startY + 6);
                
                // CNIC
                pdf.text(survey.hohCnic, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 2, startY + 6);
                
                // Contact
                pdf.text(survey.contactNumber, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + 2, startY + 6);
                
                // Male Members
                pdf.text(survey.maleMembers.toString(), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6] + 2, startY + 6);
                
                // Female Members
                pdf.text(survey.femaleMembers.toString(), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6] + columnWidths[7] + 2, startY + 6);
                
                // Others Members
                pdf.text(survey.othersMembers.toString(), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6] + columnWidths[7] + columnWidths[8] + 2, startY + 6);
                
                // Total Members
                pdf.text(survey.totalMembers.toString(), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6] + columnWidths[7] + columnWidths[8] + columnWidths[9] + 2, startY + 6);
                
                // Location Link
                const locationText = survey.location ? 'View on Map' : 'No Location';
                pdf.setTextColor(41, 128, 185);
                pdf.textWithLink(locationText, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6] + columnWidths[7] + columnWidths[8] + columnWidths[9] + columnWidths[10] + 2, startY + 6, {
                    url: survey.location ? `https://maps.google.com/?q=${survey.location.latitude},${survey.location.longitude}` : '',
                    maxWidth: columnWidths[11] - 4
                });
                pdf.setTextColor(0, 0, 0);
                
                // Register Number
                pdf.text(survey.registerNumber ? survey.registerNumber.toString() : 'N/A', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + columnWidths[6] + columnWidths[7] + columnWidths[8] + columnWidths[9] + columnWidths[10] + columnWidths[11] + 2, startY + 6);
                
                startY += rowHeight;
                recordsOnThisPage++;
                currentRecord++;
                
                // Check if we need a new page
                if (startY > pageHeight - 20 && i < this.surveys.length - 1) {
                    break;
                }
            }
            
            // Footer
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Records ${currentRecord - recordsOnThisPage + 1} to ${currentRecord} of ${this.surveys.length}`, startX, pageHeight - 10);
        }

        // Save the PDF
        pdf.save(`PSER_Survey_Table_${new Date().toISOString().split('T')[0]}.pdf`);
        
        // Show success message
        setTimeout(() => {
            alert(`PDF export completed! ${this.surveys.length} records exported in table format.`);
        }, 500);
        
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        alert('Error exporting to PDF. Please try again.');
    }
}

// Helper method for section headers
addSectionHeader(pdf, text, x, y) {
    pdf.setFontSize(12);
    pdf.setTextColor(41, 128, 185);
    pdf.setFont(undefined, 'bold');
    pdf.text(text, x, y);
    pdf.setFont(undefined, 'normal');
}
    // Backup & Restore Methods
    setupBackupRestore() {
        this.safeAddEventListener('downloadBackup', 'click', () => this.downloadBackup());
        this.safeAddEventListener('uploadBackup', 'click', () => this.uploadBackup());
        this.safeAddEventListener('closeBackup', 'click', () => this.hideBackupModal());
        
        const backupFileInput = document.getElementById('backupFile');
        if (backupFileInput) {
            backupFileInput.addEventListener('change', (e) => this.restoreBackup(e));
        }
    }

    showBackupModal() {
        const modal = document.getElementById('backupModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideBackupModal() {
        const modal = document.getElementById('backupModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    downloadBackup() {
        if (this.surveys.length === 0) {
            alert('No data to backup!');
            return;
        }

        const backupData = {
            version: '3.0',
            timestamp: new Date().toISOString(),
            totalRecords: this.surveys.length,
            surveys: this.surveys
        };

        const dataStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `PSER_Survey_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert(`Backup created successfully! ${this.surveys.length} records saved.`);
        this.hideBackupModal();
    }

    uploadBackup() {
        const backupFileInput = document.getElementById('backupFile');
        if (backupFileInput) {
            backupFileInput.click();
        }
    }

    restoreBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                
                if (!backupData.surveys || !Array.isArray(backupData.surveys)) {
                    throw new Error('Invalid backup file format');
                }

                if (confirm(`This will replace all current data with ${backupData.surveys.length} records from backup. Continue?`)) {
                    this.surveys = backupData.surveys;
                    await this.saveToDatabase();
                    alert(`Backup restored successfully! ${backupData.surveys.length} records loaded.`);
                    this.hideBackupModal();
                    this.searchSurvey();
                }
                
            } catch (error) {
                console.error('Error restoring backup:', error);
                alert('Error restoring backup. Please check the file format.');
            }
        };
        
        reader.onerror = () => {
            alert('Error reading backup file');
        };
        
        reader.readAsText(file);
        event.target.value = '';
    }

    // Data Clear Methods
    showPasswordModal() {
        if (this.surveys.length === 0) {
            alert('No data to clear!');
            return;
        }
        
        const modal = document.getElementById('passwordModal');
        const passwordInput = document.getElementById('passwordInput');
        
        if (modal && passwordInput) {
            modal.style.display = 'flex';
            passwordInput.value = '';
            passwordInput.focus();
        }
    }

    hidePasswordModal() {
        const modal = document.getElementById('passwordModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    confirmClearAll() {
        const passwordInput = document.getElementById('passwordInput');
        const password = passwordInput ? passwordInput.value : '';
        
        if (password === '1234') {
            this.surveys = [];
            this.saveToLocalStorage();
            this.saveToDatabase();
            this.hidePasswordModal();
            alert('All data has been cleared successfully!');
            this.searchSurvey();
        } else {
            alert('Incorrect password! Data was not cleared.');
        }
    }
}
// Initialize App
function initializeApp() {
    console.log('Starting PSER Survey app...');
    window.surveyManager = surveyManager = new PSERSurvey();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}