// Visual Conjoint Survey - Client-side Logic

// ============================================
// Configuration
// ============================================
const CONFIG = {
  NUM_COMPARISONS: 10,
  API_BASE: '/webhook3/api',
  IMAGE_FOLDER: 'stimuli_images',
  RESPONSE_TIME_WARNING: 10000 // 10 seconds in milliseconds
};

// Available images - update this list when adding new images
// Naming: google-gemini-2.5-flash-image-{Age}_{Gender}_{Ethnicity}_{Religion}_{Clothing}_{Appearance}.png
const AVAILABLE_IMAGES = [
  'google-gemini-2.5-flash-image-Adult_F_SAsian_Muslim_Formal_WellMaint.png',
  'google-gemini-2.5-flash-image-Adult_F_White_NonMuslim_Casual_Disheveled.png',
  'google-gemini-2.5-flash-image-Adult_M_White_NonMuslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-MiddleAged_M_Black_NonMuslim_Formal_WellMaint.png',
  'google-gemini-2.5-flash-image-MiddleAged_M_MENA_Muslim_Formal_Disheveled.png',
  'google-gemini-2.5-flash-image-MiddleAged_M_SAsian_Muslim_Casual_Disheveled.png',
  'google-gemini-2.5-flash-image-MiddleAged_M_White_Muslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-Older_F_NatAm_NonMuslim_Casual_Disheveled.png',
  'google-gemini-2.5-flash-image-Older_F_White_Muslim_Casual_Disheveled.png',
  'google-gemini-2.5-flash-image-Older_F_White_Muslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-Older_M_SAsian_NonMuslim_Casual_Disheveled.png',
  'google-gemini-2.5-flash-image-Older_M_White_Muslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-Older_M_White_NonMuslim_Casual_Disheveled.png',
  'google-gemini-2.5-flash-image-Older_M_White_NonMuslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-YoungAdult_F_Latino_NonMuslim_Formal_Disheveled.png',
  'google-gemini-2.5-flash-image-YoungAdult_F_SEAsian_Muslim_Formal_Disheveled.png',
  'google-gemini-2.5-flash-image-YoungAdult_F_White_Muslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-YoungAdult_F_White_NonMuslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-YoungAdult_M_Black_Muslim_Casual_WellMaint.png',
  'google-gemini-2.5-flash-image-YoungAdult_M_White_NonMuslim_Casual_Disheveled.png'
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
  comparisons: [],
  currentTrial: 0,
  attentionCheckPosition: null,
  attentionCheckPassed: null,
  trialPairs: [],
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

// Timer state
let comparisonTimer = null;
let comparisonStartTime = null;

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
// Browser History Navigation
// ============================================
function navigateTo(panelId, addToHistory = true) {
  // Hide all panels
  Object.values(panels).forEach(panel => {
    if (panel) panel.hidden = true;
  });

  // Show requested panel
  if (panels[panelId]) {
    panels[panelId].hidden = false;
    window.scrollTo(0, 0);
  }

  // Add to browser history
  if (addToHistory) {
    const historyState = {
      panel: panelId,
      trial: state.currentTrial
    };
    history.pushState(historyState, '', `#${panelId}`);
  }
}

function handlePopState(event) {
  if (event.state && event.state.panel) {
    const panelId = event.state.panel;

    // Restore trial number if going back to comparison
    if (panelId === 'comparison' && typeof event.state.trial === 'number') {
      state.currentTrial = event.state.trial;
      navigateTo('comparison', false);
      loadComparison();
    } else if (panelId === 'recruitment') {
      restoreRecruitmentPage();
      navigateTo('recruitment', false);
    } else if (panelId === 'demographics') {
      restoreDemographicsPage();
      navigateTo('demographics', false);
    } else {
      navigateTo(panelId, false);
    }
  }
}

// ============================================
// Image Sampling
// ============================================
function sampleRandomImage() {
  const index = Math.floor(Math.random() * AVAILABLE_IMAGES.length);
  return AVAILABLE_IMAGES[index];
}

function sampleImagePair() {
  const imageA = sampleRandomImage();
  let imageB = sampleRandomImage();
  while (imageB === imageA) {
    imageB = sampleRandomImage();
  }
  return { imageA, imageB };
}

function generateTrialPairs() {
  const pairs = [];
  state.attentionCheckPosition = Math.floor(Math.random() * CONFIG.NUM_COMPARISONS);

  for (let i = 0; i < CONFIG.NUM_COMPARISONS; i++) {
    if (i === state.attentionCheckPosition) {
      const sameImage = sampleRandomImage();
      pairs.push({
        imageA: sameImage,
        imageB: sameImage,
        isAttentionCheck: true
      });
    } else {
      const { imageA, imageB } = sampleImagePair();
      pairs.push({
        imageA,
        imageB,
        isAttentionCheck: false
      });
    }
  }

  return pairs;
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
    navigateTo('recruitment');
  });

  declineBtn.addEventListener('click', () => {
    navigateTo('declined');
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

  sourceRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.recruitment.source = e.target.value;

      // Show ID field and warning
      sourceIdField.hidden = false;
      sourceIdWarning.hidden = false;

      // Update label based on source
      if (e.target.value === 'cloudresearch') {
        sourceIdLabel.textContent = 'Your CloudResearch ID';
        sourceIdInput.placeholder = 'Enter your CloudResearch ID';
      } else if (e.target.value === 'prolific') {
        sourceIdLabel.textContent = 'Your Prolific ID';
        sourceIdInput.placeholder = 'Enter your Prolific ID';
      } else if (e.target.value === 'clickworker') {
        sourceIdLabel.textContent = 'Your Clickworker ID';
        sourceIdInput.placeholder = 'Enter your Clickworker ID';
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
      navigateTo('instructions');
    }
  });
}

function updateRecruitmentContinueButton() {
  const continueBtn = document.getElementById('recruitment-continue-btn');
  const hasSource = state.recruitment.source !== null;
  const hasId = state.recruitment.participantId && state.recruitment.participantId.trim().length > 0;
  continueBtn.disabled = !(hasSource && hasId);
}

function restoreRecruitmentPage() {
  const sourceRadios = document.querySelectorAll('input[name="recruitment-source"]');
  const sourceIdField = document.getElementById('source-id-field');
  const sourceIdInput = document.getElementById('source-id');
  const sourceIdLabel = document.getElementById('source-id-label');
  const sourceIdWarning = document.getElementById('source-id-warning');

  if (state.recruitment.source) {
    sourceRadios.forEach(radio => {
      radio.checked = radio.value === state.recruitment.source;
    });

    sourceIdField.hidden = false;
    sourceIdWarning.hidden = false;

    if (state.recruitment.source === 'cloudresearch') {
      sourceIdLabel.textContent = 'Your CloudResearch ID';
      sourceIdInput.placeholder = 'Enter your CloudResearch ID';
    } else if (state.recruitment.source === 'prolific') {
      sourceIdLabel.textContent = 'Your Prolific ID';
      sourceIdInput.placeholder = 'Enter your Prolific ID';
    } else if (state.recruitment.source === 'clickworker') {
      sourceIdLabel.textContent = 'Your Clickworker ID';
      sourceIdInput.placeholder = 'Enter your Clickworker ID';
    } else {
      sourceIdLabel.textContent = 'Your Name or Email';
      sourceIdInput.placeholder = 'Enter your name or email';
    }

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
const preloadedImages = {};

function getUniqueImagesFromTrials() {
  const uniqueImages = new Set();
  state.trialPairs.forEach(trial => {
    uniqueImages.add(trial.imageA);
    uniqueImages.add(trial.imageB);
  });
  return Array.from(uniqueImages);
}

async function preloadImages(imageList, onProgress) {
  if (!imageList || imageList.length === 0) return;

  let loaded = 0;
  const total = imageList.length;

  const promises = imageList.map(imageName => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        preloadedImages[imageName] = img;
        if (onProgress) onProgress(loaded, total);
        resolve();
      };
      img.onerror = () => {
        loaded++;
        if (onProgress) onProgress(loaded, total);
        resolve();
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
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingProgress = document.getElementById('loading-progress');

  startBtn.addEventListener('click', async () => {
    try {
      state.timestamps.instructionsComplete = new Date().toISOString();

      if (state.trialPairs.length === 0) {
        state.trialPairs = generateTrialPairs();
      }

      if (!imagesPreloaded) {
        loadingOverlay.classList.add('show');
        startBtn.disabled = true;

        const uniqueImages = getUniqueImagesFromTrials();

        if (uniqueImages.length > 0) {
          loadingProgress.textContent = `0 / ${uniqueImages.length}`;
          await preloadImages(uniqueImages, (loaded, total) => {
            loadingProgress.textContent = `${loaded} / ${total}`;
          });
        }

        imagesPreloaded = true;
        loadingOverlay.classList.remove('show');
        startBtn.disabled = false;
      }

      state.currentTrial = 0;
      saveProgress('instructions_complete');
      navigateTo('comparison');
      loadComparison();
    } catch (err) {
      console.error('[Instructions] Error:', err);
      loadingOverlay.classList.remove('show');
      startBtn.disabled = false;
      state.currentTrial = 0;
      navigateTo('comparison');
      loadComparison();
    }
  });
}

// ============================================
// Comparison Page
// ============================================

// Check if viewport is mobile width
function isMobileViewport() {
  return window.innerWidth <= 768;
}

// Setup mobile layout for comparison panel
function setupMobileComparisonLayout() {
  const comparisonPanel = document.getElementById('comparison-panel');
  const imageComparison = comparisonPanel.querySelector('.image-comparison');
  const ratingScale = comparisonPanel.querySelector('.rating-scale');
  const timeWarning = document.getElementById('time-warning');

  // Check if mobile layout already exists
  let mobileWrapper = comparisonPanel.querySelector('.mobile-comparison-layout');

  if (isMobileViewport()) {
    // Create mobile layout if it doesn't exist
    if (!mobileWrapper) {
      mobileWrapper = document.createElement('div');
      mobileWrapper.className = 'mobile-comparison-layout';

      // Insert wrapper before the original elements
      imageComparison.parentNode.insertBefore(mobileWrapper, imageComparison);

      // Move elements into wrapper
      mobileWrapper.appendChild(imageComparison);
      mobileWrapper.appendChild(ratingScale);

      // Move time warning after the mobile wrapper
      if (timeWarning && timeWarning.parentNode) {
        mobileWrapper.parentNode.insertBefore(timeWarning, mobileWrapper.nextSibling);
      }
    }
    comparisonPanel.classList.add('mobile-active');
  } else {
    // Restore desktop layout
    if (mobileWrapper) {
      // Move elements back out of wrapper
      mobileWrapper.parentNode.insertBefore(imageComparison, mobileWrapper);
      mobileWrapper.parentNode.insertBefore(ratingScale, mobileWrapper);

      // Move time warning back to after rating scale
      if (timeWarning && timeWarning.parentNode) {
        ratingScale.parentNode.insertBefore(timeWarning, ratingScale.nextSibling);
      }

      // Remove wrapper
      mobileWrapper.remove();
    }
    comparisonPanel.classList.remove('mobile-active');
  }
}

// Handle viewport resize
let resizeTimeout = null;
function handleViewportResize() {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const comparisonPanel = document.getElementById('comparison-panel');
    if (comparisonPanel && !comparisonPanel.hidden) {
      setupMobileComparisonLayout();
    }
  }, 100);
}

function initComparisonPage() {
  const responseRadios = document.querySelectorAll('input[name="comparison-response"]');
  const nextBtn = document.getElementById('next-comparison-btn');

  responseRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      nextBtn.disabled = false;
      // Hide warning when user responds
      const timeWarning = document.getElementById('time-warning');
      if (timeWarning) timeWarning.hidden = true;
      // Clear timer
      if (comparisonTimer) {
        clearTimeout(comparisonTimer);
        comparisonTimer = null;
      }
    });
  });

  nextBtn.addEventListener('click', () => {
    recordComparison();

    // Clear any active timer
    if (comparisonTimer) {
      clearTimeout(comparisonTimer);
      comparisonTimer = null;
    }

    state.currentTrial++;

    if (state.currentTrial >= CONFIG.NUM_COMPARISONS) {
      state.timestamps.comparisonsComplete = new Date().toISOString();
      const attentionTrial = state.comparisons.find(c => c.isAttentionCheck);
      state.attentionCheckPassed = attentionTrial ? attentionTrial.response === 'equal' : null;
      saveProgress('comparisons_complete');
      navigateTo('demographics');
      restoreDemographicsPage();
    } else {
      // Add new history entry for each trial so back button works
      const historyState = { panel: 'comparison', trial: state.currentTrial };
      history.pushState(historyState, '', '#comparison');
      loadComparison();
    }
  });

  // Listen for viewport resize
  window.addEventListener('resize', handleViewportResize);
}

function startComparisonTimer() {
  // Clear any existing timer
  if (comparisonTimer) {
    clearTimeout(comparisonTimer);
  }

  comparisonStartTime = Date.now();

  // Set timer to show warning after 10 seconds
  comparisonTimer = setTimeout(() => {
    const timeWarning = document.getElementById('time-warning');
    if (timeWarning) {
      timeWarning.hidden = false;
    }
  }, CONFIG.RESPONSE_TIME_WARNING);
}

function loadComparison() {
  const trial = state.trialPairs[state.currentTrial];

  // Setup mobile layout if needed
  setupMobileComparisonLayout();

  // Update progress
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const progress = ((state.currentTrial) / CONFIG.NUM_COMPARISONS) * 100;
  progressFill.style.width = `${progress}%`;
  progressText.textContent = `Comparison ${state.currentTrial + 1} of ${CONFIG.NUM_COMPARISONS}`;

  // Load images
  const imageLeft = document.getElementById('image-left');
  const imageRight = document.getElementById('image-right');

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

  // Hide time warning
  const timeWarning = document.getElementById('time-warning');
  if (timeWarning) timeWarning.hidden = true;

  // Check for existing response
  const existingComparison = state.comparisons.find(c => c.trialNumber === state.currentTrial + 1);
  const responseRadios = document.querySelectorAll('input[name="comparison-response"]');
  const nextBtn = document.getElementById('next-comparison-btn');

  if (existingComparison) {
    responseRadios.forEach(radio => {
      radio.checked = radio.value === existingComparison.response;
    });
    nextBtn.disabled = false;
  } else {
    responseRadios.forEach(radio => {
      radio.checked = false;
    });
    nextBtn.disabled = true;
    // Start timer for new comparisons
    startComparisonTimer();
  }

  // Update button text
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

  // Calculate response time
  const responseTime = comparisonStartTime ? Date.now() - comparisonStartTime : null;

  const comparison = {
    trialNumber: state.currentTrial + 1,
    isAttentionCheck: trial.isAttentionCheck,
    imageLeft: trial.imageA,
    imageRight: trial.imageB,
    response: selectedResponse.value,
    responseValue: responseValue[selectedResponse.value],
    responseTimestamp: new Date().toISOString(),
    responseTimeMs: responseTime
  };

  const existingIndex = state.comparisons.findIndex(c => c.trialNumber === state.currentTrial + 1);
  if (existingIndex !== -1) {
    state.comparisons[existingIndex] = comparison;
  } else {
    state.comparisons.push(comparison);
  }

  saveProgress('comparison_' + (state.currentTrial + 1));
}

// ============================================
// Demographics Page
// ============================================
function initDemographicsPage() {
  const submitBtn = document.getElementById('submit-demographics-btn');
  const errorDiv = document.getElementById('demographics-error');

  submitBtn.addEventListener('click', () => {
    const age = document.getElementById('demo-age').value;
    const gender = document.getElementById('demo-gender').value;
    const education = document.getElementById('demo-education').value;
    const country = document.getElementById('demo-country').value;
    const political = document.getElementById('demo-political').value;

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

    saveProgress('demographics_complete').then(() => {
      navigateTo('completion');
      loadCompletionCode();
    });
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
      codeElement.textContent = 'VCS-' + state.sessionId.substring(0, 8).toUpperCase();
    }
  } catch (err) {
    console.error('Error fetching completion code:', err);
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
    return null;
  }
}

// ============================================
// Initialization
// ============================================
function init() {
  state.sessionId = getOrCreateSessionId();

  // Initialize all pages
  initConsentPage();
  initRecruitmentPage();
  initInstructionsPage();
  initComparisonPage();
  initDemographicsPage();

  // Handle browser back/forward
  window.addEventListener('popstate', handlePopState);

  // Set initial history state
  history.replaceState({ panel: 'consent' }, '', '#consent');

  // Show consent panel
  navigateTo('consent', false);

  console.log('[Visual Conjoint] Initialized with session:', state.sessionId);
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
