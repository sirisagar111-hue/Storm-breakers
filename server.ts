import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";
import CryptoJS from "crypto-js";

dotenv.config();

// Types for our secure record system
interface UserInfo {
  id: string;
  name: string;
  role: "Patient" | "Doctor" | "Auditor" | "Student";
  firstName?: string;
  lastName?: string;
  contactNo?: string;
  email?: string;
  key?: string; // Simulation of the patient or student's private key
  specialty?: string; // Doctor's specialty or role details
  studentId?: string; // Student ID and academic registration
  course?: string; // Target path / department studied
}

interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  type: string; // "Prescription", "X-Ray", "Lab Result", etc.
  encryptedData: string; // AES encrypted blob
  metadata: string; // Patient-provided summary (not encrypted for fast search in this demo)
  createdAt: number;
  fileName?: string; // Name of file if uploaded
  fileType?: string; // MIME type of file if uploaded (e.g., image/jpeg, application/pdf)
}

interface Permission {
  recordId: string;
  patientId: string;
  authorizedDoctorId: string;
  grantedAt: number;
  expiresAt?: number; // Optional timestamp when permission expires
}

interface BreakGlassAccess {
  id: string;
  patientId: string;
  doctorId: string;
  justification: string;
  createdAt: number;
  expiresAt: number;
}

interface AuditLog {
  id: string;
  timestamp: number;
  actorId: string; // User ID
  actorRole: string; // "Patient", "Doctor", "Auditor"
  action: string; // "UPLOAD", "GRANT_ACCESS", "REVOKE_ACCESS", "VIEW_RECORD", "BREAK_GLASS"
  recordId?: string;
  status: "SUCCESS" | "FAILURE";
  details: string;
}

// Simulated Persistence
const state = {
  users: [
    { id: "P_001", name: "Alice Johnson", role: "Patient", firstName: "Alice", lastName: "Johnson", contactNo: "+1 (555) 019-2834", email: "alice.j@medvault.org", key: "alice-secure-vault-key" },
    { id: "P_002", name: "David Miller", role: "Patient", firstName: "David", lastName: "Miller", contactNo: "+1 (555) 014-9988", email: "david.m@medvault.org", key: "david-secure-vault-key" },
    { id: "D_007", name: "Dr. James Smith", role: "Doctor", firstName: "James", lastName: "Smith", contactNo: "+1 (555) 017-7700", email: "james.smith@medvault.org", specialty: "Cardiology" },
    { id: "D_008", name: "Dr. Sarah Chen", role: "Doctor", firstName: "Sarah", lastName: "Chen", contactNo: "+1 (555) 012-3344", email: "sarah.chen@medvault.org", specialty: "Radiology" },
    { id: "D_009", name: "Dr. Gregory House", role: "Doctor", firstName: "Gregory", lastName: "House", contactNo: "+1 (555) 018-0099", email: "diagnostics.house@medvault.org", specialty: "Diagnostics" },
    { id: "S_110", name: "Elena Rostova", role: "Student", firstName: "Elena", lastName: "Rostova", contactNo: "+1 (555) 016-5522", email: "elena.rostova@university.edu", studentId: "STU-8842", course: "Medical Imaging & Diagnostics" },
    { id: "A_999", name: "Global Audit Agency", role: "Auditor", firstName: "Global", lastName: "Audit", contactNo: "+1 (555) 019-9999", email: "oversight@medvault.org" },
  ] as UserInfo[],
  records: [] as MedicalRecord[],
  permissions: [] as Permission[],
  breakGlassAccesses: [] as BreakGlassAccess[],
  auditLogs: [
    {
      id: "log_init_1",
      timestamp: Date.now() - 3600000 * 2,
      actorId: "S_SYS",
      actorRole: "Auditor",
      action: "SYSTEM_BOOT",
      status: "SUCCESS",
      details: "MedVault Decentralized Cryptographic Auditing service initialized."
    }
  ] as AuditLog[],
};

// Seeding standard health history with clinical metrics so that disease charts come alive
function seedDatabase() {
  const alicePlain = [
    {
      type: "Laboratory Report",
      metadata: "Routine metabolic health panel - Fasting Glucose & Hemodynamics",
      fileName: "metabolic_panel_2025.pdf",
      fileType: "application/pdf",
      createdAt: Date.now() - 365 * 24 * 3600 * 1000,
      content: `HEMODYNAMICS & CLINICAL METRICS REPORT

Subject: Alice Johnson
Date: May 15, 2025

Vitals Checked:
- Blood Sugar (Fasting): 135 mg/dL (Elevated)
- Blood Pressure: 128/82 mmHg (Pre-hypertension)
- Heart Rate: 72 bpm
- Weight: 69.2 kg
- HbA1c: 6.2%

Notes:
Subject reports mild fatigue after meals. Cardiovascular examination is unremarkable. Recommended diet modifications and moderate exercise.`
    },
    {
      type: "Laboratory Report",
      metadata: "Follow-up glucose tolerance metabolic panel",
      fileName: "glucose_metabolic_followup.png",
      fileType: "image/png",
      createdAt: Date.now() - 120 * 24 * 3600 * 1000,
      content: `METABOLIC PROFILE & BIOCHEMISTRY

Subject: Alice Johnson
Date: January 10, 2026

Vitals Checked:
- Blood Sugar (Fasting): 146 mg/dL (High)
- Blood Pressure: 134/86 mmHg (Stage 1 Hypertension)
- Heart Rate: 75 bpm
- Weight: 70.5 kg
- HbA1c: 6.5% (Type-2 Diabetes threshold)

Notes:
Fasting glucose has increased slightly. Initiating Metformin 500mg daily. Patient educated on low-carb nutrition and exercise.`
    },
    {
      type: "Prescription",
      metadata: "Metformin dose evaluation and hypertension management",
      fileName: "cardiometabolic_prescription.png",
      fileType: "image/png",
      createdAt: Date.now() - 15 * 24 * 3600 * 1000,
      content: `CLINICAL TREATMENT PLAN & DISPENSARY DICTATION

Subject: Alice Johnson
Date: May 15, 2026

Vitals Checked:
- Blood Sugar (Fasting): 112 mg/dL (Good response)
- Blood Pressure: 120/78 mmHg (Perfect control)
- Heart Rate: 68 bpm
- Weight: 67.8 kg
- HbA1c: 5.9%

Prescribed Medications:
1. Metformin HCl 500mg - 1 tablet twice daily with food
2. Lisinopril 5mg - 1 tablet daily in the morning

Instructions:
Continue daily cardiac exercise and nutrition. Metformin response is highly favorable.`
    }
  ];

  const davidPlain = [
    {
      type: "Laboratory Report",
      metadata: "Cardiorespiratory vital profiling",
      fileName: "cardio_vital_report.pdf",
      fileType: "application/pdf",
      createdAt: Date.now() - 200 * 24 * 3600 * 1000,
      content: `CARDIO REPORT - ELECTRO CARDIOGRAM & CLINICAL INDICATORS

Subject: David Miller
Date: November 12, 2025

Vitals Checked:
- Blood Sugar (Fasting): 98 mg/dL (Normal)
- Blood Pressure: 142/91 mmHg (Stage 2 Hypertension)
- Heart Rate: 84 bpm
- Weight: 91.5 kg

Notes:
Systolic and diastolic BP are chronically high. Recommend telemetry and ECG monitoring. Advised low sodium nutrition.`
    },
    {
      type: "Prescription",
      metadata: "Cardiovascular hypertension titration follow-up",
      fileName: "cardio_metoprolol_rx.png",
      fileType: "image/png",
      createdAt: Date.now() - 10 * 24 * 3600 * 1000,
      content: `CLINICAL PHARMACOLOGY WORKSHEET

Subject: David Miller
Date: May 20, 2026

Vitals Checked:
- Blood Sugar (Fasting): 95 mg/dL
- Blood Pressure: 128/82 mmHg (Well controlled)
- Heart Rate: 72 bpm
- Weight: 88.2 kg

Prescribed Medications:
1. Metoprolol Succinate 25mg ER - 1 tablet daily
2. Atorvastatin 20mg - 1 tablet daily at bedtime

Notes:
Excellent response to metoprolol. Blood pressure stable.`
    }
  ];

  alicePlain.forEach((r, idx) => {
    const encrypted = CryptoJS.AES.encrypt(r.content, "alice-secure-vault-key").toString();
    state.records.push({
      id: `REC_ALICE_00${idx + 1}`,
      patientId: "P_001",
      patientName: "Alice Johnson",
      type: r.type,
      encryptedData: encrypted,
      metadata: r.metadata,
      createdAt: r.createdAt,
      fileName: r.fileName,
      fileType: r.fileType
    });
  });

  davidPlain.forEach((r, idx) => {
    const encrypted = CryptoJS.AES.encrypt(r.content, "david-secure-vault-key").toString();
    state.records.push({
      id: `REC_DAVID_00${idx + 1}`,
      patientId: "P_002",
      patientName: "David Miller",
      type: r.type,
      encryptedData: encrypted,
      metadata: r.metadata,
      createdAt: r.createdAt,
      fileName: r.fileName,
      fileType: r.fileType
    });
  });
}

// Call configuration
seedDatabase();

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get Users List
  app.get("/api/users", (req, res) => {
    res.json(state.users);
  });

  // Create User List Profile
  app.post("/api/users", (req, res) => {
    const { firstName, lastName, role, contactNo, email, key, specialty, studentId, course } = req.body;
    if (!firstName || !lastName || !role) {
      return res.status(400).json({ error: "First name, last name, and role are required." });
    }
    const name = `${firstName} ${lastName}`;
    let prefix = "P_";
    if (role === "Doctor") prefix = "D_";
    else if (role === "Student") prefix = "S_";
    else if (role === "Auditor") prefix = "A_";

    const id = prefix + Math.floor(Math.random() * 900 + 100);
    
    const newUser: UserInfo = {
      id,
      name,
      role,
      firstName,
      lastName,
      contactNo: contactNo || "",
      email: email || "",
      key: (role === "Patient" || role === "Student") ? (key || `${name.toLowerCase().replace(/\s+/g, "-")}-secure-vault-key`) : undefined,
      specialty: role === "Doctor" ? (specialty || "General Medicine") : undefined,
      studentId: role === "Student" ? (studentId || `STU-${Math.floor(Math.random() * 9000 + 1000)}`) : undefined,
      course: role === "Student" ? (course || "General Medicine Course") : undefined
    };
    state.users.push(newUser);

    state.auditLogs.push({
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp: Date.now(),
      actorId: id,
      actorRole: role,
      action: "REGISTER",
      status: "SUCCESS",
      details: `Profile registration for ${name} as ${role} (Email: ${email || 'None'}).`
    });

    res.status(201).json(newUser);
  });

  // Audit Logs
  app.get("/api/audit", (req, res) => {
    // For demo: Auditors see everything. Patients see their own logs. Doctors see logs related to records they accessed.
    const { userId, role } = req.query;
    let logs = state.auditLogs;

    if (role === "Patient") {
      logs = state.auditLogs.filter(l => l.actorId === userId || state.records.find(r => r.id === l.recordId && r.patientId === userId));
    } else if (role === "Doctor") {
      logs = state.auditLogs.filter(l => l.actorId === userId);
    }

    res.json(logs);
  });

  // Records List
  app.get("/api/records", (req, res) => {
    const { userId, role } = req.query;
    
    if (role === "Patient") {
      return res.json(state.records.filter(r => r.patientId === userId));
    }
    
    if (role === "Doctor") {
      // Find records where this doctor has active permission
      const permittedIds = state.permissions
        .filter(p => {
          if (p.expiresAt && Date.now() > p.expiresAt) return false;
          return p.authorizedDoctorId === userId;
        })
        .map(p => p.recordId);
      
      // Also add records of patients where there is an active Break Glass session for this doctor
      const activeBgs = state.breakGlassAccesses.filter(
        bg => bg.doctorId === userId && Date.now() < bg.expiresAt
      );
      const bgPatientIds = activeBgs.map(bg => bg.patientId);
      
      // Find all records that are either explicitly permitted OR part of break glass patient authority
      const allowedRecords = state.records.filter(
        r => permittedIds.includes(r.id) || bgPatientIds.includes(r.patientId)
      );
      return res.json(allowedRecords);
    }

    if (role === "Auditor") {
      // Auditors see metadata but NOT encryptedData for privacy
      return res.json(state.records.map(r => ({ ...r, encryptedData: "[ENCRYPTED]" })));
    }

    if (role === "Student") {
      // Students can view academic locked lists or de-identified cases.
      // But we will handle direct academic lists in frontend.
      return res.json([]);
    }

    res.status(403).json({ error: "Unauthorized" });
  });

  // Add Record
  app.post("/api/records", (req, res) => {
    const record: MedicalRecord = {
      id: "REC_" + Math.random().toString(36).substr(2, 6).toUpperCase(),
      patientId: req.body.patientId,
      patientName: req.body.patientName,
      type: req.body.type,
      encryptedData: req.body.encryptedData,
      metadata: req.body.metadata,
      createdAt: Date.now(),
      fileName: req.body.fileName,
      fileType: req.body.fileType,
    };

    state.records.push(record);
    
    state.auditLogs.push({
      id: "BLK_" + Math.random().toString(36).substr(2, 8).toUpperCase(),
      timestamp: Date.now(),
      actorId: record.patientId,
      actorRole: "Patient",
      action: "UPLOAD",
      recordId: record.id,
      status: "SUCCESS",
      details: `Signed clinical upload: ${record.type} record crypt-sealed.`,
    });

    res.status(201).json(record);
  });

  // Emergency Access ("Break Glass") Initiation
  app.post("/api/break-glass", (req, res) => {
    const { patientId, doctorId, justification } = req.body;
    if (!patientId || !doctorId || !justification) {
      return res.status(400).json({ error: "Missing required emergency fields." });
    }

    const patient = state.users.find(u => u.id === patientId && u.role === "Patient");
    if (!patient) {
      return res.status(404).json({ error: "Subject patient not found in sovereign registry." });
    }

    // Create 30-minute emergency lease
    const durationMs = 30 * 60 * 1000;
    const bgAccess: BreakGlassAccess = {
      id: "BG_" + Math.random().toString(36).substr(2, 6).toUpperCase(),
      patientId,
      doctorId,
      justification,
      createdAt: Date.now(),
      expiresAt: Date.now() + durationMs
    };

    state.breakGlassAccesses.push(bgAccess);

    // Dynamic Audit Block
    state.auditLogs.push({
      id: "BG_BLOCK_" + Math.random().toString(36).substr(2, 8).toUpperCase(),
      timestamp: Date.now(),
      actorId: doctorId,
      actorRole: "Doctor",
      action: "BREAK_GLASS",
      recordId: patientId,
      status: "SUCCESS",
      details: `EMERGENCY GLASS BROKEN: Doctor ${doctorId} triggered emergency access for patient ${patientId}. Reason: ${justification}`
    });

    res.status(201).json(bgAccess);
  });

  // Fetch Patient Key via Break Glass Permission
  app.get("/api/break-glass/key", (req, res) => {
    const { doctorId, patientId } = req.query;
    if (!doctorId || !patientId) {
      return res.status(400).json({ error: "Missing parameters." });
    }

    const hasActiveBg = state.breakGlassAccesses.some(
      bg => bg.doctorId === doctorId && bg.patientId === patientId && Date.now() < bg.expiresAt
    );

    if (!hasActiveBg) {
      return res.status(403).json({ error: "No active unexpired break glass permission found." });
    }

    const patient = state.users.find(u => u.id === patientId && u.role === "Patient");
    if (!patient || !patient.key) {
      return res.status(404).json({ error: "Patient vault key unavailable." });
    }

    res.json({ patientKey: patient.key });
  });

  // Get active break glass status
  app.get("/api/break-glass/status", (req, res) => {
    const { doctorId, patientId } = req.query;
    const activeBg = state.breakGlassAccesses.find(
      bg => bg.doctorId === doctorId && bg.patientId === patientId && Date.now() < bg.expiresAt
    );
    res.json({ activeBg: activeBg || null });
  });

  // Grant Permission (with optional duration)
  app.post("/api/permissions", (req, res) => {
    const { recordId, patientId, doctorId, durationMinutes } = req.body;
    
    let expiresAt: number | undefined = undefined;
    if (durationMinutes && durationMinutes > 0) {
      expiresAt = Date.now() + durationMinutes * 60 * 1000;
    }

    const permission: Permission = {
      recordId,
      patientId,
      authorizedDoctorId: doctorId,
      grantedAt: Date.now(),
      expiresAt,
    };

    state.permissions.push(permission);
    
    state.auditLogs.push({
      id: "LNK_" + Math.random().toString(36).substr(2, 8).toUpperCase(),
      timestamp: Date.now(),
      actorId: patientId,
      actorRole: "Patient",
      action: "GRANT_ACCESS",
      recordId,
      status: "SUCCESS",
      details: `Signed delegation to doctor ${doctorId}${expiresAt ? ` (Lease expires in ${durationMinutes} mins)` : " (Permanent)"}.`,
    });

    res.status(201).json(permission);
  });

  // Revoke Permission
  app.delete("/api/permissions", (req, res) => {
    const { recordId, patientId, doctorId } = req.body;
    
    state.permissions = state.permissions.filter(
      p => !(p.recordId === recordId && p.authorizedDoctorId === doctorId)
    );
    
    state.auditLogs.push({
      id: "RV_BLOCK_" + Math.random().toString(36).substr(2, 8).toUpperCase(),
      timestamp: Date.now(),
      actorId: patientId,
      actorRole: "Patient",
      action: "REVOKE_ACCESS",
      recordId,
      status: "SUCCESS",
      details: `Signed access revocation for doctor ${doctorId}. Verification sealed.`,
    });

    res.status(200).json({ success: true });
  });

  // Gemini endpoint 1: Summarize Record
  app.post("/api/gemini/summarize", async (req, res) => {
    const { decryptedContent, recordType } = req.body;
    
    if (!decryptedContent) {
      return res.status(400).json({ error: "Missing content" });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Status: Medical Record Analysis. 
        Record Type: ${recordType}
        Content: ${decryptedContent}
        
        Please provide a professional, concise, and easy-to-understand summary of this medical record for a patient. 
        Highlight any key metrics (like lab values) or critical instructions.
        Format the output in clear Markdown.`,
        config: {
          systemInstruction: "You are a professional medical assistant ensuring patients understand their records while maintaining accuracy.",
        }
      });

      res.json({ summary: response.text });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: "AI processing failed." });
    }
  });

  // Gemini endpoint 2: AI Medical Risk Detection & Vitals Extractor
  app.post("/api/gemini/risk-detect", async (req, res) => {
    const { decryptedContent, recordType } = req.body;
    if (!decryptedContent) {
      return res.status(400).json({ error: "Missing content" });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Identify clinical health indicators, alerts, severity levels, and extract numbers.
        Record Category: ${recordType}
        Content Text: ${decryptedContent}`,
        config: {
          systemInstruction: "You are an advanced medical analyzer. Extract quantitative metabolic metrics (sugar, BP readings, weight, pulse) and diagnose severe warning flags.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              severity: { type: Type.STRING, description: "CRITICAL, MODERATE, or NORMAL depending on metrics values" },
              extractedVitals: {
                type: Type.OBJECT,
                properties: {
                  bloodSugar: { type: Type.NUMBER, description: "Fasting glucose value in mg/dL, if found" },
                  systolicBP: { type: Type.NUMBER, description: "Systolic Blood Pressure reading in mmHg, if found" },
                  diastolicBP: { type: Type.NUMBER, description: "Diastolic Blood Pressure reading in mmHg, if found" },
                  heartRate: { type: Type.NUMBER, description: "Heart rate pulses/bpm, if found" },
                  weight: { type: Type.NUMBER, description: "Subject weight in kg, if found" }
                }
              },
              detectedRisks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Brief tags summarizing active warning flags (e.g. ['Hyperglycemia', 'Stage I Hypertension'])"
              },
              analysis: { type: Type.STRING, description: "Professional medical analysis outlining warning factors, safe parameters comparison, and preventive suggestions in custom markdown paragraphs" }
            },
            required: ["severity", "analysis"]
          }
        }
      });

      res.json(JSON.parse(response.text.trim()));
    } catch (error: any) {
      console.error("Gemini Risk Engine Error:", error);
      res.status(500).json({ error: "AI Risk processing failed." });
    }
  });

  // Gemini endpoint 3: Explain Prescription in lay terms
  app.post("/api/gemini/explain-prescription", async (req, res) => {
    const { decryptedContent } = req.body;
    if (!decryptedContent) {
      return res.status(400).json({ error: "Missing prescription payload." });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Prescription text: ${decryptedContent}
        
        Extract all drugs or active ingredients. For each agent, explain clearly:
        1. Normal therapeutic uses (what it is for).
        2. Dosing schedule and best administration instructions (e.g. food intake).
        3. Simple side effects and key physiological warning signs.
        4. Crucial warnings or specific items to avoid (e.g. alcohol, NSAIDs).
        
        Write in exceptionally friendly, clear language. Use bold styling, clear tables or section bullets.`,
        config: {
          systemInstruction: "You are a professional clinical pharmacist explaining pharmacological regimes to patients safely."
        }
      });

      res.json({ explanation: response.text });
    } catch (error) {
      console.error("Gemini Pharmacologist Error:", error);
      res.status(500).json({ error: "AI Prescriptions parsing failed." });
    }
  });

  // Gemini endpoint 4: Secure Medical Chat Assistant
  app.post("/api/gemini/chat", async (req, res) => {
    const { recordContext, message, conversationHistory } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Missing message query." });
    }

    try {
      // Reconstruct conversation history parts for gemini chat
      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: `You are MedVault's interactive Clinical AI Assistant. You are chatting about a cryptographically decrypted medical record.
          
          Here is the decrypted record context which is SECURE and invisible to external servers:
          ---
          ${recordContext || "No active record selected. Give default clinical preventive Q&A."}
          ---
          
          IMPORTANT:
          - Base your medical answers primarily on the specific patient record context above.
          - State any specific numbers (like glucose, BP, medications) clearly.
          - Translate complicated doctor phrases into clear, friendly metaphors.
          - If the user asks general questions or unrelated queries, help them gently return to understanding this specific record.
          - Never diagnose or change prescriptions yourself. Suggest consulting their specialist.`
        }
      });

      // Maintain simple history by playing other messages first or sending single prompt that summarizes history
      let prompt = message;
      if (conversationHistory && conversationHistory.length > 0) {
        const historyText = conversationHistory.map((h: any) => `${h.role === "user" ? "Patient" : "AI Provider"}: ${h.text}`).join("\n");
        prompt = `Conversation History:\n${historyText}\n\nPatient Query: ${message}`;
      }

      const response = await chat.sendMessage({ message: prompt });
      res.json({ reply: response.text });
    } catch (error) {
      console.error("Gemini Chat Error:", error);
      res.status(500).json({ error: "AI communication failed." });
    }
  });

  // Gemini endpoint 5: Student Learn Mode Mini Diagnostic Quiz
  app.post("/api/gemini/student-quiz", async (req, res) => {
    const { caseContent } = req.body;
    if (!caseContent) {
      return res.status(400).json({ error: "Missing academic case content." });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Formulate a clinical quiz with 3 interactive diagnostics multiple-choice questions for medical students.
        Anonymized Case File:
        ${caseContent}`,
        config: {
          systemInstruction: "You are a senior clinical professor. Formulate rigorous case questions testing diagnostic acumen, pathophysiology, and lab value analysis.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING, description: "Question testing medical knowledge about this case" },
                options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exactly 4 options" },
                answerIndex: { type: Type.INTEGER, description: "0-based index of correct option" },
                explanation: { type: Type.STRING, description: "Clinical reasoning and diagnostic indicators explaining correctness" }
              },
              required: ["question", "options", "answerIndex", "explanation"]
            }
          }
        }
      });

      res.json({ quiz: JSON.parse(response.text.trim()) });
    } catch (error) {
      console.error("Gemini Quiz Error:", error);
      res.status(500).json({ error: "Educational compilation failed." });
    }
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MedVault Server running on http://localhost:${PORT}`);
  });
}

startServer();
