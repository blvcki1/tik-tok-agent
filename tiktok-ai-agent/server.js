const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 3005;
const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, "public");
const DATA_DIR = path.join(BASE_DIR, "data");
const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const STORE_FILE = path.join(DATA_DIR, "store.json");

// Ensure directories exist
for (const dir of [PUBLIC_DIR, DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Default persistent store
const defaultStore = {
  settings: {
    niche: "Santé & Bien-Être Naturel (EDMARK : Shake Off, Splina, Pack P4, Cafés Ginseng/Red Yeast, Cocollagen)",
    brandName: "Espace Santé & Bien-Être",
    tiktokHandle: "@mon_compte_tiktok",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || "",
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
    tiktokAccessToken: "",
    tiktokOpenId: "",
    tiktokConnectedUser: null,
    autoPilotEnabled: true,
    defaultLiveHour: "20:00"
  },
  posts: []
};

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return {
        settings: { ...defaultStore.settings, ...(parsed.settings || {}) },
        posts: Array.isArray(parsed.posts) ? parsed.posts : []
      };
    }
  } catch (err) {
    console.error("Erreur lecture store.json:", err.message);
  }
  return structuredClone(defaultStore);
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

// Helper to parse JSON body (supports up to 35MB for base64 photos/video frames)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const maxBytes = 35 * 1024 * 1024;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Fichier trop volumineux (max 35 Mo)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

// ============================================================================
// 1. MOTEUR D'IA : GOOGLE GEMINI (ANALYSE PHOTO/VIDÉO + RETOUCHE + RÉDACTION)
// ============================================================================
async function analyzeAndDesignWithAI({
  apiKey,
  niche,
  topic,
  postGoal,
  imageBase64,
  mimeType,
  imageStats
}) {
  const cleanSubject = topic || "Bien-être digestif, détox naturelle et vitalité au quotidien";

  // Si une clé Google Gemini API est disponible, appel multimodal réel à Gemini 2.5 Flash
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const prompt = `Tu es un Agent IA expert en création de contenu viral TikTok, montage/retouche photo & vidéo vertical 9:16 et copywriting SEO TikTok.
Contexte de la marque / thématique : ${niche}
Sujet précis de la publication : ${cleanSubject}
Objectif du post : ${postGoal}

IMPORTANT — Règles de conformité TikTok Santé/Vente :
- N'utilise JAMAIS de termes médicaux interdits ("médicament", "guérit", "maladie", "ulcère", "acheter", "WhatsApp").
- Utilise des termes engageants et conformes ("routine naturelle", "bien-être", "astuce détox", "lien dans mon profil / bio", "écris 1 en commentaire").

Si une image est fournie, analyse sa luminosité, ses couleurs et son sujet pour déterminer les meilleurs réglages de retouche automatique (luminosité, contraste, saturation, chaleur, netteté, vignette) afin qu'elle attire l'œil dans le flux "Pour Toi" de TikTok.

Réponds UNIQUEMENT avec un objet JSON valide respectant exactement cette structure :
{
  "aiDiagnosis": "Explication courte (1-2 phrases) de l'analyse visuelle de la photo/vidéo et des retouches appliquées par l'IA",
  "retouchSettings": {
    "preset": "vitalite_emeraude",
    "brightness": 108,
    "contrast": 115,
    "saturation": 124,
    "warmth": 10,
    "sharpness": 30,
    "vignette": 18,
    "cropMode": "blur_fill"
  },
  "hookTop": "Accroche courte choc (5 à 8 mots max) affichée en haut de la vidéo/photo",
  "badgeBottom": "Appel à l'action court en bas (ex: Écris 1 en commentaire 👇 ou Lien en Bio 🌿)",
  "caption": "Légende TikTok complète, engageante, structurée avec sauts de ligne et question finale pour faire commenter",
  "hashtags": ["#bienetre", "#detoxnaturelle", "#santénaturelle", "#astucebienetre", "#ventreplat", "#vitalite", "#edmark", "#pourtoi"],
  "voiceoverScript": "Script complet à lire ou générer en voix-off (15 à 25 secondes) découpé en [0-3s Accroche], [3-15s Explication], [15-25s Appel à l'action]",
  "bestTimeToPost": "Heure idéale recommandée (ex: 19h45 - 15 min avant votre Live)"
}`;

      const parts = [{ text: prompt }];
      if (imageBase64 && imageBase64.includes(",")) {
        const base64Data = imageBase64.split(",")[1];
        parts.push({
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: base64Data
          }
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return { source: "gemini-2.5-flash", ...parsed };
        }
      } else {
        const errText = await response.text();
        console.warn("Avertissement Gemini API, bascule sur moteur autonome local:", errText);
      }
    } catch (err) {
      console.warn("Erreur appel Gemini API, bascule sur moteur autonome local:", err.message);
    }
  }

  // ==========================================================================
  // MOTEUR IA AUTONOME LOCAL (FALLBACK INTELLIGENT SANS CLÉ EXTERNE REQUISE)
  // ==========================================================================
  const avgLum = imageStats?.avgLuminance ?? 128;
  // Calcul intelligent de correction lumineuse selon la clarté réelle de la photo uploadée
  let autoBrightness = 106;
  let autoContrast = 114;
  let autoSaturation = 122;
  let diagnosis = "Analyse visuelle terminée : rehaussement de l'éclat naturel, optimisation du contraste vertical 9:16 et accentuation des tons verts/dorés pour capter l'attention dans les 3 premières secondes.";

  if (avgLum < 95) {
    autoBrightness = 122;
    autoContrast = 118;
    diagnosis = "Photo détectée comme sombre (luminance basse) : éclaircissement automatique (+22%), débouchage des ombres et boost d'éclat studio appliqués.";
  } else if (avgLum > 185) {
    autoBrightness = 96;
    autoContrast = 116;
    diagnosis = "Photo très lumineuse détectée : équilibrage des hautes lumières (-4%), renforcement des contrastes (+16%) et saturation bien-être (+22%).";
  }

  const goalTemplates = {
    annonce_live_15min: {
      hookTop: "🔴 JE SUIS EN LIVE : FAIS TON TEST BIEN-ÊTRE !",
      badgeBottom: "Clique sur ma photo qui clignote 👇",
      caption: `🌿 ${cleanSubject}\n\nVous êtes nombreux à me demander comment retrouver un ventre léger et une vraie énergie dès le matin sans produits chimiques.\n\n🔴 Je viens de lancer mon LIVE à l'instant pour vous montrer la préparation étape par étape et répondre à vos questions en direct !\n\n👉 Cliquez tout de suite sur ma photo de profil ou écrivez "1" en commentaire pour savoir quelle routine vous correspond !`,
      voiceoverScript: `[0-3s ACCROCHE] Arrête de scroller si tu te sens souvent ballonné ou fatigué dès le réveil !\n[3-12s VALEUR] Aujourd'hui on parle de : ${cleanSubject}. Une routine 100% végétale qui agit en douceur sur ton équilibre interne.\n[12-20s ACTION] Je suis en LIVE maintenant pour te faire la démonstration en direct : clique sur ma photo qui clignote ou écris 1 en commentaire !`,
      bestTimeToPost: "15 minutes exactement avant votre Live TikTok (Post Tremplin)"
    },
    vente_directe: {
      hookTop: `✨ L'ASTUCE NATURELLE : ${cleanSubject.slice(0, 32).toUpperCase()}`,
      badgeBottom: "Écris 1 en commentaire ou Lien en Bio 🌿",
      caption: `✨ ${cleanSubject} — La routine naturelle qui change tout !\n\n✅ Action douce et rapide (6 à 8h)\n✅ Extraits végétaux riches en fibres et chlorophylle\n✅ Accompagnement personnalisé inclus\n\n💬 Quel est votre objectif numéro 1 aujourd'hui ?\n1️⃣ Ventre plat & Détox\n2️⃣ Énergie & Vitalité\n3️⃣ Programme complet P4\n\nÉcrivez votre chiffre en commentaire et rendez-vous sur le lien dans ma bio !`,
      voiceoverScript: `[0-3s ACCROCHE] Voici pourquoi ton organisme garde les toxines et comment t'en libérer naturellement.\n[3-15s VALEUR] Avec ${cleanSubject}, tu apportes à ton corps les fibres végétales et l'oxygénation dont il a besoin sans inconfort.\n[15-22s ACTION] Écris le chiffre 1 en commentaire pour faire ton bilan gratuit ou clique directement sur le lien dans ma bio !`,
      bestTimeToPost: "12h30 ou 19h30 (Heures de pointe TikTok)"
    },
    conseil_viral_abonnes: {
      hookTop: "3 SIGNES QUE TON CORPS A BESOIN D'UNE DÉTOX 🌿",
      badgeBottom: "Abonne-toi (+) pour la partie 2 👇",
      caption: `Reconnais-tu l'un de ces 3 signes au quotidien ? 👇\n\n1. Une fatigue dès le réveil même après 8h de sommeil\n2. Le ventre qui gonfle juste après les repas\n3. Un teint terne et un manque de concentration\n\n🌿 Sujet du jour : ${cleanSubject}.\n\nDis-moi en commentaire combien de signes tu as sur 3 (écris 1, 2 ou 3) et abonne-toi pour ne pas rater mes conseils quotidiens !`,
      voiceoverScript: `[0-3s ACCROCHE] Si tu as au moins 2 de ces 3 signes, ton organisme essaie de t'envoyer un message !\n[3-15s VALEUR] Numéro 1 : le ventre gonflé après manger. Numéro 2 : la fatigue constante. C'est souvent lié à un besoin de purification naturelle (${cleanSubject}).\n[15-22s ACTION] Dis-moi ton chiffre en commentaire et clique sur le + pour t'abonner !`,
      bestTimeToPost: "18h30 (Fort taux d'abonnements)"
    }
  };

  const chosen = goalTemplates[postGoal] || goalTemplates.vente_directe;

  return {
    source: "agent-autonome-integre",
    aiDiagnosis: diagnosis,
    retouchSettings: {
      preset: "vitalite_emeraude",
      brightness: autoBrightness,
      contrast: autoContrast,
      saturation: autoSaturation,
      warmth: 12,
      sharpness: 28,
      vignette: 20,
      cropMode: "blur_fill"
    },
    hookTop: chosen.hookTop,
    badgeBottom: chosen.badgeBottom,
    caption: chosen.caption,
    hashtags: [
      "#bienetre",
      "#detoxnaturelle",
      "#edmark",
      "#ventreplat",
      "#santenaturelle",
      "#astucebienetre",
      "#vitalite",
      "#pourtoi"
    ],
    voiceoverScript: chosen.voiceoverScript,
    bestTimeToPost: chosen.bestTimeToPost
  };
}

// ============================================================================
// 2. PUBLICATION OFFICIELLE TIKTOK CONTENT POSTING API V2
// ============================================================================
async function publishToTikTokAPI(post, settings, baseUrl) {
  if (!settings.tiktokAccessToken) {
    return {
      ok: false,
      simulated: true,
      message: "Mode Prêt-à-Publier : Aucun jeton OAuth TikTok actif. Le visuel retouché 9:16 et la légende sont enregistrés et prêts pour publication 1-clic ou dès connexion de vos clés TikTok."
    };
  }

  try {
    // Publication Photo / Carrousel via TikTok Content Posting API v2
    const mediaPublicUrl = `${baseUrl}${post.mediaUrl}`;
    const response = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.tiktokAccessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        post_info: {
          title: (post.hookTop || "Astuce Bien-Être").slice(0, 90),
          description: `${post.caption}\n\n${(post.hashtags || []).join(" ")}`.slice(0, 2200),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_comment: false,
          auto_add_music: true
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: [mediaPublicUrl]
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO"
      })
    });

    const data = await response.json();
    if (response.ok && !data.error?.code) {
      return {
        ok: true,
        publishId: data.data?.publish_id || "tt_pub_" + Date.now(),
        message: "Publié avec succès directement sur votre compte TikTok !"
      };
    } else {
      return {
        ok: false,
        error: data.error?.message || "Erreur API TikTok",
        details: data
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err.message
    };
  }
}

// ============================================================================
// 3. BOUCLE AUTO-PILOT (VÉRIFICATION DES PUBLICATIONS PROGRAMMÉES)
// ============================================================================
setInterval(async () => {
  const store = loadStore();
  if (!store.settings.autoPilotEnabled) return;

  const now = Date.now();
  let changed = false;

  for (const post of store.posts) {
    if (post.status === "scheduled" && post.scheduledAt && new Date(post.scheduledAt).getTime() <= now) {
      const pubRes = await publishToTikTokAPI(post, store.settings, `http://localhost:${PORT}`);
      post.status = pubRes.ok ? "published" : "ready_executed";
      post.publishedAt = new Date().toISOString();
      post.publishNote = pubRes.message || pubRes.error || "Exécuté par l'Auto-Pilot";
      changed = true;
    }
  }

  if (changed) {
    saveStore(store);
  }
}, 15000);

// ============================================================================
// 4. SERVEUR HTTP & ROUTES API
// ============================================================================
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  // --- API : État général (Settings + Posts) ---
  if (pathname === "/api/state" && req.method === "GET") {
    const store = loadStore();
    return sendJson(res, 200, {
      settings: {
        ...store.settings,
        hasGeminiKey: Boolean(store.settings.geminiApiKey && store.settings.geminiApiKey.length > 8),
        hasTikTokConnected: Boolean(store.settings.tiktokAccessToken)
      },
      posts: store.posts
    });
  }

  // --- API : Sauvegarder la configuration ---
  if (pathname === "/api/settings" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const store = loadStore();
      store.settings = {
        ...store.settings,
        ...body
      };
      saveStore(store);
      return sendJson(res, 200, { ok: true, settings: store.settings });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // --- API : Analyse IA Photo/Vidéo + Conception Retouche & Légende ---
  if (pathname === "/api/ai/analyze-and-design" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const store = loadStore();
      const apiKey = body.geminiApiKey || store.settings.geminiApiKey;

      const aiPlan = await analyzeAndDesignWithAI({
        apiKey,
        niche: store.settings.niche,
        topic: body.topic,
        postGoal: body.postGoal || "vente_directe",
        imageBase64: body.imageBase64,
        mimeType: body.mimeType,
        imageStats: body.imageStats
      });

      return sendJson(res, 200, { ok: true, aiPlan });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- API : Sauvegarder, Programmer ou Publier un Post Retouché ---
  if (pathname === "/api/posts/create" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const store = loadStore();

      let mediaUrl = body.mediaUrl || "";
      if (body.processedImageBase64 && body.processedImageBase64.includes(",")) {
        const base64Data = body.processedImageBase64.split(",")[1];
        const fileName = `tiktok_9x16_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.png`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
        mediaUrl = `/uploads/${fileName}`;
      }

      const newPost = {
        id: "post_" + Date.now() + "_" + crypto.randomBytes(2).toString("hex"),
        createdAt: new Date().toISOString(),
        topic: body.topic || "Publication Bien-Être EDMARK",
        postGoal: body.postGoal || "vente_directe",
        hookTop: body.hookTop || "",
        badgeBottom: body.badgeBottom || "",
        caption: body.caption || "",
        hashtags: body.hashtags || [],
        voiceoverScript: body.voiceoverScript || "",
        retouchSettings: body.retouchSettings || {},
        mediaUrl,
        status: body.action === "schedule" ? "scheduled" : "draft",
        scheduledAt: body.scheduledAt || null,
        publishNote: ""
      };

      if (body.action === "publish_now") {
        const pubRes = await publishToTikTokAPI(newPost, store.settings, `http://${req.headers.host}`);
        newPost.status = pubRes.ok ? "published" : "ready_executed";
        newPost.publishedAt = new Date().toISOString();
        newPost.publishNote = pubRes.message || pubRes.error || "";
      }

      store.posts.unshift(newPost);
      saveStore(store);

      return sendJson(res, 200, { ok: true, post: newPost });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- API : Génération Autonome d'un Pack de 3 Publications (Auto-Pilot Batch) ---
  if (pathname === "/api/autopilot/generate-batch" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const store = loadStore();
      const apiKey = store.settings.geminiApiKey;

      const batchSpecs = [
        {
          topic: body.customTopic
            ? `${body.customTopic} — 3 signes qui montrent que votre corps en a besoin`
            : "3 signes que votre côlon a besoin d'une détox naturelle (Shake Off)",
          postGoal: "conseil_viral_abonnes",
          offsetMinutes: 30
        },
        {
          topic: body.customTopic
            ? `${body.customTopic} — Démonstration et bienfaits`
            : "Pourquoi la Chlorophylle Liquide Splina apaise l'acidité et redonne l'énergie",
          postGoal: "vente_directe",
          offsetMinutes: 180
        },
        {
          topic: body.customTopic
            ? `Annonce LIVE : ${body.customTopic} en direct !`
            : "Annonce LIVE Tremplin : Diagnostic Bien-Être & Ventre Plat en direct dans 15 min",
          postGoal: "annonce_live_15min",
          offsetMinutes: 300
        }
      ];

      const created = [];
      for (const spec of batchSpecs) {
        const plan = await analyzeAndDesignWithAI({
          apiKey,
          niche: store.settings.niche,
          topic: spec.topic,
          postGoal: spec.postGoal
        });

        const schedDate = new Date(Date.now() + spec.offsetMinutes * 60 * 1000).toISOString();
        const postItem = {
          id: "auto_" + Date.now() + "_" + crypto.randomBytes(2).toString("hex"),
          createdAt: new Date().toISOString(),
          topic: spec.topic,
          postGoal: spec.postGoal,
          hookTop: plan.hookTop,
          badgeBottom: plan.badgeBottom,
          caption: plan.caption,
          hashtags: plan.hashtags,
          voiceoverScript: plan.voiceoverScript,
          retouchSettings: plan.retouchSettings,
          mediaUrl: "",
          status: "scheduled",
          scheduledAt: schedDate,
          publishNote: `Généré automatiquement par l'Agent (${plan.source})`
        };
        store.posts.unshift(postItem);
        created.push(postItem);
      }

      saveStore(store);
      return sendJson(res, 200, { ok: true, created });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- API : Supprimer un post ---
  if (pathname.startsWith("/api/posts/") && req.method === "DELETE") {
    const postId = pathname.split("/").pop();
    const store = loadStore();
    store.posts = store.posts.filter((p) => p.id !== postId);
    saveStore(store);
    return sendJson(res, 200, { ok: true });
  }

  // --- API : TikTok OAuth 2.0 URL de connexion officielle ---
  if (pathname === "/api/tiktok/auth-url" && req.method === "GET") {
    const store = loadStore();
    const clientKey = store.settings.tiktokClientKey;
    const redirectUri = `http://${req.headers.host}/api/tiktok/callback`;
    const csrfState = crypto.randomBytes(8).toString("hex");

    if (!clientKey) {
      return sendJson(res, 200, {
        ok: false,
        needsKeys: true,
        redirectUri,
        message: "Veuillez renseigner votre Client Key TikTok Developer dans l'onglet Connexion TikTok (ou activez le mode Simulation Prêt-à-l'emploi)."
      });
    }

    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(clientKey)}` +
      `&scope=${encodeURIComponent("user.info.basic,video.publish,video.upload")}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${csrfState}`;

    return sendJson(res, 200, { ok: true, authUrl, redirectUri });
  }

  // --- API : Callback OAuth 2.0 TikTok ---
  if (pathname === "/api/tiktok/callback" && req.method === "GET") {
    const code = parsedUrl.searchParams.get("code");
    const store = loadStore();
    const redirectUri = `http://${req.headers.host}/api/tiktok/callback`;

    if (code && store.settings.tiktokClientKey && store.settings.tiktokClientSecret) {
      try {
        const bodyParams = new URLSearchParams({
          client_key: store.settings.tiktokClientKey,
          client_secret: store.settings.tiktokClientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri
        });

        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: bodyParams.toString()
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          store.settings.tiktokAccessToken = tokenData.access_token;
          store.settings.tiktokOpenId = tokenData.open_id || "";
          store.settings.tiktokConnectedUser = {
            connectedAt: new Date().toISOString(),
            openId: tokenData.open_id
          };
          saveStore(store);
        }
      } catch (err) {
        console.error("Erreur OAuth TikTok:", err.message);
      }
    }

    res.writeHead(302, { Location: "/?tiktok_connected=1" });
    return res.end();
  }

  // --- Servir les fichiers uploadés / retouchés ---
  if (pathname.startsWith("/uploads/")) {
    const safeName = path.basename(pathname);
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      return fs.createReadStream(filePath).pipe(res);
    }
    res.writeHead(404);
    return res.end("Not found");
  }

  // --- Servir les fichiers statiques du Frontend ---
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain; charset=utf-8" });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.writeHead(404);
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  console.log(`✅ Agent Web TikTok IA démarré sur http://localhost:${PORT}`);
});
