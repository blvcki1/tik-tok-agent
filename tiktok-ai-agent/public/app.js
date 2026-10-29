// ============================================================================
// TIKTOK AI AGENT STUDIO — FRONTEND ENGINE (9:16 CANVAS + GEMINI IA + AUTO-PILOT)
// ============================================================================

const canvas = document.getElementById("preview-canvas");
const ctx = canvas.getContext("2d");
const videoEl = document.getElementById("source-video");

let uploadedImage = null;
let isVideoLoaded = false;
let animFrameId = null;

let retouchState = {
  preset: "vitalite_emeraude",
  brightness: 108,
  contrast: 114,
  saturation: 122,
  warmth: 12,
  vignette: 20,
  cropMode: "blur_fill" // "blur_fill" | "center_cover"
};

// Navigation entre les onglets
function switchTab(tabName) {
  ["studio", "autopilot", "settings"].forEach((t) => {
    document.getElementById(`tab-${t}`).classList.toggle("hidden", t !== tabName);
    document.getElementById(`tab-btn-${t}`).classList.toggle("active", t === tabName);
  });
}

// Charger l'état du serveur au démarrage
async function loadServerState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();

    if (data.settings) {
      document.getElementById("cfg-niche").value = data.settings.niche || "";
      document.getElementById("cfg-handle").value = data.settings.tiktokHandle || "";
      document.getElementById("cfg-gemini-key").value = data.settings.geminiApiKey || "";
      document.getElementById("cfg-tt-key").value = data.settings.tiktokClientKey || "";
      document.getElementById("cfg-tt-secret").value = data.settings.tiktokClientSecret || "";

      const pillGemini = document.getElementById("pill-gemini");
      if (data.settings.hasGeminiKey) {
        pillGemini.textContent = "🧠 IA : Gemini 2.5 Flash Vision Connecté";
        pillGemini.className = "pill ok";
      } else {
        pillGemini.textContent = "🧠 IA : Moteur Autonome Local Actif";
        pillGemini.className = "pill ok";
      }

      const pillTikTok = document.getElementById("pill-tiktok");
      if (data.settings.hasTikTokConnected) {
        pillTikTok.textContent = "🔗 TikTok : Compte Connecté (API Direct Post)";
        pillTikTok.className = "pill ok";
      } else {
        pillTikTok.textContent = "🔗 TikTok : Mode Prêt-à-Publier";
        pillTikTok.className = "pill warn";
      }
    }

    renderPostsList(data.posts || []);
  } catch (err) {
    console.error("Erreur chargement état:", err);
  }
}

// ============================================================================
// 1. GESTION DE L'UPLOAD PHOTO OU VIDÉO & ANALYSE LUMINANCE
// ============================================================================
function handleMediaUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  document.getElementById("upload-filename").textContent = `Fichier chargé : ${file.name} — Prêt pour retouche IA`;

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  const url = URL.createObjectURL(file);

  if (file.type.startsWith("video/")) {
    isVideoLoaded = true;
    uploadedImage = null;
    videoEl.src = url;
    videoEl.play();
    const renderLoop = () => {
      renderCanvas();
      if (isVideoLoaded) {
        animFrameId = requestAnimationFrame(renderLoop);
      }
    };
    videoEl.onloadeddata = () => {
      renderLoop();
      runAutonomousAI(); // Lance automatiquement l'analyse et retouche IA dès l'import !
    };
  } else {
    isVideoLoaded = false;
    videoEl.pause();
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      renderCanvas();
      runAutonomousAI(); // Lance automatiquement l'analyse et retouche IA dès l'import !
    };
    img.src = url;
  }
}

// Calculer la luminosité moyenne de l'image pour guider la retouche auto
function computeImageStats() {
  const source = isVideoLoaded ? videoEl : uploadedImage;
  if (!source) return { avgLuminance: 128 };

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 64;
  tempCanvas.height = 64;
  const tCtx = tempCanvas.getContext("2d");
  tCtx.drawImage(source, 0, 0, 64, 64);
  const pixels = tCtx.getImageData(0, 0, 64, 64).data;

  let totalLum = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    totalLum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  return { avgLuminance: Math.round(totalLum / count) };
}

// Extraire une miniature Base64 légère pour l'envoyer à Gemini Vision
function getSourceBase64ForAI() {
  const source = isVideoLoaded ? videoEl : uploadedImage;
  if (!source) return null;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 540;
  tempCanvas.height = 960;
  const tCtx = tempCanvas.getContext("2d");
  tCtx.drawImage(source, 0, 0, 540, 960);
  return tempCanvas.toDataURL("image/jpeg", 0.8);
}

// ============================================================================
// 2. MOTEUR DE RENDU ET RETOUCHE 9:16 TIKTOK (1080x1920)
// ============================================================================
function renderCanvas() {
  const W = canvas.width;  // 1080
  const H = canvas.height; // 1920
  ctx.clearRect(0, 0, W, H);

  const source = isVideoLoaded ? videoEl : uploadedImage;
  const filterStr = `brightness(${retouchState.brightness}%) contrast(${retouchState.contrast}%) saturate(${retouchState.saturation}%)`;

  if (source) {
    const srcW = isVideoLoaded ? (videoEl.videoWidth || 1080) : uploadedImage.width;
    const srcH = isVideoLoaded ? (videoEl.videoHeight || 1920) : uploadedImage.height;

    if (retouchState.cropMode === "blur_fill") {
      // 1. Fond flouté 9:16 harmonieux (évite les bandes noires sur TikTok)
      ctx.save();
      ctx.filter = `${filterStr} blur(38px) brightness(75%)`;
      const scaleBg = Math.max(W / srcW, H / srcH) * 1.12;
      const bgW = srcW * scaleBg;
      const bgH = srcH * scaleBg;
      ctx.drawImage(source, (W - bgW) / 2, (H - bgH) / 2, bgW, bgH);
      ctx.restore();

      // 2. Média principal net centré avec ombre portée cinéma
      ctx.save();
      ctx.filter = filterStr;
      const scaleFg = Math.min(W / srcW, (H * 0.76) / srcH);
      const fgW = srcW * scaleFg;
      const fgH = srcH * scaleFg;
      const fgX = (W - fgW) / 2;
      const fgY = (H - fgH) / 2;

      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = 45;
      ctx.drawImage(source, fgX, fgY, fgW, fgH);
      ctx.restore();
    } else {
      // Mode Plein Écran Vertical 9:16 (Center Cover)
      ctx.save();
      ctx.filter = filterStr;
      const scale = Math.max(W / srcW, H / srcH);
      const dW = srcW * scale;
      const dH = srcH * scale;
      ctx.drawImage(source, (W - dW) / 2, (H - dH) / 2, dW, dH);
      ctx.restore();
    }
  } else {
    // Affiche IA générée automatiquement si aucune photo n'est chargée
    drawGeneratedPosterBackground(W, H);
  }

  // 3. Calque de Chaleur Dorée / Émeraude (Color Grading IA)
  if (retouchState.warmth > 0) {
    ctx.save();
    const alpha = (retouchState.warmth / 100) * 0.35;
    const grad = ctx.createLinearGradient(0, 0, W, H);
    if (retouchState.preset === "vitalite_emeraude") {
      grad.addColorStop(0, `rgba(16, 185, 129, ${alpha})`);
      grad.addColorStop(1, `rgba(245, 158, 11, ${alpha})`);
    } else {
      grad.addColorStop(0, `rgba(251, 191, 36, ${alpha})`);
      grad.addColorStop(1, `rgba(236, 72, 153, ${alpha * 0.7})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 4. Vignette Cinéma (assombrit légèrement les bords pour faire ressortir le texte TikTok)
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, H * 0.65);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.52)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  // 5. Incrustation du Bandeau Hook TikTok en haut
  const hookText = document.getElementById("input-hook-top")?.value?.trim();
  if (hookText) {
    drawTopHookBanner(hookText, W);
  }

  // 6. Incrustation du Sticker Call-To-Action en bas
  const badgeBottom = document.getElementById("input-badge-bottom")?.value?.trim();
  if (badgeBottom) {
    drawBottomSticker(badgeBottom, W, H);
  }
}

function drawGeneratedPosterBackground(W, H) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#052e22");
  grad.addColorStop(0.5, "#0b4f3a");
  grad.addColorStop(1, "#041610");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Cercles lumineux décoratifs
  ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.25, 340, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(245, 158, 11, 0.14)";
  ctx.beginPath();
  ctx.arc(W * 0.2, H * 0.75, 380, 0, Math.PI * 2);
  ctx.fill();

  // Texte central du sujet
  const topic = document.getElementById("input-topic")?.value || "Santé & Bien-Être Naturel";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 64px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  wrapText(ctx, "🌿 " + topic.toUpperCase(), W / 2, H * 0.44, W - 160, 80);
}

function drawTopHookBanner(text, W) {
  ctx.save();
  const boxX = 70;
  const boxY = 135;
  const boxW = W - 140;
  const boxH = 215;

  // Ombre et fond du bandeau Hook TikTok
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "rgba(10, 20, 16, 0.9)";
  roundRect(ctx, boxX, boxY, boxW, boxH, 32);
  ctx.fill();

  // Bordure lumineuse
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#10b981";
  ctx.stroke();

  // Texte Hook centré
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 46px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  wrapText(ctx, text, W / 2, boxY + 86, boxW - 60, 58);
  ctx.restore();
}

function drawBottomSticker(text, W, H) {
  ctx.save();
  const boxW = W - 160;
  const boxH = 115;
  const boxX = 80;
  const boxY = H - 340;

  const grad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY);
  grad.addColorStop(0, "#f59e0b");
  grad.addColorStop(1, "#ea580c");

  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = grad;
  roundRect(ctx, boxX, boxY, boxW, boxH, 999);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#08100c";
  ctx.font = "900 40px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text.slice(0, 42), W / 2, boxY + 72);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());

  const totalOffset = ((lines.length - 1) * lineHeight) / 2;
  lines.slice(0, 4).forEach((l, i) => {
    context.fillText(l, x, y - totalOffset + i * lineHeight);
  });
}

// ============================================================================
// 3. APPEL À L'AGENT IA (ANALYSE PHOTO/VIDÉO + RETOUCHE + LÉGENDE)
// ============================================================================
async function runAutonomousAI() {
  const btn = document.getElementById("btn-run-ai");
  const oldText = btn.textContent;
  btn.textContent = "⏳ Analyse de l'image, retouche 9:16 et rédaction par l'IA en cours...";
  btn.disabled = true;

  try {
    const topic = document.getElementById("input-topic").value;
    const postGoal = document.getElementById("input-goal").value;
    const imageStats = computeImageStats();
    const imageBase64 = getSourceBase64ForAI();

    const res = await fetch("/api/ai/analyze-and-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        postGoal,
        imageStats,
        imageBase64,
        mimeType: "image/jpeg"
      })
    });

    const data = await res.json();
    if (data.ok && data.aiPlan) {
      const plan = data.aiPlan;

      // Appliquer les réglages de retouche décidés par l'IA
      if (plan.retouchSettings) {
        retouchState = {
          ...retouchState,
          ...plan.retouchSettings
        };
        syncSlidersToState();
      }

      // Mettre à jour les textes (Hook, Sticker, Légende, Hashtags, Voix-Off)
      if (plan.hookTop) document.getElementById("input-hook-top").value = plan.hookTop;
      if (plan.badgeBottom) document.getElementById("input-badge-bottom").value = plan.badgeBottom;
      if (plan.caption) document.getElementById("input-caption").value = plan.caption;
      if (Array.isArray(plan.hashtags)) {
        document.getElementById("input-hashtags").value = plan.hashtags.join(" ");
      }
      if (plan.voiceoverScript) {
        document.getElementById("input-voiceover").value = plan.voiceoverScript;
      }

      // Afficher le diagnostic de retouche IA
      const diagBox = document.getElementById("ai-diagnosis-box");
      diagBox.classList.remove("hidden");
      diagBox.innerHTML = `<strong>🤖 Diagnostic & Retouche IA (${plan.source}) :</strong> ${plan.aiDiagnosis} <br/><span style="color:#34d399;">⏰ Créneau recommandé : ${plan.bestTimeToPost || "19h45"}</span>`;

      renderCanvas();
    }
  } catch (err) {
    alert("Erreur lors de l'analyse IA : " + err.message);
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
}

function syncSlidersToState() {
  document.getElementById("sl-brightness").value = retouchState.brightness;
  document.getElementById("val-brightness").textContent = `${retouchState.brightness}%`;

  document.getElementById("sl-contrast").value = retouchState.contrast;
  document.getElementById("val-contrast").textContent = `${retouchState.contrast}%`;

  document.getElementById("sl-saturation").value = retouchState.saturation;
  document.getElementById("val-saturation").textContent = `${retouchState.saturation}%`;

  document.getElementById("sl-warmth").value = retouchState.warmth;
  document.getElementById("val-warmth").textContent = `${retouchState.warmth}%`;

  document.getElementById("crop-mode-label").textContent =
    retouchState.cropMode === "blur_fill" ? "Fond Flouté Pro" : "Plein Écran";
}

function updateRetouchFromUI() {
  retouchState.brightness = Number(document.getElementById("sl-brightness").value);
  retouchState.contrast = Number(document.getElementById("sl-contrast").value);
  retouchState.saturation = Number(document.getElementById("sl-saturation").value);
  retouchState.warmth = Number(document.getElementById("sl-warmth").value);
  syncSlidersToState();
  renderCanvas();
}

function applyPreset(presetName, btnEl) {
  document.querySelectorAll(".preset-row .chip").forEach((c) => c.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  const presets = {
    vitalite_emeraude: { brightness: 108, contrast: 114, saturation: 124, warmth: 12 },
    eclat_studio: { brightness: 116, contrast: 118, saturation: 112, warmth: 6 },
    chaleur_doree: { brightness: 106, contrast: 112, saturation: 126, warmth: 26 },
    cinema_contraste: { brightness: 102, contrast: 132, saturation: 116, warmth: 10 }
  };

  retouchState.preset = presetName;
  Object.assign(retouchState, presets[presetName] || presets.vitalite_emeraude);
  syncSlidersToState();
  renderCanvas();
}

function toggleCropMode() {
  retouchState.cropMode = retouchState.cropMode === "blur_fill" ? "center_cover" : "blur_fill";
  syncSlidersToState();
  renderCanvas();
}

function generatePosterWithoutPhoto() {
  uploadedImage = null;
  isVideoLoaded = false;
  videoEl.pause();
  renderCanvas();
  runAutonomousAI();
}

function downloadProcessedMedia() {
  renderCanvas();
  const link = document.createElement("a");
  link.download = `tiktok_9x16_retouche_ia_${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ============================================================================
// 4. SYNTHÈSE VOCALE VOIX-OFF & PLANIFICATION 15 MIN AVANT LIVE
// ============================================================================
function speakVoiceover() {
  const raw = document.getElementById("input-voiceover").value;
  if (!raw) return;
  const cleanText = raw.replace(/\[.*?\]/g, "");
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "fr-FR";
    utter.rate = 1.04;
    window.speechSynthesis.speak(utter);
  } else {
    alert("La synthèse vocale n'est pas supportée sur ce navigateur.");
  }
}

function setPreLive15Min() {
  const in15Min = new Date(Date.now() + 15 * 60 * 1000);
  const tzOffset = in15Min.getTimezoneOffset() * 60000;
  const localISO = new Date(in15Min - tzOffset).toISOString().slice(0, 16);
  document.getElementById("input-schedule-time").value = localISO;
  document.getElementById("input-goal").value = "annonce_live_15min";
  runAutonomousAI();
}

// ============================================================================
// 5. PUBLICATION IMMÉDIATE OU PROGRAMMATION AUTO-PILOT
// ============================================================================
async function saveOrPublishPost(action) {
  renderCanvas();
  const processedImageBase64 = canvas.toDataURL("image/png");
  const topic = document.getElementById("input-topic").value;
  const postGoal = document.getElementById("input-goal").value;
  const hookTop = document.getElementById("input-hook-top").value;
  const badgeBottom = document.getElementById("input-badge-bottom").value;
  const caption = document.getElementById("input-caption").value;
  const hashtags = document
    .getElementById("input-hashtags")
    .value.split(/\s+/)
    .filter(Boolean);
  const voiceoverScript = document.getElementById("input-voiceover").value;
  let scheduledAt = document.getElementById("input-schedule-time").value;

  if (action === "schedule" && !scheduledAt) {
    const in30Min = new Date(Date.now() + 30 * 60 * 1000);
    scheduledAt = in30Min.toISOString();
  }

  try {
    const res = await fetch("/api/posts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        topic,
        postGoal,
        hookTop,
        badgeBottom,
        caption,
        hashtags,
        voiceoverScript,
        retouchSettings: retouchState,
        processedImageBase64,
        scheduledAt
      })
    });

    const data = await res.json();
    if (data.ok) {
      await loadServerState();
      switchTab("autopilot");
    }
  } catch (err) {
    alert("Erreur lors de l'enregistrement : " + err.message);
  }
}

async function generateAutonomousBatch() {
  const customTopic = document.getElementById("autopilot-topic").value;
  try {
    const res = await fetch("/api/autopilot/generate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customTopic })
    });
    const data = await res.json();
    if (data.ok) {
      await loadServerState();
    }
  } catch (err) {
    alert("Erreur génération batch : " + err.message);
  }
}

function renderPostsList(posts) {
  document.getElementById("post-count").textContent = posts.length;
  const container = document.getElementById("posts-container");

  if (!posts.length) {
    container.innerHTML = `<div style="color:var(--muted); padding:20px;">Aucune publication dans la file pour le moment. Utilisez le Studio ou cliquez sur "Générer & Programmer 3 Publications Autonomes".</div>`;
    return;
  }

  container.innerHTML = posts
    .map((p) => {
      const isSched = p.status === "scheduled";
      const badgeClass = isSched ? "badge-scheduled" : "badge-published";
      const badgeLabel = isSched ? "⏰ Programmé (Auto-Pilot)" : "✅ Exécuté / Prêt";
      const timeStr = p.scheduledAt
        ? new Date(p.scheduledAt).toLocaleString("fr-FR")
        : new Date(p.createdAt).toLocaleString("fr-FR");

      return `
      <div class="post-item">
        ${
          p.mediaUrl
            ? `<img src="${p.mediaUrl}" class="post-thumb" alt="Visuel 9:16" />`
            : `<div class="post-thumb" style="display:flex;align-items:center;justify-content:center;padding:14px;text-align:center;font-weight:800;background:linear-gradient(135deg,#063829,#0f1724);color:#34d399;">🌿 ${p.hookTop || p.topic}</div>`
        }
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="badge-status ${badgeClass}">${badgeLabel}</span>
          <span style="font-size:0.75rem; color:var(--muted);">${timeStr}</span>
        </div>
        <div style="font-weight:800; font-size:0.95rem; color:#fff;">${p.hookTop || p.topic}</div>
        <div style="font-size:0.8rem; color:#cbd5e1; white-space:pre-line; max-height:90px; overflow-y:auto;">${p.caption}</div>
        <div style="font-size:0.75rem; color:#38bdf8;">${(p.hashtags || []).join(" ")}</div>
        ${p.publishNote ? `<div style="font-size:0.74rem; color:#fbbf24;">ℹ️ ${p.publishNote}</div>` : ""}
        <div style="display:flex; gap:8px; margin-top:auto;">
          <button class="btn btn-outline" style="flex:1; padding:8px; font-size:0.78rem;" onclick="copyPostCaption('${encodeURIComponent(p.caption + "\n\n" + (p.hashtags || []).join(" "))}')">
            📋 Copier Légende
          </button>
          <button class="btn btn-outline" style="padding:8px 12px; font-size:0.78rem; color:#f87171;" onclick="deletePost('${p.id}')">
            🗑️
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

function copyPostCaption(encoded) {
  const text = decodeURIComponent(encoded);
  navigator.clipboard.writeText(text).then(() => {
    alert("📋 Légende + Hashtags copiés dans le presse-papiers !");
  });
}

async function deletePost(id) {
  await fetch(`/api/posts/${id}`, { method: "DELETE" });
  loadServerState();
}

// ============================================================================
// 6. PARAMÈTRES & CONNEXION OAUTH TIKTOK
// ============================================================================
async function saveAllSettings() {
  const payload = {
    niche: document.getElementById("cfg-niche").value,
    tiktokHandle: document.getElementById("cfg-handle").value,
    geminiApiKey: document.getElementById("cfg-gemini-key").value.trim(),
    tiktokClientKey: document.getElementById("cfg-tt-key").value.trim(),
    tiktokClientSecret: document.getElementById("cfg-tt-secret").value.trim()
  };

  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.ok) {
    await loadServerState();
    alert("✅ Paramètres enregistrés avec succès !");
  }
}

async function connectTikTokOAuth() {
  await saveAllSettings();
  const res = await fetch("/api/tiktok/auth-url");
  const data = await res.json();
  if (data.ok && data.authUrl) {
    window.location.href = data.authUrl;
  } else {
    alert(data.message || "Veuillez d'abord renseigner votre Client Key TikTok Developer.");
  }
}

// Initialisation au chargement de la page
window.addEventListener("DOMContentLoaded", () => {
  loadServerState();
  renderCanvas();
  runAutonomousAI();
});
