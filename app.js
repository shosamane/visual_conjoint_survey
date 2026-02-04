// Visual Conjoint Survey - Client-side Logic

// ============================================
// Configuration
// ============================================
const CONFIG = {
  NUM_COMPARISONS: 10,
  API_BASE: '/webhook3/api',
  IMAGE_FOLDER: 'stimuli_images'
};

// Available images - update this list when adding new images
const AVAILABLE_IMAGES = [
  'Adult_F_PacIsl_TravelWorn_Disheveled.png',
  'Adult_F_White_Formal_Disheveled.png',
  'Adult_F_White_Formal_WellMaint.png',
  'Adult_F_White_Traditional_Disheveled.png',
  'Adult_F_White_Traditional_WellMaint.png',
  'Adult_F_White_TravelWorn_Disheveled.png',
  'Adult_F_White_TravelWorn_WellMaint.png',
  'MiddleAged_F_White_Formal_Disheveled.png',
  'MiddleAged_F_White_Formal_WellMaint.png',
  'MiddleAged_F_White_Traditional_Disheveled.png',
  'MiddleAged_F_White_Traditional_WellMaint.png',
  'MiddleAged_F_White_TravelWorn_Disheveled.png',
  'MiddleAged_F_White_TravelWorn_WellMaint.png',
  'Older_F_White_Formal_Disheveled.png',
  'Older_F_White_Formal_WellMaint.png',
  'Older_F_White_Traditional_Disheveled.png',
  'Older_F_White_Traditional_WellMaint.png',
  'Older_F_White_TravelWorn_Disheveled.png',
  'Older_F_White_TravelWorn_WellMaint.png',
  'YoungAdult_F_White_Formal_Disheveled.png',
  'YoungAdult_F_White_Formal_WellMaint.png',
  'YoungAdult_F_White_Traditional_Disheveled.png',
  'YoungAdult_F_White_Traditional_WellMaint.png',
  'YoungAdult_F_White_TravelWorn_Disheveled.png',
  'YoungAdult_F_White_TravelWorn_WellMaint.png'
];

// ============================================
// State
// ============================================
let state = {
  sessionId: null,
  recruitment: {
    source: null,
    participantId: null
  },
  comparisons: [], // Array of comparison responses indexed by trial number
  currentTrial: 0,
  attentionCheckPosition: null,
  attentionCheckPassed: null,
  trialPairs: [], // Pre-generated pairs for all trials
  demographics: {},
  timestamps: {
    sessionStart: new Date().toISOString(),
    consentComplete: null,
    recruitmentComplete: null,
    instructionsComplete: null,
    comparisonsComplete: null,
    demographicsComplete: null
  },
  progressStatus: 'started'
};

// ============================================
// DOM Elements
// ============================================
const panels = {
  consent: document.getElementById('consent-panel'),
  recruitment: document.getElementById('recruitment-panel'),
  instructions: document.getElementById('instructions-panel'),
  comparison: document.getElementById('comparison-panel'),
  demographics: document.getElementById('demographics-panel'),
  completion: document.getElementById('completion-panel'),
  declined: document.getElementById('declined-panel')
};

// ============================================
// Session Management
// ============================================
function getOrCreateSessionId() {
  try {
    const key = 'visual_conjoint_session_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      const bytes = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
}

// ============================================
// Image Sampling
// ============================================

// Uniform random sampling - each image has equal probability
function sampleRandomImage() {
  const index = Math.floor(Math.random() * AVAILABLE_IMAGES.length);
  return AVAILABLE_IMAGES[index];
}

// Sample a pair of different images
function sampleImagePair() {
  const imageA = sampleRandomImage();
  let imageB = sampleRandomImage();

  // Ensure images are different
  while (imageB === imageA) {
    imageB = sampleRandomImage();
  }

  return { imageA, imageB };
}

// Generate all trial pairs including attention check at random position
function generateTrialPairs() {
  console.log('[generateTrialPairs] Starting, NUM_COMPARISONS:', CONFIG.NUM_COMPARISONS);
  console.log('[generateTrialPairs] AVAILABLE_IMAGES count:', AVAILABLE_IMAGES.length);

  const pairs = [];

  // Generate attention check position (0-indexed, random among 10 trials)
  state.attentionCheckPosition = Math.floor(Math.random() * CONFIG.NUM_COMPARISONS);
  console.log('[generateTrialPairs] Attention check position:', state.attentionCheckPosition);

  for (let i = 0; i < CONFIG.NUM_COMPARISONS; i++) {
    if (i === state.attentionCheckPosition) {
      // Attention check: same image on both sides
      const sameImage = sampleRandomImage();
      pairs.push({
        imageA: sameImage,
        imageB: sameImage,
        isAttentionCheck: true
      });
    } else {
      // Regular trial: different images
      const { imageA, imageB } = sampleImagePair();
      pairs.push({
        imageA,
        imageB,
        isAttentionCheck: false
      });
    }
  }

  console.log('[generateTrialPairs] Generated pairs:', pairs.length);
  return pairs;
}

// ============================================
// Panel Navigation
// ============================================
function showPanel(panelId) {
  // Hide all panels
  Object.values(panels).forEach(panel => {
    if (panel) panel.hidden = true;
  });

  // Show requested panel
  if (panels[panelId]) {
    panels[panelId].hidden = false;
    window.scrollTo(0, 0);
  }
}

// ============================================
// Consent Page
// ============================================
function initConsentPage() {
  const agreeBtn = document.getElementById('consent-agree-btn');
  const declineBtn = document.getElementById('consent-decline-btn');

  agreeBtn.addEventListener('click', () => {
    state.timestamps.consentComplete = new Date().toISOString();
    saveProgress('consent_complete');
    showPanel('recruitment');
  });

  declineBtn.addEventListener('click', () => {
    showPanel('declined');
  });
}

// ============================================
// Recruitment Page
// ============================================
function initRecruitmentPage() {
  const sourceRadios = document.querySelectorAll('input[name="recruitment-source"]');
  const sourceIdField = document.getElementById('source-id-field');
  const sourceIdInput = document.getElementById('source-id');
  const sourceIdLabel = document.getElementById('source-id-label');
  const sourceIdWarning = document.getElementById('source-id-warning');
  const continueBtn = document.getElementById('recruitment-continue-btn');
  const backBtn = document.getElementById('recruitment-back-btn');

  sourceRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.recruitment.source = e.target.value;

      // Show ID field and warning only after radio selection
      sourceIdField.hidden = false;
      sourceIdWarning.hidden = false;

      // Update label based on source
      if (e.target.value === 'clickworker') {
        sourceIdLabel.textContent = 'Your Clickworker ID';
        sourceIdInput.placeholder = 'Enter your Clickworker ID';
      } else if (e.target.value === 'prolific') {
        sourceIdLabel.textContent = 'Your Prolific ID';
        sourceIdInput.placeholder = 'Enter your Prolific ID';
      } else {
        sourceIdLabel.textContent = 'Your Name or Email';
        sourceIdInput.placeholder = 'Enter your name or email';
      }

      updateRecruitmentContinueButton();
    });
  });

  sourceIdInput.addEventListener('input', () => {
    state.recruitment.participantId = sourceIdInput.value.trim();
    updateRecruitmentContinueButton();
  });

  continueBtn.addEventListener('click', () => {
    if (state.recruitment.source && state.recruitment.participantId) {
      state.timestamps.recruitmentComplete = new Date().toISOString();
      saveProgress('recruitment_complete');
      showPanel('instructions');
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    showPanel('consent');
  });
}

function updateRecruitmentContinueButton() {
  const continueBtn = document.getElementById('recruitment-continue-btn');
  const hasSource = state.recruitment.source !== null;
  const hasId = state.recruitment.participantId && state.recruitment.participantId.trim().length > 0;
  continueBtn.disabled = !(hasSource && hasId);
}

// Restore recruitment page state when navigating back
function restoreRecruitmentPage() {
  const sourceRadios = document.querySelectorAll('input[name="recruitment-source"]');
  const sourceIdField = document.getElementById('source-id-field');
  const sourceIdInput = document.getElementById('source-id');
  const sourceIdLabel = document.getElementById('source-id-label');
  const sourceIdWarning = document.getElementById('source-id-warning');

  if (state.recruitment.source) {
    // Check the correct radio
    sourceRadios.forEach(radio => {
      if (radio.value === state.recruitment.source) {
        radio.checked = true;
      }
    });

    // Show ID field and warning
    sourceIdField.hidden = false;
    sourceIdWarning.hidden = false;

    // Set label
    if (state.recruitment.source === 'clickworker') {
      sourceIdLabel.textContent = 'Your Clickworker ID';
      sourceIdInput.placeholder = 'Enter your Clickworker ID';
    } else if (state.recruitment.source === 'prolific') {
      sourceIdLabel.textContent = 'Your Prolific ID';
      sourceIdInput.placeholder = 'Enter your Prolific ID';
    } else {
      sourceIdLabel.textContent = 'Your Name or Email';
      sourceIdInput.placeholder = 'Enter your name or email';
    }

    // Restore ID
    if (state.recruitment.participantId) {
      sourceIdInput.value = state.recruitment.participantId;
    }

    updateRecruitmentContinueButton();
  }
}

// ============================================
// Image Preloading
// ============================================
let imagesPreloaded = false;
const preloadedImages = {}; // Cache of preloaded Image objects

function getUniqueImagesFromTrials() {
  const uniqueImages = new Set();
  state.trialPairs.forEach(trial => {
    uniqueImages.add(trial.imageA);
    uniqueImages.add(trial.imageB);
  });
  return Array.from(uniqueImages);
}

async function preloadImages(imageList, onProgress) {
  if (!imageList || imageList.length === 0) {
    console.warn('[Preload] No images to preload');
    return;
  }

  let loaded = 0;
  const total = imageList.length;

  const promises = imageList.map(imageName => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        preloadedImages[imageName] = img;
        console.log(`[Preload] Loaded ${loaded}/${total}: ${imageName}`);
        if (onProgress) onProgress(loaded, total);
        resolve();
      };
      img.onerror = (err) => {
        loaded++;
        console.error(`[Preload] Failed ${loaded}/${total}: ${imageName}`, err);
        if (onProgress) onProgress(loaded, total);
        resolve(); // Don't reject, continue with other images
      };
      img.src = `${CONFIG.IMAGE_FOLDER}/${imageName}`;
    });
  });

  await Promise.all(promises);
}

// ============================================
// Instructions Page
// ============================================
function initInstructionsPage() {
  const startBtn = document.getElementById('start-comparisons-btn');
  const backBtn = document.getElementById('instructions-back-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  const loadingProgress = document.getElementById('loading-progress');

  startBtn.addEventListener('click', async () => {
    try {
      state.timestamps.instructionsComplete = new Date().toISOString();

      // Generate trial pairs if not already generated
      if (state.trialPairs.length === 0) {
        state.trialPairs = generateTrialPairs();
        console.log('[Preload] Generated trial pairs:', state.trialPairs.length);
      }

      // Check if images need to be preloaded
      if (!imagesPreloaded) {
        // Show loading overlay
        loadingOverlay.classList.add('show');
        startBtn.disabled = true;

        // Get unique images needed for trials
        const uniqueImages = getUniqueImagesFromTrials();
        console.log('[Preload] Unique images to load:', uniqueImages.length);

        if (uniqueImages.length > 0) {
          loadingProgress.textContent = `0 / ${uniqueImages.length}`;

          // Preload images with progress updates
          await preloadImages(uniqueImages, (loaded, total) => {
            loadingProgress.textContent = `${loaded} / ${total}`;
          });
          console.log('[Preload] Complete');
        } else {
          console.warn('[Preload] No unique images found, skipping preload');
        }

        imagesPreloaded = true;
        loadingOverlay.classList.remove('show');
        startBtn.disabled = false;
      }

      state.currentTrial = 0;
      saveProgress('instructions_complete');
      showPanel('comparison');
      loadComparison();
    } catch (err) {
      console.error('[Instructions] Error:', err);
      // Hide overlay and proceed anyway
      loadingOverlay.classList.remove('show');
      startBtn.disabled = false;
      state.currentTrial = 0;
      showPanel('comparison');
      loadComparison();
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    restoreRecruitmentPage();
    showPanel('recruitment');
  });
}

// ============================================
// Comparison Page
// ============================================
function initComparisonPage() {
  const responseRadios = document.querySelectorAll('input[name="comparison-response"]');
  const nextBtn = document.getElementById('next-comparison-btn');
  const backBtn = document.getElementById('comparison-back-btn');

  responseRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      nextBtn.disabled = false;
    });
  });

  nextBtn.addEventListener('click', () => {
    recordComparison();

    state.currentTrial++;

    if (state.currentTrial >= CONFIG.NUM_COMPARISONS) {
      // All comparisons done
      state.timestamps.comparisonsComplete = new Date().toISOString();

      // Check attention check
      const attentionTrial = state.comparisons.find(c => c.isAttentionCheck);
      state.attentionCheckPassed = attentionTrial ? attentionTrial.response === 'equal' : null;

      saveProgress('comparisons_complete');
      showPanel('demographics');
      restoreDemographicsPage();
    } else {
      // Load next comparison
      loadComparison();
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    // Save current response if any before going back
    const selectedResponse = document.querySelector('input[name="comparison-response"]:checked');
    if (selectedResponse) {
      recordComparison();
    }

    if (state.currentTrial === 0) {
      // Go back to instructions
      showPanel('instructions');
    } else {
      // Go to previous trial
      state.currentTrial--;
      loadComparison();
    }
  });
}

function loadComparison() {
  const trial = state.trialPairs[state.currentTrial];

  // Update progress
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const progress = ((state.currentTrial) / CONFIG.NUM_COMPARISONS) * 100;
  progressFill.style.width = `${progress}%`;
  progressText.textContent = `Comparison ${state.currentTrial + 1} of ${CONFIG.NUM_COMPARISONS}`;

  // Load images from preloaded cache (instant display)
  const imageLeft = document.getElementById('image-left');
  const imageRight = document.getElementById('image-right');

  // Use preloaded images if available, otherwise fall back to direct loading
  if (preloadedImages[trial.imageA]) {
    imageLeft.src = preloadedImages[trial.imageA].src;
  } else {
    imageLeft.src = `${CONFIG.IMAGE_FOLDER}/${trial.imageA}`;
  }

  if (preloadedImages[trial.imageB]) {
    imageRight.src = preloadedImages[trial.imageB].src;
  } else {
    imageRight.src = `${CONFIG.IMAGE_FOLDER}/${trial.imageB}`;
  }

  // Check if there's an existing response for this trial
  const existingComparison = state.comparisons.find(c => c.trialNumber === state.currentTrial + 1);

  // Reset/restore response
  const responseRadios = document.querySelectorAll('input[name="comparison-response"]');
  const nextBtn = document.getElementById('next-comparison-btn');

  if (existingComparison) {
    // Restore previous response
    responseRadios.forEach(radio => {
      radio.checked = radio.value === existingComparison.response;
    });
    nextBtn.disabled = false;
  } else {
    // Clear response
    responseRadios.forEach(radio => {
      radio.checked = false;
    });
    nextBtn.disabled = true;
  }

  // Update button text for last trial
  if (state.currentTrial === CONFIG.NUM_COMPARISONS - 1) {
    nextBtn.textContent = 'Continue to Demographics';
  } else {
    nextBtn.textContent = 'Next';
  }
}

function recordComparison() {
  const trial = state.trialPairs[state.currentTrial];
  const selectedResponse = document.querySelector('input[name="comparison-response"]:checked');

  if (!selectedResponse) return;

  const responseValue = {
    'definitely_A': -2,
    'probably_A': -1,
    'equal': 0,
    'probably_B': 1,
    'definitely_B': 2
  };

  const comparison = {
    trialNumber: state.currentTrial + 1,
    isAttentionCheck: trial.isAttentionCheck,
    imageLeft: trial.imageA,
    imageRight: trial.imageB,
    response: selectedResponse.value,
    responseValue: responseValue[selectedResponse.value],
    responseTimestamp: new Date().toISOString()
  };

  // Check if this trial already has a response (update instead of add)
  const existingIndex = state.comparisons.findIndex(c => c.trialNumber === state.currentTrial + 1);
  if (existingIndex !== -1) {
    state.comparisons[existingIndex] = comparison;
  } else {
    state.comparisons.push(comparison);
  }

  // Save after each comparison
  saveProgress('comparison_' + (state.currentTrial + 1));
}

// ============================================
// Demographics Page
// ============================================
function initDemographicsPage() {
  const submitBtn = document.getElementById('submit-demographics-btn');
  const backBtn = document.getElementById('demographics-back-btn');
  const errorDiv = document.getElementById('demographics-error');

  submitBtn.addEventListener('click', () => {
    const age = document.getElementById('demo-age').value;
    const gender = document.getElementById('demo-gender').value;
    const education = document.getElementById('demo-education').value;
    const country = document.getElementById('demo-country').value;
    const political = document.getElementById('demo-political').value;

    // Validate required fields
    if (!age || !gender || !education || !country) {
      errorDiv.textContent = 'Please fill in all required fields (Age, Gender, Education, Country).';
      errorDiv.hidden = false;
      return;
    }

    if (parseInt(age) < 18 || parseInt(age) > 120) {
      errorDiv.textContent = 'Please enter a valid age (18-120).';
      errorDiv.hidden = false;
      return;
    }

    errorDiv.hidden = true;

    state.demographics = {
      age: parseInt(age),
      gender,
      education,
      country: country.trim(),
      politicalLeaning: political || 'Not provided'
    };

    state.timestamps.demographicsComplete = new Date().toISOString();
    state.progressStatus = 'completed';

    // Final save and show completion
    saveProgress('demographics_complete').then(() => {
      showPanel('completion');
      loadCompletionCode();
    });
  });

  // Back button - go to last comparison
  backBtn.addEventListener('click', () => {
    // Save current demographics state
    saveDemographicsState();

    state.currentTrial = CONFIG.NUM_COMPARISONS - 1;
    showPanel('comparison');
    loadComparison();
  });
}

function saveDemographicsState() {
  state.demographics = {
    age: document.getElementById('demo-age').value ? parseInt(document.getElementById('demo-age').value) : null,
    gender: document.getElementById('demo-gender').value || null,
    education: document.getElementById('demo-education').value || null,
    country: document.getElementById('demo-country').value?.trim() || null,
    politicalLeaning: document.getElementById('demo-political').value || null
  };
}

function restoreDemographicsPage() {
  if (state.demographics.age) {
    document.getElementById('demo-age').value = state.demographics.age;
  }
  if (state.demographics.gender) {
    document.getElementById('demo-gender').value = state.demographics.gender;
  }
  if (state.demographics.education) {
    document.getElementById('demo-education').value = state.demographics.education;
  }
  if (state.demographics.country) {
    document.getElementById('demo-country').value = state.demographics.country;
  }
  if (state.demographics.politicalLeaning) {
    document.getElementById('demo-political').value = state.demographics.politicalLeaning;
  }
}

// ============================================
// Completion Page
// ============================================
async function loadCompletionCode() {
  const codeElement = document.getElementById('completion-code');

  try {
    const response = await fetch(`${CONFIG.API_BASE}/get-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: state.recruitment.source,
        userId: state.recruitment.participantId
      })
    });

    const data = await response.json();

    if (data.code) {
      codeElement.textContent = data.code;
    } else {
      // Generate a fallback code if API fails
      codeElement.textContent = 'VCS-' + state.sessionId.substring(0, 8).toUpperCase();
    }
  } catch (err) {
    console.error('Error fetching completion code:', err);
    // Use session-based fallback code
    codeElement.textContent = 'VCS-' + state.sessionId.substring(0, 8).toUpperCase();
  }
}

// ============================================
// Data Persistence
// ============================================
async function saveProgress(status) {
  try {
    const payload = {
      sessionId: state.sessionId,
      recruitment: state.recruitment,
      comparisons: state.comparisons,
      attentionCheckPosition: state.attentionCheckPosition,
      attentionCheckPassed: state.attentionCheckPassed,
      demographics: state.demographics,
      timestamps: state.timestamps,
      progressStatus: status,
      trialPairs: state.trialPairs.map(p => ({
        imageA: p.imageA,
        imageB: p.imageB,
        isAttentionCheck: p.isAttentionCheck
      })),
      updatedAt: new Date().toISOString()
    };

    const response = await fetch(`${CONFIG.API_BASE}/store-conjoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to save progress:', response.status);
    }

    return response.json();
  } catch (err) {
    console.error('Error saving progress:', err);
    // Don't block user progress on save failure
    return null;
  }
}

// ============================================
// Initialization
// ============================================
function init() {
  // Initialize session
  state.sessionId = getOrCreateSessionId();

  // Initialize all pages
  initConsentPage();
  initRecruitmentPage();
  initInstructionsPage();
  initComparisonPage();
  initDemographicsPage();

  // Show consent panel
  showPanel('consent');

  console.log('[Visual Conjoint] Initialized with session:', state.sessionId);
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
