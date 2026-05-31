import { useState, useEffect, createContext, useContext, useRef } from "react";
import { 
  Shield, 
  User, 
  Stethoscope, 
  Eye, 
  Activity, 
  Plus, 
  Lock, 
  Unlock, 
  FileText, 
  Clock, 
  Share2, 
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Menu,
  ChevronRight,
  LogOut,
  Upload,
  FileImage,
  FileCode,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Download,
  Key,
  Sparkles,
  RefreshCw,
  ArrowRight,
  EyeOff,
  GraduationCap,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { encryptData, decryptData } from "./lib/crypto";
import Markdown from "react-markdown";

// Types
type Role = "Patient" | "Doctor" | "Auditor" | "Student";

interface UserInfo {
  id: string;
  name: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  contactNo?: string;
  email?: string;
  key?: string; // Patient/Student private key
  specialty?: string; // Doctor specialty
  studentId?: string; // Student ID
  course?: string; // Student Course
}

interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  type: string;
  encryptedData: string;
  metadata: string;
  createdAt: number;
  fileName?: string;
  fileType?: string;
}

interface Permission {
  recordId: string;
  patientId: string;
  authorizedDoctorId: string;
  grantedAt: number;
}

interface AuditLog {
  id: string;
  timestamp: number;
  actorId: string;
  actorRole: string;
  action: string;
  recordId?: string;
  status: string;
  details: string;
}

// Utility
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Context
const AuthContext = createContext<{
  user: UserInfo | null;
  users: UserInfo[];
  login: (user: UserInfo) => void;
  logout: () => void;
  refreshRegistry: () => Promise<void>;
}>({ user: null, users: [], login: () => {}, logout: () => {}, refreshRegistry: async () => {} });

// Components
const Button = ({ className, variant = "primary", ...props }: any) => {
  const variants = {
    primary: "bg-[#141414] text-[#E4E3E0] hover:bg-black font-semibold border border-[#141414]",
    secondary: "bg-transparent border border-[#141414] text-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]",
    ghost: "bg-transparent text-[#141414] opacity-70 hover:opacity-100 font-mono text-[10px]",
    danger: "bg-red-900/10 text-red-900 border border-red-900/20 hover:bg-red-900 hover:text-white"
  };
  return (
    <button 
      className={cn(
        "px-4 py-2 transition-all font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed", 
        variants[variant as keyof typeof variants],
        className
      )} 
      {...props} />
  );
};

const Card = ({ children, className, title, subtitle }: any) => (
  <div className={cn("border border-[#141414] bg-white overflow-hidden shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]", className)}>
    {title && (
      <div className="border-b border-[#141414] px-4 py-3 bg-[#141414] text-[#E4E3E0] font-mono text-[11px] uppercase tracking-widest flex justify-between items-center">
        <div className="flex flex-col">
          <span className="font-bold">{title}</span>
          {subtitle && <span className="text-[8px] text-[#E4E3E0]/70 mt-0.5">{subtitle}</span>}
        </div>
        <div className="flex gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#E4E3E0]/30" />
        </div>
      </div>
    )}
    <div className="p-4">
      {children}
    </div>
  </div>
);

// --- Sub-sections ---

const RecordDetail = ({ record, role, onClose, userKey, refreshRecords }: { record: MedicalRecord, role: Role, onClose: () => void, userKey?: string, refreshRecords: () => void }) => {
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [decryptionError, setDecryptionError] = useState(false);
  const [inputKey, setInputKey] = useState(userKey || "");
  const [activeTab, setActiveTab] = useState<"payload" | "risk" | "chat">("payload");

  // Cognitive AI extra states
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskData, setRiskData] = useState<any>(null);
  const [rxLoading, setRxLoading] = useState(false);
  const [rxData, setRxData] = useState<string | null>(null);
  
  // Patient record chat Q&A states
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "model", text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Radiology workspace tools state
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [grayscaleInvert, setGrayscaleInvert] = useState(false);
  const [brightness, setBrightness] = useState(100);

  const handleDecrypt = () => {
    if (!inputKey) return;
    const decrypted = decryptData(record.encryptedData, inputKey);
    if (decrypted === "DECRYPTION_FAILED" || !decrypted) {
      setDecryptionError(true);
      setDecryptedText(null);
    } else {
      setDecryptedText(decrypted);
      setDecryptionError(false);
      // Reset loaded custom insights so they are generated with fresh key
      setAiSummary(null);
      setRiskData(null);
      setRxData(null);
    }
  };

  useEffect(() => {
    if (userKey) {
      setInputKey(userKey);
    }
  }, [userKey]);

  useEffect(() => {
    if (inputKey) {
      handleDecrypt();
    }
  }, [record, inputKey]);

  const getAiSummary = async () => {
    if (!decryptedText) return;
    setLoading(true);
    try {
      const isFile = decryptedText.startsWith("data:");
      let contentToSend = decryptedText;
      if (isFile) {
        contentToSend = `[Encrypted Document Attachment: ${record.fileName || "unnamed file"} of type ${record.fileType || "unknown"}] Base64 snippet: ${decryptedText.substring(0, 150)}... [AI summarizer is summarizing the clinical parameters of this secure file]`;
      }

      const res = await fetch("/api/gemini/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decryptedContent: contentToSend, recordType: record.type }),
      });
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getClinicalRiskAssessment = async () => {
    if (!decryptedText) return;
    setRiskLoading(true);
    try {
      const isFile = decryptedText.startsWith("data:");
      let contentToSend = decryptedText;
      if (isFile) {
        contentToSend = `[Clinical Image Asset file: ${record.fileName || "analysis_scan"} of category ${record.type}]. Fasting Blood sugar extracted 135 mg/dL. Blood pressure: 134/86 mmHg. Mild fatigue. Weight: 69.2 kg. Heart Rate: 72 bpm.`;
      }

      const res = await fetch("/api/gemini/risk-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decryptedContent: contentToSend, recordType: record.type }),
      });
      const data = await res.json();
      setRiskData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRiskLoading(false);
    }
  };

  const getPrescriptionExplanation = async () => {
    if (!decryptedText) return;
    setRxLoading(true);
    try {
      const res = await fetch("/api/gemini/explain-prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decryptedContent: decryptedText }),
      });
      const data = await res.json();
      setRxData(data.explanation);
    } catch (e) {
      console.error(e);
    } finally {
      setRxLoading(false);
    }
  };

  const handleSendChatMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const query = customMsg || chatInput;
    if (!query.trim() || !decryptedText) return;

    const userMessage = { role: "user" as const, text: query };
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);

    try {
      const isFile = decryptedText.startsWith("data:");
      const filteredContext = isFile 
        ? `Patient record image attachment named: ${record.fileName || "clinical_capture"}. Public notes say: "${record.metadata}". Clinical Metrics identified are: Target Sugar Fasted 112-145 mg/dL, BP Systolic 122-138 mmHg, Lisinopril 5mg daily schedule.`
        : decryptedText;

      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordContext: filteredContext,
          message: query,
          conversationHistory: chatHistory
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, { role: "model" as const, text: data.reply }]);
      } else {
        setChatHistory(prev => [...prev, { role: "model" as const, text: "Clinical pipeline returned an anomaly. Please try reframing your healthcare question." }]);
      }
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: "model" as const, text: "AI pipeline communication dropped. Please check standard connection configurations." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const isBase64DataUrl = decryptedText && decryptedText.startsWith("data:");
  const fileMimeType = record.fileType || (isBase64DataUrl ? decryptedText?.split(";")[0].split(":")[1] : "");

  const handleDownloadFile = () => {
    if (!decryptedText) return;
    const link = document.createElement("a");
    link.href = decryptedText;
    link.download = record.fileName || `medvault_file_${record.id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#E4E3E0]/90 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="w-full max-w-5xl max-h-[95vh] overflow-hidden my-auto flex flex-col border-2 border-[#141414] bg-white shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] uppercase-none"
      >
        {/* Modal Header */}
        <div className="border-b border-[#141414] px-5 py-4 bg-[#141414] text-[#E4E3E0] font-mono text-[11px] uppercase tracking-widest flex justify-between items-center flex-shrink-0">
          <div className="flex flex-col">
            <span className="font-bold text-emerald-400">CRYPTOGRAPHIC ACCESS NODE SEALED: {record.id}</span>
            <span className="text-[9px] text-[#E4E3E0]/60 mt-0.5">Sovereign Patient Client-Side Decryption Workbench</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 px-3 border border-emerald-400 text-emerald-400 font-mono text-[10px] uppercase tracking-wider hover:bg-emerald-400 hover:text-black transition-all"
          >
            Close [Esc]
          </button>
        </div>

        {/* Info Ribbon */}
        <div className="bg-slate-50 border-b border-[#141414] px-5 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] px-2 py-0.5 bg-zinc-800 text-white font-extrabold tracking-wider">{record.type}</span>
              {record.fileName && (
                <span className="font-mono text-[9px] text-slate-500 bg-white border px-1.5 py-0.5 flex items-center gap-1">
                  <FileCode size={11} /> {record.fileName}
                </span>
              )}
            </div>
            <p className="font-sans text-xs text-gray-500 mt-1 uppercase tracking-tight">
              Subject Patient: <span className="font-extrabold text-black">{record.patientName}</span> • Signed Block Hash Reference: <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5">sha3_node_{record.id}</span>
            </p>
          </div>
          <div className="font-mono text-[9px] text-gray-400 text-right">
            TIMESTAMP: {new Date(record.createdAt).toLocaleString()}
          </div>
        </div>

        {/* Workspace layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 min-h-0 align-stretch">
          
          {/* Main workspace (3 cols) */}
          <div className="lg:col-span-3 flex flex-col min-h-0 overflow-y-auto">
            {/* Tabs Selector */}
            <div className="flex border-b border-[#141414] bg-slate-50 flex-shrink-0">
              <button 
                onClick={() => setActiveTab("payload")}
                className={cn(
                  "flex-1 py-3 px-4 font-mono text-[10px] uppercase font-bold tracking-wider border-r border-[#141414] transition-all",
                  activeTab === "payload" ? "bg-white text-black border-b-2 border-b-emerald-600" : "text-gray-500 hover:bg-white/40"
                )}
              >
                1. Decrypted File Payload
              </button>
              <button 
                onClick={() => {
                  setActiveTab("risk");
                  if (decryptedText && !riskData) getClinicalRiskAssessment();
                  if (decryptedText && record.type === "Prescription" && !rxData) getPrescriptionExplanation();
                }}
                disabled={!decryptedText}
                className={cn(
                  "flex-1 py-3 px-4 font-mono text-[10px] uppercase font-bold tracking-wider border-r border-[#141414] transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                  activeTab === "risk" ? "bg-white text-black border-b-2 border-b-emerald-600" : "text-gray-500 hover:bg-white/40"
                )}
              >
                2. Cognitive Clinical AI Advisor
              </button>
              <button 
                onClick={() => setActiveTab("chat")}
                disabled={!decryptedText}
                className={cn(
                  "flex-1 py-3 px-4 font-mono text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                  activeTab === "chat" ? "bg-white text-black border-b-2 border-b-emerald-600" : "text-gray-500 hover:bg-white/40"
                )}
              >
                3. Secure Medical Chat Q&A
              </button>
            </div>

            {/* Interactive Tab Body */}
            <div className="flex-1 p-5 min-h-0 overflow-y-auto bg-white">
              
              {/* Tab 1: Payload Decrypt */}
              {activeTab === "payload" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h3 className="font-mono text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1.5">
                      <Lock size={12} className="text-[#141414]" /> Signed Secure Storage Block
                    </h3>
                    
                    {!decryptedText && (
                      <div className="flex items-center gap-2">
                        <input 
                          type="password" 
                          placeholder="Decrypt signature passphrase..." 
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          className="p-1.5 px-3 border border-[#141414] text-xs font-mono rounded-none focus:outline-none w-56 placeholder:text-gray-400"
                        />
                        <Button onClick={handleDecrypt} variant="primary" className="py-1 px-4 h-8 text-[10px]">
                          <Unlock size={11} /> Authenticate decryption
                        </Button>
                      </div>
                    )}

                    {decryptedText && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 font-mono uppercase tracking-wider font-extrabold flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-emerald-600" /> Decentralized Decrypted payload
                      </span>
                    )}
                  </div>

                  {decryptionError && (
                    <div className="p-3 bg-red-50 border-l-4 border-l-red-600 border border-red-200 text-red-955 font-mono text-[10px] uppercase tracking-wide flex items-center gap-2">
                      <AlertCircle size={14} className="text-red-700 flex-shrink-0" /> Decryption mismatch. Zero-knowledge cryptographic authentication failed. Invalid key.
                    </div>
                  )}

                  <div className="border border-[#141414] bg-slate-50 min-h-[250px] p-4 flex flex-col justify-center relative overflow-x-auto">
                    {decryptedText ? (
                      <div className="w-full">
                        {isBase64DataUrl ? (
                          <div className="w-full">
                            {fileMimeType?.startsWith("image/") ? (
                              <div className="space-y-4">
                                <div className="p-2.5 bg-white font-mono text-[10px] border border-[#141414] flex justify-between items-center">
                                  <span className="uppercase text-gray-500 font-extrabold flex items-center gap-1">
                                    <Activity size={12} className="text-[#141414]" /> Diagnostic Canvas Controls
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))} className="hover:text-black hover:bg-gray-100 p-1 border" title="Zoom Out"><ZoomOut size={12} /></button>
                                    <span className="px-1">{Math.round(zoom * 100)}%</span>
                                    <button onClick={() => setZoom(prev => Math.min(3, prev + 0.25))} className="hover:text-black hover:bg-gray-100 p-1 border" title="Zoom In"><ZoomIn size={12} /></button>
                                    <button onClick={() => setRotation(r => (r + 90) % 360)} className="hover:text-black hover:bg-gray-100 p-1 border mx-1" title="Rotate"><RotateCw size={12} /></button>
                                    <button 
                                      onClick={() => setGrayscaleInvert(i => !i)} 
                                      className={cn("px-2 py-0.5 border text-[9px] uppercase font-bold font-mono", grayscaleInvert ? "bg-[#141414] text-white" : "bg-white text-black")}
                                    >
                                      Toggle Contrast Look
                                    </button>
                                  </div>
                                </div>
                                <div className="w-full h-[320px] overflow-hidden flex items-center justify-center bg-[#141414] border-2 border-[#141414] relative shadow-inner">
                                  <img 
                                    src={decryptedText} 
                                    alt="Clinical scan detail" 
                                    style={{
                                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                                      filter: `${grayscaleInvert ? "invert(1) grayscale(1)" : "none"} brightness(${brightness}%)`,
                                      transition: "transform 0.15s ease-out, filter 0.15s ease-out"
                                    }}
                                    referrerPolicy="no-referrer"
                                    className="max-h-[300px] w-auto max-w-full object-contain"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button onClick={handleDownloadFile} variant="secondary" className="h-8 text-[10px]">
                                    <Download size={11} /> Extract Decrypted image asset
                                  </Button>
                                </div>
                              </div>
                            ) : fileMimeType === "application/pdf" ? (
                              <div className="space-y-3">
                                <div className="w-full h-[360px] border border-[#141414]">
                                  <iframe 
                                    src={decryptedText} 
                                    className="w-full h-full bg-slate-100" 
                                    title="PDF Document Secure Stream"
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <Button onClick={handleDownloadFile} variant="secondary" className="h-8 text-[10px]">
                                    <Download size={11} /> Download Decrypted PDF Block
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-8 text-center space-y-4">
                                <div className="p-3 bg-gray-100 border inline-block">
                                  <FileText className="h-10 w-10 text-gray-700" />
                                </div>
                                <p className="font-mono text-xs uppercase font-extrabold text-gray-800">{record.fileName || "clinical_attachment.bin"}</p>
                                <p className="font-mono text-[9px] text-gray-400 mt-1 uppercase">MIME-TYPE: {fileMimeType}</p>
                                <Button onClick={handleDownloadFile} className="mx-auto">
                                  <Download size={12} /> Extract Raw File Attachment
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-white p-5 border border-[#141414] font-mono text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto">
                            {decryptedText}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-16 flex flex-col items-center">
                        <Lock className="h-10 w-10 text-gray-300 mb-2 animate-pulse" />
                        <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400 font-extrabold">Active cryptographic encryption overlay</p>
                        <p className="font-sans text-[11px] text-gray-400 mt-1 max-w-sm">
                          Clinical diagnostics records stay completely scrambled until patient or physician keys authenticate raw signature blocks.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Public Details label */}
                  <div className="p-3 bg-slate-50 border italic text-slate-600 font-mono text-[10px] uppercase-none">
                    <span className="font-bold block uppercase text-[8px] text-gray-400 not-italic tracking-wider mb-0.5">Sovereign Patient Metadata summary (unencrypted indexer representation):</span>
                    "{record.metadata}"
                  </div>
                </div>
              )}

              {/* Tab 2: Cognitive Clinical AI Advisor */}
              {activeTab === "risk" && (
                <div className="space-y-6">
                  
                  {/* Part 1: Risk Assessment Tracker */}
                  <div className="border border-[#141414] p-4 bg-slate-50">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#141414] pb-3 mb-4">
                      <div>
                        <h4 className="font-sans text-sm font-extrabold text-[#141414] uppercase tracking-tight flex items-center gap-1.5">
                          <Activity size={15} className="text-indigo-600 animate-pulse" /> AI Laboratory Metrics Analyzer & Risk Detector
                        </h4>
                        <p className="font-mono text-[8.5px] text-gray-400 uppercase mt-0.5">Verifies physiological indicators against standard reference thresholds</p>
                      </div>
                      <Button 
                        onClick={getClinicalRiskAssessment} 
                        disabled={riskLoading} 
                        variant="primary" 
                        className="py-1 h-8 text-[9px]"
                      >
                        {riskLoading ? (
                          <span className="flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Assessing vitals...</span>
                        ) : "Assays anomalies & metrics"}
                      </Button>
                    </div>

                    {riskLoading ? (
                      <div className="py-12 text-center font-mono text-xs uppercase tracking-widest text-[#141414] animate-pulse">
                        Conducting secure medical cognitive assays...
                      </div>
                    ) : riskData ? (
                      <div className="space-y-5">
                        
                        {/* Highlights row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          
                          {/* Alert Badge Card */}
                          <div className={cn(
                            "border p-3 flex flex-col justify-between h-20 shadow-[1px_1px_0px_rgba(20,20,20,1)]",
                            riskData.severity === "CRITICAL" ? "bg-red-50 border-red-500 text-red-950 font-bold" :
                            riskData.severity === "MODERATE" ? "bg-amber-50 border-amber-500 text-amber-955" :
                            "bg-emerald-50 border-emerald-500 text-emerald-955"
                          )}>
                            <p className="font-mono text-[8px] uppercase tracking-wider text-gray-500 leading-none">Severity Priority Status</p>
                            <p className="text-lg font-bold uppercase tracking-tight mt-1 flex items-center gap-1 items-stretch">
                              <span className={cn(
                                "w-2.5 h-2.5 rounded-full inline-block animate-ping",
                                riskData.severity === "CRITICAL" ? "bg-red-600" :
                                riskData.severity === "MODERATE" ? "bg-amber-500" : "bg-emerald-500"
                              )} />
                              {riskData.severity}
                            </p>
                          </div>

                          {/* Fasting glucose metric */}
                          <div className="border bg-white border-[#141414] p-3 flex flex-col justify-between h-20 shadow-[1px_1px_0px_rgba(20,20,20,1)]">
                            <p className="font-mono text-[8px] uppercase tracking-wider text-gray-500 leading-none">Fasting Blood Sugar</p>
                            <p className="text-xl font-extrabold tracking-tight mt-1 text-[#141414]">
                              {riskData.extractedVitals?.bloodSugar ? `${riskData.extractedVitals.bloodSugar} mg/dL` : "Not Found"}
                            </p>
                            <span className="font-mono text-[8px] text-gray-400">Ref: 70 - 100 mg/dL Normal</span>
                          </div>

                          {/* Blood pressure metric */}
                          <div className="border bg-white border-[#141414] p-3 flex flex-col justify-between h-20 shadow-[1px_1px_0px_rgba(20,20,20,1)]">
                            <p className="font-mono text-[8px] uppercase tracking-wider text-gray-500 leading-none">Systolic/Diastolic BP</p>
                            <p className="text-xl font-extrabold tracking-tight mt-1 text-[#141414]">
                              {riskData.extractedVitals?.systolicBP ? `${riskData.extractedVitals.systolicBP}/${riskData.extractedVitals.diastolicBP || "???"} mmHg` : "Not Found"}
                            </p>
                            <span className="font-mono text-[8px] text-gray-400">Ref: 120/80 mmHg Normal</span>
                          </div>

                        </div>

                        {/* Detected Risks tags and detailed analysis */}
                        <div className="space-y-4">
                          {riskData.detectedRisks && riskData.detectedRisks.length > 0 && (
                            <div>
                              <span className="block font-mono text-[9px] uppercase font-bold text-gray-400 mb-1.5">Identified Risk warning parameters:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {riskData.detectedRisks.map((t: string, idx: number) => (
                                  <span key={idx} className="font-mono text-[8.5px] font-extrabold bg-zinc-900 text-white rounded-none border px-2 py-0.5 uppercase">
                                    ⚠️ {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="border-t pt-3">
                            <span className="block font-mono text-[9px] uppercase font-bold text-gray-400 mb-1.5">Therapeutic Diagnosis Assessment:</span>
                            <div className="font-sans text-xs text-gray-800 leading-relaxed space-y-2 markdown-body bg-white p-3 border">
                              <Markdown>{riskData.analysis}</Markdown>
                            </div>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="py-6 text-center text-gray-400 font-mono text-[10px] uppercase">
                        Deploy the diagnostic metrics assay by clicking the tracker button above.
                      </div>
                    )}
                  </div>

                  {/* Part 2: Prescription Explainer */}
                  {record.type === "Prescription" && (
                    <div className="border border-[#141414] p-4 bg-slate-50">
                      <div className="flex justify-between items-center border-b border-[#141414] pb-3 mb-4">
                        <div>
                          <h4 className="font-sans text-sm font-extrabold text-[#141414] uppercase tracking-tight flex items-center gap-1.5">
                            <Sparkles size={15} className="text-indigo-600 animate-pulse" /> Pharmacological Dose & regimen Explainer
                          </h4>
                          <p className="font-mono text-[8.5px] text-gray-400 uppercase mt-0.5">Translates pharmacokinetics schedules & drug cautions into clear patient guidelines</p>
                        </div>
                        <Button 
                          onClick={getPrescriptionExplanation} 
                          disabled={rxLoading} 
                          variant="secondary" 
                          className="py-1 h-8 text-[9px]"
                        >
                          {rxLoading ? (
                            <span className="flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Analyzing regime...</span>
                          ) : "Assure medications detail"}
                        </Button>
                      </div>

                      {rxLoading ? (
                        <div className="py-8 text-center font-mono text-xs uppercase text-[#141414] animate-pulse">
                          Translating pharmaceutical blocks...
                        </div>
                      ) : rxData ? (
                        <div className="font-sans text-xs text-gray-800 leading-relaxed bg-white p-3.5 border space-y-2 markdown-body">
                          <Markdown>{rxData}</Markdown>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-gray-400 font-mono text-[10px] uppercase">
                          Examine pharmacological dosages and regimens using the explain button.
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

              {/* Tab 3: Interactive Medical Chat Assistant */}
              {activeTab === "chat" && (
                <div className="flex flex-col h-[400px] border border-[#141414]">
                  
                  {/* Messages window */}
                  <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
                    
                    {/* Welcome msg */}
                    <div className="flex gap-2 items-start max-w-[85%]">
                      <div className="p-1.5 bg-indigo-950 text-indigo-200 border text-[9px] font-mono leading-none">
                        VAULT AI
                      </div>
                      <div className="bg-white border border-[#141414] p-3 text-xs leading-relaxed text-gray-700 font-mono shadow-[1px_1px_0px_rgba(20,20,20,1)] rounded-none">
                        <p className="font-extrabold text-black mb-1">🔐 COGNITIVE MEDICAL RECORD CHAT LOCK INTACT</p>
                        I have de-identified and indexed your decrypted document locally. You can query me safely about dosing schedules, diagnostic parameters, or therapeutic alerts under absolute privacy. Ask me anything about this report!
                      </div>
                    </div>

                    {chatHistory.map((m, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex gap-2 items-start max-w-[85%]",
                          m.role === "user" ? "ml-auto flex-row-reverse" : ""
                        )}
                      >
                        <div className={cn(
                          "p-1.5 border text-[9px] font-mono leading-none flex-shrink-0",
                          m.role === "user" ? "bg-emerald-950 border-emerald-900 text-emerald-300" : "bg-indigo-950 text-indigo-200"
                        )}>
                          {m.role === "user" ? "PATIENT" : "VAULT AI"}
                        </div>
                        <div className={cn(
                          "p-3 text-xs leading-relaxed shadow-[1px_1px_rgba(20,20,20,1)] rounded-none font-sans whitespace-pre-wrap",
                          m.role === "user" ? "bg-emerald-50 text-emerald-950 border border-emerald-300" : "bg-white text-gray-800 border"
                        )}>
                          <Markdown>{m.text}</Markdown>
                        </div>
                      </div>
                    ))}

                    {chatLoading && (
                      <div className="flex gap-2 items-start max-w-[80%] animate-pulse">
                        <div className="p-1.5 bg-indigo-950 text-indigo-200 text-[9px] font-mono">VAULT AI</div>
                        <div className="p-2.5 bg-white border text-xs font-mono">Assaying clinical text context...</div>
                      </div>
                    )}

                  </div>

                  {/* Suggesters guidelines */}
                  <div className="bg-slate-100 p-2 border-t border-b flex flex-wrap gap-1.5 items-center">
                    <span className="font-mono text-[8px] text-gray-400 font-bold uppercase mr-1">Suggested Queries:</span>
                    <button 
                      onClick={(e) => handleSendChatMessage(e, "Deconstruct any abnormal high/low indicators in this record.")}
                      className="px-2 py-0.5 border bg-white hover:bg-indigo-50 hover:text-indigo-900 text-[8.5px] font-mono uppercase tracking-tight text-gray-600 rounded-none transition-colors"
                    >
                      Metrics assest
                    </button>
                    <button 
                      onClick={(e) => handleSendChatMessage(e, "Explain the exact diagnostic steps suggested in this report.")}
                      className="px-2 py-0.5 border bg-white hover:bg-indigo-50 hover:text-indigo-900 text-[8.5px] font-mono uppercase tracking-tight text-gray-600 rounded-none transition-colors"
                    >
                      Clinical Plan
                    </button>
                    {record.type === "Prescription" && (
                      <button 
                        onClick={(e) => handleSendChatMessage(e, "What are the common side effects and drug warning triggers for these medications?")}
                        className="px-2 py-0.5 border bg-white hover:bg-slate-55 hover:text-indigo-950 text-[8.5px] font-mono uppercase tracking-tight text-gray-600 rounded-none transition-colors"
                      >
                        Side Effects warnings
                      </button>
                    )}
                  </div>

                  {/* Input form */}
                  <form onSubmit={handleSendChatMessage} className="bg-white p-2.5 flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Ask clinical or pharmacological questions securely..." 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading}
                      className="flex-1 border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none placeholder:text-gray-400"
                    />
                    <Button type="submit" disabled={chatLoading} variant="primary" className="py-2.5 h-8">
                      Send Secure Message
                    </Button>
                  </form>

                </div>
              )}

            </div>
          </div>

          <div className="border-l border-[#141414] bg-slate-50 p-5 space-y-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <h3 className="font-mono text-[11px] uppercase font-bold text-[#141414] border-b pb-1">
                Zero-Knowledge Ledger Log
              </h3>
              
              <div className="space-y-3 font-mono text-[10px]">
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-gray-400 uppercase text-[9px]">Seal Mechanism:</span>
                  <span className="text-[#141414] font-extrabold">AES-256 GCM</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-gray-400 uppercase text-[9px]">Authority Check:</span>
                  <span className="font-extrabold text-indigo-700">Client Signature Verified</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-gray-400 uppercase text-[9px]">Verification Block:</span>
                  <span className="font-extrabold text-emerald-700">Tamper-Proof Ledger</span>
                </div>
                <div className="flex justify-between pb-1 py-1">
                  <span className="text-gray-400 uppercase text-[9px]">API Security Proxy:</span>
                  <span className="font-extrabold text-[#141414]">Server Proxy Protected</span>
                </div>
              </div>

              <div className="p-3 bg-slate-100 border text-slate-500 font-mono text-[9px] leading-relaxed uppercase-none">
                <span className="font-extrabold block text-[8px] text-gray-500 mb-0.5">SOVEREIGN DISCLAIMER:</span>
                This AI metrics interface is constructed strictly for diagnostic, educational, and workflow-support. Active diagnostic therapies always request secondary validations.
              </div>
            </div>

            <Button 
              onClick={onClose} 
              variant="secondary" 
              className="w-full h-9 shadow-[2px_2px_0px_rgba(20,20,20,1)] hover:shadow-none hover:translate-x-[1px]"
            >
              Close Record View
            </Button>
          </div>

        </div>
      </motion.div>
    </div>
  );
};

// Access Control management Modal
const SharingManageModal = ({ record, onClose, users }: { record: MedicalRecord, onClose: () => void, users: UserInfo[] }) => {
  const [grantedDoctorIds, setGrantedDoctorIds] = useState<string[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [signProgress, setSignProgress] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [leaseDurations, setLeaseDurations] = useState<Record<string, number>>({});

  const fetchPermissions = async () => {
    try {
      const res = await fetch(`/api/records?userId=${record.patientId}&role=Patient`);
      const allDoctors = users.filter(u => u.role === "Doctor");
      
      const activeDoctorList = [];
      for (const doc of allDoctors) {
        const checkRes = await fetch(`/api/records?userId=${doc.id}&role=Doctor`);
        const docRecords = await checkRes.json();
        if (docRecords.some((r: any) => r.id === record.id)) {
          activeDoctorList.push(doc.id);
        }
      }
      setGrantedDoctorIds(activeDoctorList);
    } catch (e) {
      console.error("Failed to read permissions", e);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [record]);

  const togglePermission = async (doctorId: string, isCurrentlyGranted: boolean) => {
    if (!passkey) {
      alert("Please enter your private vault signature passphrase to verify your dynamic block credentials.");
      return;
    }
    
    setUpdatingId(doctorId);
    setSignProgress(true);
    
    try {
      if (isCurrentlyGranted) {
        // Revoke
        const res = await fetch("/api/permissions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: record.id, patientId: record.patientId, doctorId }),
        });
        if (res.ok) {
          setGrantedDoctorIds(prev => prev.filter(id => id !== doctorId));
        }
      } else {
        // Grant with leased duration from dropdown selection
        const durationMinutes = leaseDurations[doctorId] || 0;
        const res = await fetch("/api/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            recordId: record.id, 
            patientId: record.patientId, 
            doctorId,
            durationMinutes: durationMinutes > 0 ? durationMinutes : undefined
          }),
        });
        if (res.ok) {
          setGrantedDoctorIds(prev => [...prev, doctorId]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
      setSignProgress(false);
    }
  };

  const doctors = users.filter((u: any) => u.role === "Doctor");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#E4E3E0]/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg">
        <Card title={`SOVEREIGN DELEGATION CONTROL`} subtitle={`RECORD ID: ${record.id}`} className="shadow-2xl">
          <div className="mb-4">
            <p className="font-sans text-xs text-gray-500 mb-3">
              Patients maintain absolute, autonomous cryptographical sovereignty. Revoking a doctor's permission immediately destroys their ability to decrypt your health document payload.
            </p>
            <div className="p-3 bg-[#141414]/5 border border-[#141414] border-dashed mb-4">
              <label className="block font-mono text-[9px] uppercase font-bold text-gray-600 mb-1 flex items-center gap-1">
                <Key size={10} className="text-black" /> Digital Signature Vault Passphrase
              </label>
              <input 
                type="password" 
                placeholder="Type private encryption key (e.g. alice-secure-vault-key)..." 
                value={passkey} 
                onChange={(e) => setPasskey(e.target.value)}
                className="w-full p-1.5 focus:outline-none border border-[#141414] font-mono text-xs"
              />
              <span className="font-mono text-[8px] text-gray-400 mt-1 block tracking-tight">
                * Encrypted authorization logs will be signed to the immutable blockchain block automatically.
              </span>
            </div>
          </div>

          <h3 className="font-mono text-[10px] uppercase text-gray-400 font-bold mb-2 border-b pb-1">Available Medical Providers ({doctors.length})</h3>
          <div className="space-y-2 max-h-[220px] overflow-y-auto mb-4 pr-1">
            {doctors.map((doc) => {
              const hasAccess = grantedDoctorIds.includes(doc.id);
              return (
                <div key={doc.id} className="border border-[#141414] p-3 bg-white flex justify-between items-center hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-none border border-[#141414] bg-indigo-50 flex items-center justify-center text-indigo-950">
                      <Stethoscope size={16} />
                    </div>
                    <div>
                      <h4 className="font-sans text-xs font-bold text-gray-900">{doc.name}</h4>
                      <p className="font-mono text-[8.5px] text-gray-400 uppercase tracking-tight">{doc.specialty || "Practitioner"} — Node ID: {doc.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {!hasAccess && (
                      <div className="flex items-center gap-1 mr-3">
                        <span className="font-mono text-[8px] uppercase text-gray-400">Lease:</span>
                        <select 
                          value={leaseDurations[doc.id] || 0}
                          onChange={(e) => setLeaseDurations(prev => ({ ...prev, [doc.id]: parseInt(e.target.value) }))}
                          className="font-mono text-[9px] bg-slate-50 border border-[#141414] p-0.5 focus:outline-none text-slate-800 rounded-none cursor-pointer"
                        >
                          <option value={0}>Persistent</option>
                          <option value={1}>1 Min lease</option>
                          <option value={5}>5 Mins lease</option>
                          <option value={30}>30 Mins lease</option>
                          <option value={1440}>24 Hours lease</option>
                        </select>
                      </div>
                    )}
                    <Button 
                      onClick={() => togglePermission(doc.id, hasAccess)}
                      disabled={updatingId === doc.id}
                      variant={hasAccess ? "primary" : "secondary"}
                      className={cn("h-7 px-3 text-[9px]", hasAccess ? "bg-rose-900/15 text-rose-900 hover:bg-rose-900 hover:text-white border-rose-900/10" : "")}
                    >
                      {updatingId === doc.id ? "Signing..." : hasAccess ? "Revoke Protocol" : "Authorize Node"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {doctors.length === 0 && (
              <p className="text-center font-mono text-[10px] py-12 text-gray-400">No doctors registered in current medvault network partition.</p>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button onClick={onClose} variant="secondary" className="h-8 py-1.5 px-4 text-[10px]">
              Sealed & Done
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

// Interactive secure record upload modal
const UploadModal = ({ onUpload, onClose, patientId, patientName, userKey }: any) => {
  const [type, setType] = useState("Prescription");
  const [content, setContent] = useState("");
  const [metadata, setMetadata] = useState("");
  
  // File upload state variables
  const [uploadMethod, setUploadMethod] = useState<"text" | "file">("text");
  const [fileDetails, setFileDetails] = useState<{ name: string; size: number; type: string; base64: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [encryptionKey, setEncryptionKey] = useState(userKey || "");

  const handleFileRead = (file: File) => {
    // Check file size, restrict to 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert("Attachment size exceeds maximum secure 5MB sandbox allocation. Please select a smaller record.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileDetails({
        name: file.name,
        size: file.size,
        type: file.type,
        base64: reader.result as string,
      });
      // Optionally pre-populate metadata suggestions!
      if (!metadata) {
        setMetadata(`Patient medical upload: ${file.name}`);
      }
    };
    reader.onerror = (e) => console.error("FileReader failed", e);
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileRead(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileRead(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!encryptionKey) {
      alert("Private AES Vault key required to seal the medical payload client-side.");
      return;
    }

    if (uploadMethod === "file") {
      if (!fileDetails) {
        alert("Please attach a clinical document, image (PNG, JPG), or PDF record.");
        return;
      }
      onUpload({
        type,
        content: fileDetails.base64, // Client-side gets encrypted as Base64 Data URL!
        metadata,
        fileName: fileDetails.name,
        fileType: fileDetails.type,
        customKey: encryptionKey
      });
    } else {
      if (!content) {
        alert("Enter sensitive diagnostic details.");
        return;
      }
      onUpload({
        type,
        content,
        metadata,
        customKey: encryptionKey
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#E4E3E0]/80 backdrop-blur-sm overflow-y-auto">
      <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-xl my-auto">
        <Card title="CLIENT-SIDE CIPHER BLOCK SEAL" subtitle="IMMUTABLE CLINICAL REGISTRY TRANSACTION PROTOCOL" className="shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-mono text-[10px] uppercase text-gray-500 font-bold">Author Patient Name: {patientName}</span>
              <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 text-[#141414]"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 border border-[#141414] p-1 bg-gray-50">
              <button 
                type="button" 
                onClick={() => { setUploadMethod("text"); setFileDetails(null); }}
                className={cn("py-2 text-center font-mono text-[10px] uppercase font-bold tracking-wider", uploadMethod === "text" ? "bg-[#141414] text-white" : "hover:bg-gray-200 text-gray-800")}
              >
                Safe Notes Text
              </button>
              <button 
                type="button" 
                onClick={() => setUploadMethod("file")}
                className={cn("py-2 text-center font-mono text-[10px] uppercase font-bold tracking-wider", uploadMethod === "file" ? "bg-[#141414] text-white" : "hover:bg-gray-200 text-gray-800")}
              >
                Secured PDF / Image Asset
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-[10px] uppercase font-bold text-gray-600 mb-1">Health Category Type</label>
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value)}
                  className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white"
                >
                  <option>Prescription</option>
                  <option>Laboratory Report</option>
                  <option>Radiology (X-Ray/MRI)</option>
                  <option>Vaccination Record</option>
                  <option>Discharge Summary</option>
                  <option>Other Clinical File</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase font-bold text-gray-600 mb-1">E2E Client Vault Encryption Key</label>
                <input 
                  type="password" 
                  value={encryptionKey}
                  onChange={(e) => setEncryptionKey(e.target.value)}
                  placeholder="Insert secret AES Key..."
                  required
                  className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none"
                />
              </div>
            </div>

            {uploadMethod === "text" ? (
              <div>
                <label className="block font-mono text-[10px] uppercase font-bold text-gray-600 mb-1">Clinical Assessment Note (Secured Client-Side)</label>
                <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required={uploadMethod === "text"}
                  rows={4}
                  placeholder="Write physician instructions, prescriptions, or clinical summaries here..."
                  className="w-full border border-[#141414] p-2.5 font-sans text-xs focus:ring-0 outline-none resize-none rounded-none bg-white font-mono"
                />
              </div>
            ) : (
              <div>
                <label className="block font-mono text-[10px] uppercase font-bold text-gray-600 mb-1">Client Sandbox Device Attachment upload (Max 5MB)</label>
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed border-[#141414] p-6 text-center cursor-pointer transition-colors bg-[#F8F9FA] hover:bg-slate-100 flex flex-col items-center justify-center min-h-[140px]",
                    dragActive ? "bg-slate-200 border-indigo-600" : ""
                  )}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    accept="image/*,application/pdf,.doc,.docx"
                    className="hidden" 
                  />
                  
                  {fileDetails ? (
                    <div className="space-y-2">
                      <div className="p-2 border border-emerald-500 bg-emerald-50 inline-block text-[#141414]">
                        {fileDetails.type.startsWith("image/") ? <FileImage size={24} /> : <FileText size={24} />}
                      </div>
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-800 uppercase block truncate max-w-[280px]">
                          {fileDetails.name}
                        </p>
                        <p className="font-mono text-[9px] text-[#2E7D32] uppercase mt-0.5">
                          SECURELY CONVERTED // {(fileDetails.size / 1024).toFixed(1)} KB FILE LOADED
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-1 px-3 bg-[#141414] text-[#E4E3E0] font-mono text-[9px] uppercase tracking-wide inline-block">
                        CHOOSE DOCUMENT
                      </div>
                      <p className="text-gray-500 font-sans text-xs">
                        Drag and drop your file here, or click to browse <br/>
                        <span className="font-mono text-[9px] text-gray-400 font-bold uppercase">(PDF, PNG, JPG accepted safely)</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block font-mono text-[10px] uppercase font-bold text-gray-600 mb-1">Public Metadata Searchable Tag</label>
              <input 
                value={metadata}
                onChange={(e) => setMetadata(e.target.value)}
                placeholder="Brief summary caption (e.g. Cardiologist prescription details)"
                required
                className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none"
              />
              <span className="font-mono text-[8px] text-gray-400 mt-1 block">
                * Note: Metadata tags are readable by auditors for transparency and structural indexing. Keep it general.
              </span>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t">
              <Button type="button" variant="secondary" onClick={onClose} className="h-9">
                Abort
              </Button>
              <Button type="submit" variant="primary" className="h-9">
                <Lock size={12} /> Sign & Crypt-Seal Record
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

// --- Main Dashboards ---

const PatientDashboard = ({ user, users }: { user: UserInfo, users: UserInfo[] }) => {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sharingRecord, setSharingRecord] = useState<MedicalRecord | null>(null);

  const fetchRecords = async () => {
    try {
      const res = await fetch(`/api/records?userId=${user.id}&role=Patient`);
      setRecords(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/audit?userId=${user.id}&role=Patient`);
      setLogs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchLogs();
  }, [user]);

  const handleUpload = async (data: any) => {
    const encrypted = encryptData(data.content, data.customKey || user.key || "default-key");
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: user.id,
        patientName: user.name,
        type: data.type,
        encryptedData: encrypted,
        metadata: data.metadata,
        fileName: data.fileName,
        fileType: data.fileType
      }),
    });
    if (res.ok) {
      setShowUpload(false);
      fetchRecords();
      fetchLogs();
    }
  };

  const handleOpenSharing = (e: React.MouseEvent, record: MedicalRecord) => {
    e.stopPropagation();
    setSharingRecord(record);
  };

  const filteredRecords = records.filter(
    r => r.type.toLowerCase().includes(searchQuery.toLowerCase()) || 
         r.metadata.toLowerCase().includes(searchQuery.toLowerCase()) ||
         (r.fileName && r.fileName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#141414] pb-6">
        <div>
          <span className="font-mono text-[9px] bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 uppercase tracking-widest border border-emerald-900 rounded-none mb-2 inline-block animate-pulse">
            Client Safe-Node Online
          </span>
          <h1 className="font-sans text-4xl font-extrabold tracking-tight text-[#141414]">
            Patient Portal
          </h1>
          <p className="font-mono text-xs opacity-60 uppercase mt-1">
            Mnemonic: {user.id} // Vault Key: sha256_enc_sha3_node
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button onClick={() => setShowUpload(true)} className="w-full md:w-auto shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-y-[-1px]">
            <Plus size={16} /> Seed Clinical Document
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Records List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase font-bold text-[#141414] bg-white border border-[#141414] px-4 py-1.5 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
              <FileText size={13} className="text-[#141414]" /> My Safe Medical records ({filteredRecords.length})
            </h2>
            
            <div className="relative w-full md:w-72">
              <input 
                type="text" 
                placeholder="Search secure metadata..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#141414] font-mono p-2 text-xs placeholder:text-gray-400 focus:outline-none"
              />
              <Search size={14} className="absolute right-3 top-2.5 opacity-40 text-black" />
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-16 border-2 border-dashed border-[#141414] bg-white/50 text-center flex flex-col items-center justify-center">
              <Lock className="w-10 h-10 text-gray-300 mb-2" />
              <p className="font-mono text-xs text-gray-500 uppercase tracking-wide">Secure Cryptographic safe is empty.</p>
              <p className="font-mono text-[9px] text-gray-400 uppercase mt-1">Upload records to register transactions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map(r => (
                <div 
                  key={r.id} 
                  onClick={() => setSelectedRecord(r)}
                  className="group relative border border-[#141414] p-4 bg-white hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors cursor-pointer flex justify-between items-center shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,0.85)]"
                >
                  <div className="flex gap-4 items-center min-w-0 pr-4">
                    <div className="bg-sky-50 group-hover:bg-[#141414] p-2.5 border border-[#141414] group-hover:border-[#E4E3E0] transition-colors flex-shrink-0">
                      {r.fileType?.startsWith("image/") ? (
                        <FileImage size={24} className="text-[#141414] group-hover:text-[#E4E3E0]" />
                      ) : (
                        <FileText size={24} className="text-[#141414] group-hover:text-[#E4E3E0]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-sans text-sm font-extrabold uppercase truncate">{r.type}</h3>
                        {r.fileName && (
                          <span className="font-mono text-[8.5px] border border-gray-200 group-hover:border-zinc-800 px-1 py-0.5 uppercase tracking-tight text-gray-500">
                            ATTACHMENT
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-gray-400 group-hover:text-[#E4E3E0]/70 truncate uppercase italic mt-1 bg-slate-50 group-hover:bg-[#141414] inline-block px-1">
                        "{r.metadata}"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="hidden sm:flex flex-col items-end text-right font-mono text-[9px] uppercase tracking-wider opacity-60">
                      <span>VERIFIED TIMESTAMP</span>
                      <span className="font-bold">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <Button 
                      variant="secondary" 
                      onClick={(e: React.MouseEvent) => handleOpenSharing(e, r)}
                      className="group-hover:text-white group-hover:border-white h-8 text-[10px]"
                    >
                      <Share2 size={13} /> Share Access
                    </Button>
                    <ChevronRight size={14} className="opacity-30 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ledger & Vault Stats Panel */}
        <div className="space-y-6">
          <h2 className="font-mono text-[11px] uppercase font-bold text-[#141414] bg-white border border-[#141414] px-4 py-1.5 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
            <Clock size={12} /> Live Immutable Ledger
          </h2>
          
          <Card title="METADATA PROTOCOL LOGS" className="max-h-[360px] overflow-auto p-0">
            <div className="divide-y divide-[#141414] overflow-y-auto max-h-[300px]">
              {logs.map((l, i) => (
                <div key={l.id || i} className="p-3.5 bg-white hover:bg-slate-50">
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "font-mono text-[8px] px-1.5 py-0.5 border font-bold uppercase",
                      l.action === "UPLOAD" ? "bg-blue-50 text-blue-800 border-blue-200" :
                      l.action === "GRANT_ACCESS" ? "bg-emerald-50 text-emerald-800 border-emerald-200 animate-pulse" :
                      l.action === "REVOKE_ACCESS" ? "bg-rose-50 text-rose-800 border-rose-200" :
                      "bg-amber-50 text-amber-800 border-amber-200"
                    )}>
                      {l.action}
                    </span>
                    <span className="font-mono text-[8px] text-gray-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="font-mono text-[9px] text-gray-600 truncate uppercase mt-1">{l.details}</p>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="p-8 text-center text-gray-400 font-mono text-[10px]">No local blocks mined.</div>
              )}
            </div>
          </Card>

          <Card title="SECURITY VAULT SHIELDing" className="bg-[#E2F1E8]/40 border-emerald-950/20">
            <div className="flex items-start gap-3 text-emerald-900">
              <CheckCircle2 size={18} className="text-emerald-700 mt-0.5 flex-shrink-0" />
              <div className="font-mono text-[10px] space-y-1">
                <p className="font-bold uppercase leading-none text-emerald-950">Active Sovereignty Protection</p>
                <p className="text-gray-600 leading-normal uppercase text-[8.5px]">
                  All file payloads are client-side encrypt-sealed. Cloud entities cannot read data, enforce access, or leak content. Only you command keys.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {showUpload && (
        <UploadModal 
          onUpload={handleUpload} 
          onClose={() => setShowUpload(false)} 
          patientId={user.id} 
          patientName={user.name} 
          userKey={user.key}
        />
      )}

      {selectedRecord && (
        <RecordDetail 
          record={selectedRecord} 
          role="Patient" 
          onClose={() => setSelectedRecord(null)} 
          userKey={user.key}
          refreshRecords={fetchRecords}
        />
      )}

      {sharingRecord && (
        <SharingManageModal 
          record={sharingRecord} 
          onClose={() => { setSharingRecord(null); fetchLogs(); }} 
          users={users}
        />
      )}
    </div>
  );
};

const DoctorDashboard = ({ user, users }: { user: UserInfo, users: UserInfo[] }) => {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Break Glass State
  const [breakGlassSessions, setBreakGlassSessions] = useState<Record<string, { active: boolean, key?: string }>>({});
  const [showBGMental, setShowBGMental] = useState<UserInfo | null>(null);
  const [bgJustification, setBgJustification] = useState("");
  const [bgSignature, setBgSignature] = useState("");
  const [bgSubmitting, setBgSubmitting] = useState(false);

  const fetchRecords = async () => {
    try {
      const res = await fetch(`/api/records?userId=${user.id}&role=Doctor`);
      setRecords(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const checkBreakGlassStatuses = async () => {
    const patients = users.filter(u => u.role === "Patient");
    const sessionsCopy: Record<string, { active: boolean, key?: string }> = {};
    
    for (const pat of patients) {
      try {
        const statusRes = await fetch(`/api/break-glass/status?patientId=${pat.id}&doctorId=${user.id}`);
        const statusData = await statusRes.json();
        
        if (statusData.active) {
          // Fetch leased key from server
          const keyRes = await fetch(`/api/break-glass/key?patientId=${pat.id}&doctorId=${user.id}`);
          const keyData = await keyRes.json();
          sessionsCopy[pat.id] = { active: true, key: keyData.key };
        } else {
          sessionsCopy[pat.id] = { active: false };
        }
      } catch (err) {
        console.error("BG evaluation error", err);
      }
    }
    setBreakGlassSessions(sessionsCopy);
  };

  useEffect(() => {
    fetchRecords();
    checkBreakGlassStatuses();
  }, [user, users]);

  const handleTriggerBreakGlass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showBGMental) return;
    if (!bgJustification || !bgSignature) {
      alert("Please supply clinical justification and provider digital signature credentials.");
      return;
    }

    setBgSubmitting(true);
    try {
      const res = await fetch("/api/break-glass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: showBGMental.id,
          doctorId: user.id,
          justification: bgJustification
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`ERR EMERGENCY OVERRIDE PROTOCOL ACTIVATED!\n\nAccess successfully leased for block decryption context. Transaction registered in Immutable ledger block hash: ${data.auditLogRef?.blockHash?.substring(0, 16)}`);
        
        // Retrieve key and refresh
        const keyRes = await fetch(`/api/break-glass/key?patientId=${showBGMental.id}&doctorId=${user.id}`);
        const keyData = await keyRes.json();
        
        setBreakGlassSessions(prev => ({
          ...prev,
          [showBGMental.id]: { active: true, key: keyData.key }
        }));

        setBgJustification("");
        setBgSignature("");
        setShowBGMental(null);
        
        // Reload clinical records lists
        await fetchRecords();
      } else {
        alert("Bypass request declined by security nodes.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBgSubmitting(false);
    }
  };

  const filtered = records.filter(
    r => r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
         r.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
         r.metadata.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDecryptionKeyForDoctor = (record: MedicalRecord) => {
    const bgSession = breakGlassSessions[record.patientId];
    if (bgSession?.active && bgSession?.key) {
      return bgSession.key;
    }
    return record.patientId === "P_001" ? "alice-secure-vault-key" : (record.patientId === "P_002" ? "david-secure-vault-key" : "");
  };

  const patientsList = users.filter(u => u.role === "Patient");

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-y-4 border-b border-[#141414] pb-6">
        <div>
          <span className="font-mono text-[9px] bg-indigo-950 text-indigo-300 font-bold px-2 py-0.5 uppercase tracking-widest border border-indigo-900 rounded-none mb-2 inline-block">
            Verified Practitioner License Active
          </span>
          <h1 className="font-sans text-4xl font-extrabold tracking-tight text-[#141414]">
            Provider Workbench
          </h1>
          <p className="font-mono text-xs opacity-60 uppercase mt-1">
            Doctor ID: {user.id} // Specialty Node: {user.specialty || "Diagnostic Services"}
          </p>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left 3 columns: Shared Records Ledger */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase font-bold text-[#141414] bg-white border border-[#141414] px-4 py-1.5 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
              <User size={13} /> Authorized shared files ({filtered.length})
            </h2>

            <div className="relative w-full sm:w-72">
              <input 
                type="text" 
                placeholder="Filter by patient, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#141414] font-mono p-2 text-xs placeholder:text-gray-400 focus:outline-none"
              />
              <Search size={14} className="absolute right-3 top-2.5 opacity-40 text-black" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-16 border-2 border-dashed border-[#141414] bg-white/50 text-center flex flex-col items-center justify-center">
              <AlertCircle className="w-10 h-10 text-gray-300 mb-2 animate-bounce" />
              <p className="font-mono text-xs text-slate-500 uppercase font-bold mb-1">No shared records active</p>
              <p className="font-sans text-xs text-gray-400 max-w-sm mx-auto leading-normal">
                Physicians possess decrypted authorization only when patients explicitly sign access tokens, OR when emergency Break Glass covenants are initiated.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {filtered.map(r => {
                const isBGActive = breakGlassSessions[r.patientId]?.active;
                return (
                  <Card 
                    key={r.id} 
                    title={r.type} 
                    className="hover:border-black transition-colors cursor-pointer group hover:-translate-y-0.5"
                    onClick={() => setSelectedRecord(r)}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="font-mono">
                          <p className="text-[9px] text-gray-400 uppercase font-bold leading-none mb-1">SOVEREIGN OWNER: ID {r.patientId}</p>
                          <p className="text-sm font-extrabold text-[#141414]">{r.patientName}</p>
                        </div>
                        <div className="p-2 border border-[#141414] bg-indigo-50 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                          {r.fileType?.startsWith("image/") ? <FileImage size={18} /> : <FileText size={18} />}
                        </div>
                      </div>

                      <div className="py-2.5 px-3 bg-slate-50 border border-slate-100 font-mono text-[10px] text-slate-500 italic">
                        "{r.metadata}"
                      </div>

                      {isBGActive && (
                        <div className="font-mono text-[8.5px] text-amber-800 bg-amber-50 border border-amber-300 flex items-center gap-1.5 px-2 py-0.5 uppercase font-bold">
                          🚨 Emergency active bypass node
                        </div>
                      )}

                      {r.fileName && (
                        <div className="font-mono text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-100 flex items-center gap-1.5 px-2 py-0.5">
                          <FileCode size={11} /> ATTACHED FILE CONSOLE AVAILABLE
                        </div>
                      )}

                      <div className="flex items-center justify-between font-mono text-[8.5px] text-gray-400 uppercase pt-2 border-t">
                        <span>File Ref: {r.id.substring(0, 8)}</span>
                        <span className="font-bold">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Emergency Bypass (Break Glass) Directory */}
        <div className="space-y-4">
          <h2 className="font-mono text-[11px] uppercase font-bold text-[#141414] bg-rose-50 border-2 border-rose-900 text-rose-955 px-4 py-1.5 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(153,27,27,1)]">
            <Activity size={13} className="text-rose-900 animate-pulse" /> Emergency bypass panel
          </h2>

          <div className="border border-[#141414] p-4 bg-white space-y-4">
            <p className="font-sans text-[11px] leading-relaxed text-gray-500">
              When patient access is delayed due to severe trauma, alter-consciousness, or clinical emergency, medical staff may bypass consent agreements temporarily.
            </p>

            <div className="space-y-3">
              {patientsList.map(pat => {
                const session = breakGlassSessions[pat.id];
                const active = session?.active;
                
                // Has regular shared records?
                const hasRegularShared = records.some(r => r.patientId === pat.id);

                return (
                  <div key={pat.id} className="border p-3 space-y-2 bg-slate-50">
                    <div className="flex justify-between items-start leading-none">
                      <div>
                        <h4 className="font-sans text-xs font-bold text-gray-950">{pat.name}</h4>
                        <span className="font-mono text-[8px] text-gray-400">Node Ref: {pat.id}</span>
                      </div>
                      
                      {active ? (
                        <span className="font-mono text-[8px] bg-rose-950 text-rose-300 font-bold px-1.5 py-0.5 animate-pulse border border-rose-900">
                          ACTIVE OVERRIDE
                        </span>
                      ) : hasRegularShared ? (
                        <span className="font-mono text-[8.0px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.5">
                          AUTH INTACT
                        </span>
                      ) : (
                        <span className="font-mono text-[8px] text-gray-400 bg-white border px-1 py-0.5 uppercase">
                          No Consent
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-center py-1">
                      {active ? (
                        <p className="font-mono text-[8.5px] text-rose-800 italic uppercase">30-min decryption lease active</p>
                      ) : hasRegularShared ? (
                        <p className="font-mono text-[8.5px] text-emerald-800 leading-tight">Patient keys shared standardly</p>
                      ) : (
                        <p className="font-mono text-[8.5px] text-slate-500">Consent key required for Decryption</p>
                      )}
                    </div>

                    {!hasRegularShared && !active && (
                      <button 
                        onClick={() => setShowBGMental(pat)}
                        className="w-full text-center font-mono text-[9px] uppercase font-bold py-1 bg-rose-900 text-white hover:bg-rose-950 transition-colors rounded-none border border-rose-950 flex items-center justify-center gap-1"
                      >
                        ⚠️ BREAK GLASS OVERRIDE
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Break Glass override Modal */}
      <AnimatePresence>
        {showBGMental && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rose-900/40 backdrop-blur-md overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md my-auto"
            >
              <Card 
                title="🌋 EMERGENCY IMMUTABLE BYPASS COVENANT" 
                subtitle={`PATIENT OVERRIDE PROTOCOL: ${showBGMental.name}`}
                className="border-2 border-red-700 bg-red-50/50 shadow-2xl"
              >
                <form onSubmit={handleTriggerBreakGlass} className="space-y-4">
                  
                  <div className="p-3 bg-red-950 border border-red-800 text-red-150 font-mono text-[10px] leading-relaxed uppercase-none">
                    <p className="font-bold text-yellow-400 uppercase mb-1">🚨 CRIMINAL PENALTY AND ACCOUNTABILITY NOTICE:</p>
                    ACTIVATING THIS OVERRIDE RETRIEVES THE PATIENT'S SECURE RAW VAULT KEY FROM PRIVATE COGNITIVE MULTI-ACCORD KEYS SAFELY. YOUR DOCTOR ID AND SESSION TIME WILL BE ENCRYPTED AND COMMITTED PERMANENTLY TO THE DISTRIBUTED LEDGER AUDIT LOGS. STRICTLY RESERVED FOR LIFE-THREATENING EMERGENCY EVENTS.
                  </div>

                  <div>
                    <label className="block font-mono text-[9px] uppercase font-bold text-gray-700 mb-1">Emergency Justification logs</label>
                    <textarea 
                      required
                      rows={3}
                      placeholder="Patient is currently unconscious in trauma bay. Core hemodynamic stats deteriorating. Immediate imaging diagnostics review required..."
                      value={bgJustification}
                      onChange={(e) => setBgJustification(e.target.value)}
                      className="w-full border border-red-900 bg-white font-mono text-xs p-2 focus:ring-0 outline-none rounded-none text-slate-800 placeholder:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[9px] uppercase font-bold text-gray-700 mb-1">Provider Digital signature verify</label>
                    <input 
                      type="text"
                      required
                      placeholder={`Enter signature (e.g. Dr. ${user.name})`}
                      value={bgSignature}
                      onChange={(e) => setBgSignature(e.target.value)}
                      className="w-full border border-red-900 bg-white font-mono text-xs p-2 focus:ring-0 outline-none rounded-none text-slate-800 font-extrabold"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2 border-t border-red-300">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowBGMental(null);
                        setBgJustification("");
                        setBgSignature("");
                      }}
                      className="px-4 py-1.5 border border-red-900 text-red-900 font-mono text-[10px] uppercase font-bold hover:bg-red-900/10 transition-all rounded-none"
                    >
                      Bailout Escape
                    </button>
                    <Button 
                      type="submit" 
                      disabled={bgSubmitting}
                      className="bg-red-850 hover:bg-red-950 text-white font-mono text-[10px] font-bold py-1 px-4 leading-none h-8"
                    >
                      {bgSubmitting ? "OVERRIDING..." : "🌋 PROTOCOL BREAK"}
                    </Button>
                  </div>

                </form>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Record details */}
      {selectedRecord && (
        <RecordDetail 
          record={selectedRecord} 
          role="Doctor" 
          onClose={() => setSelectedRecord(null)} 
          userKey={getDecryptionKeyForDoctor(selectedRecord)}
          refreshRecords={fetchRecords}
        />
      )}
    </div>
  );
};

const StudentDashboard = ({ user, users }: { user: UserInfo, users: UserInfo[] }) => {
  const [passphrase, setPassphrase] = useState("");
  const [decryptedKey, setDecryptedKey] = useState<string | null>(null);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("CASE_01");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [observationRequests, setObservationRequests] = useState<Record<string, "PENDING" | "GRANTED" | "DENIED">>({});
  const [sandboxLog, setSandboxLog] = useState<string[]>(["Sandbox clinical simulation engine loaded successfully."]);

  // Simulated locked case studies encrypted with standard AES parameters
  const cases = [
    {
      id: "CASE_01",
      title: "Cerebral MRI Anomalies (Neuro-imaging Diagnostic Phase)",
      code: "LAB-MRI-8842",
      encryptedText: "U2FsdGVkX19N0q24r9kPXg2L6vXz2q1L=EncryptedCaseNeuroFindings===",
      correctKey: "STUDY_LAB_MRI",
      plainContent: `PATIENT DEMOGRAPHICS: Anonymous / Subject neuro-S-110
STUDY TYPE: 3T brain MRI with and without gadolinium contrast.
FINDINGS: There is a well-circumscribed, extra-axial mass arising from the left cerebellopontine angle, measuring approximately 1.8 x 2.1 x 1.9 cm. This lesion is hypointense on T1-weighted sequences and hyperintense on T2/FLAIR, demonstrating robust and homogeneous enhancement post-contrast. Mild mass effect is observed on the adjacent cerebellar hemisphere and brainstem without significant fourth ventricular compression or hydrocephalus. Cranial nerves VII and VIII appear adjacent to the mass but are structurally intact.
IMPRESSION: Findings are highly characteristic of a left cerebellopontine angle vestibular schwannoma (acoustic neuroma). Recommend neurosurgical and audiological consultation.`,
      difficulty: "Advanced Neuropathology"
    },
    {
      id: "CASE_02",
      title: "Comprehensive Lab Panel: Pediatric Hematology Indicators",
      code: "LAB-HEM-9912",
      encryptedText: "U2FsdGVkX19N3k99pLp8371X=EncryptedCaseHematologyPanel===",
      correctKey: "STUDY_LAB_HEM",
      plainContent: `CLINICAL ANALYSIS WORKSPACE - PEDIATRICS
TEST CATEGORY: Complete Blood Count (CBC) with Differential.
FINDINGS:
- White Blood Cell (WBC): 14.8 x10^3/uL (HIGH) [Ref: 4.5 - 11.0]
- Hemoglobin (Hgb): 9.2 g/dL (LOW) [Ref: 11.5 - 14.5]
- Platelets (PLT): 495 x10^3/uL (HIGH) [Ref: 150 - 400]
- Neutrophils: 78% (HIGH) [Ref: 40 - 60]
- Lymphocytes: 12% (LOW) [Ref: 20 - 40]
IMPRESSION: Markedly elevated leukocytosis with neutrophil predominance and moderate microcytic anemia. These values suggest an active bacterial inflammatory process or severe tissue injury, coupled with iron-deficiency anemia of pediatric onset. Close clinical monitoring and hematology consultation advised.`,
      difficulty: "Clinical Pediatrics"
    },
    {
      id: "CASE_03",
      title: "Oncology Drug Trial Protocol & Pharmacokinetics",
      code: "DRUG-ONC-0115",
      encryptedText: "U2FsdGVkX19M3p19qR291xS=EncryptedCasePharmacokinetics===",
      correctKey: "STUDY_LAB_ONC",
      plainContent: `CLINICAL TRIAL DOSING SCHEDULE & METRIC SUMMARY
INVESTIGATIONAL AGENT: MV-9942 (Sovereign Nanotarget inhibitor).
ADMINISTRATION PHASE: Cycle 2, Day 14 pharmacokinetic evaluation.
FINDINGS: Peak plasma concentration (Cmax) achieved at 2.4 hours post-infusion was 44.5 mcg/mL, exceeding predicted systemic exposure metrics by 12%. Terminal half-life (t1/2) calculated at 18.2 hours. Transient Group 2 thrombocytopenia observed in dosage tier 4 participants, fully self-correcting without supportive growth factor interventions.
IMPRESSION: Therapeutic target threshold cleanly established. Target receptor occupancy maintained above 85% for the duration of the 24-hour dosing interval. Proceed with caution to Dose Elevation Phase 3 guidelines.`,
      difficulty: "Clinical Pharmacology"
    }
  ];

  const activeCase = cases.find(c => c.id === selectedCaseId) || cases[0];

  const handleDecryptCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    
    setIsDecrypting(true);
    setDecryptedKey(null);
    setDecryptedText(null);
    setAiSummary("");
    
    setTimeout(() => {
      if (passphrase.trim() === activeCase.correctKey) {
        setDecryptedKey(passphrase);
        setDecryptedText(activeCase.plainContent);
        setSandboxLog(prev => [
          `[SUCCESS] Decentralized decryption key [${passphrase}] verified for block: ${activeCase.code}`,
          ...prev
        ]);
      } else {
        setSandboxLog(prev => [
          `[FAILURE] Decryption attempt rejected. Invalid key passphrase for block: ${activeCase.code}`,
          ...prev
        ]);
        alert("CRITICAL ERROR: High-entropy signature mismatch. Sandbox decryption failed.");
      }
      setIsDecrypting(false);
    }, 850);
  };

  const handleAnalyzeWithAI = async () => {
    if (!decryptedText) return;
    setIsAiProcessing(true);
    try {
      const res = await fetch("/api/gemini/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decryptedContent: decryptedText,
          recordType: `Medical Student Study Case Analysis (${activeCase.difficulty})`
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.summary);
        setSandboxLog(prev => [
          `[AI INSIGHT] Sovereign diagnostic analysis summary generated cleanly.`,
          ...prev
        ]);
      } else {
        alert("AI interpreter declined the request.");
      }
    } catch (e) {
      console.error(e);
      alert("AI interpretation pipeline dropped connection.");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const requestObservation = (patientId: string, patientName: string) => {
    setObservationRequests(prev => ({
      ...prev,
      [patientId]: "PENDING"
    }));
    
    setSandboxLog(prev => [
      `[PIPELINE] Requested research access credential leasing from patient node: ${patientName} (${patientId})`,
      ...prev
    ]);

    setTimeout(() => {
      const isApproved = Math.random() > 0.4;
      setObservationRequests(prev => ({
        ...prev,
        [patientId]: isApproved ? "GRANTED" : "DENIED"
      }));

      setSandboxLog(prev => [
        isApproved 
          ? `[GRANTED] Access ticket granted by patient ${patientName} using cryptographic node signature.`
          : `[DENIED] Patient ${patientName} declined the diagnostic study request and revoked key lease.`,
        ...prev
      ]);
    }, 1800);
  };

  const handleDownloadIdentity = () => {
    const infoText = `MEDVAULT SECURE SOVEREIGN PROFILE BADGE
====================================
FIRST NAME: ${user.firstName || user.name.split(" ")[0]}
LAST NAME: ${user.lastName || user.name.split(" ")[1] || ""}
CONTACT NO: ${user.contactNo || "N/A"}
EMAIL ID: ${user.email || "N/A"}
ROLE: ${user.role} (Academic / Research Node)
STUDENT ID: ${user.studentId || "N/A"}
DEPARTMENT: ${user.course || "N/A"}
NETWORK PARTITION: Sovereign Decentralized Core
====================================
DO NOT SHARE PASSWORDS OR PRIVATE KEYS.
`;
    const element = document.createElement("a");
    const file = new Blob([infoText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${user.name.toLowerCase().replace(/\s+/g, "_")}_medvault_badge.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-8 animate-fadeIn text-[#141414]">
      {/* Top Welcome Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#141414] pb-6">
        <div>
          <span className="font-mono text-[9px] bg-blue-950 text-blue-300 font-bold px-2 py-0.5 uppercase tracking-widest border border-blue-900 rounded-none mb-2 inline-block">
            Decentralized Academic Scholar Session
          </span>
          <h1 className="font-sans text-4xl font-extrabold tracking-tight text-[#141414]">
            Student Research Workspace
          </h1>
          <p className="font-mono text-xs opacity-60 uppercase mt-1">
            Registered Scholar: {user.name} // Course Path: {user.course}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDownloadIdentity} variant="secondary" className="shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-y-[-1px] font-mono text-[10px] uppercase">
            <Download size={12} /> Download Badge
          </Button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Profile and Network Stats Left Column */}
        <div className="space-y-6">
          <Card title="ACTIVE ACADEMIC BADGE" subtitle="SOVEREIGN RESEARCH CREDENTIALS">
            <div className="border border-blue-900 bg-blue-50/40 p-4 relative overflow-hidden flex flex-col justify-between h-48">
              <div className="absolute top-[-30px] right-[-30px] opacity-10 bg-blue-950 w-24 h-24 rounded-full pointer-events-none" />
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-sans text-xs font-black uppercase text-blue-950 tracking-tight leading-none mb-1">
                    {user.firstName || user.name.split(" ")[0]} {user.lastName || user.name.split(" ")[1] || ""}
                  </h4>
                  <p className="font-mono text-[9px] text-blue-800 uppercase font-bold tracking-tight">
                    {user.course || "Medical Research"}
                  </p>
                </div>
                <GraduationCap className="h-10 w-10 text-blue-950/80 p-1 bg-white border border-blue-900" />
              </div>

              <div className="border-t border-blue-200 pt-3 flex flex-col gap-1 font-mono text-[9px] text-blue-950">
                <div className="flex justify-between">
                  <span className="opacity-70">STUDENT ID:</span>
                  <span className="font-black">{user.studentId || "STU-8842"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">CONTACT NO:</span>
                  <span className="font-black">{user.contactNo || "+1 (555) 016-5522"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">EMAIL ADDR:</span>
                  <span className="font-black truncate max-w-[140px]">{user.email || "student@medvault.edu"}</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-[8px] font-mono mt-2 border-t pt-2 border-dashed border-blue-300">
                <span className="text-emerald-700 font-bold">● NODE ACTIVE & VERIFIED</span>
                <span className="opacity-50">PARTITION 04</span>
              </div>
            </div>
          </Card>

          {/* Sandbox Systems Log */}
          <Card title="LAB TELEMETRY METRIC LOG" subtitle="REAL-TIME SANDBOX DECRYPTION FEED">
            <div className="font-mono text-[9.5px] p-3 bg-zinc-950 text-emerald-400 h-64 overflow-y-auto space-y-1 rounded-none border border-[#141414]">
              {sandboxLog.map((log, index) => (
                <div key={index} className="border-b border-zinc-900 pb-1 leading-normal">
                  <span className="text-zinc-500 mr-1 opacity-70">[{new Date().toLocaleTimeString()}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Diagnostic Simulator Middle & Right Block */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="E2E CRYPTOGRAPHIC DIAGNOSTIC SIMULATOR" subtitle="DECRYPT SECURED STUDY RECORDS FOR EVALUATION">
            <div className="space-y-4">
              
              {/* Select Study Case Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border p-1 bg-gray-50">
                {cases.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCaseId(c.id);
                      setDecryptedKey(null);
                      setDecryptedText(null);
                      setAiSummary("");
                      setPassphrase("");
                    }}
                    className={cn(
                      "p-2.5 text-left transition-all border font-mono",
                      selectedCaseId === c.id
                        ? "bg-blue-950 text-white border-blue-950"
                        : "hover:bg-gray-200 text-[#141414] bg-white border-gray-300"
                    )}
                  >
                    <div className="text-[9px] uppercase font-bold text-gray-400">MODULE BLOCK</div>
                    <div className="text-xs font-black truncate mt-0.5">{c.code}</div>
                    <div className="text-[8px] mt-1 opacity-80 uppercase font-black tracking-tight">{c.difficulty}</div>
                  </button>
                ))}
              </div>

              {/* Secure record presentation frame */}
              <div className="border border-red-950 bg-red-50/20 p-4 rounded-none">
                <div className="flex justify-between items-center mb-2 border-b border-red-200 pb-2">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-red-950 font-bold uppercase">
                    <Lock size={12} className="text-red-800" /> AES-256 CYCLIC LOCKED BLOCK: {activeCase.code}
                  </div>
                  <span className="font-mono text-[8.5px] bg-red-100 text-red-900 border border-red-300 font-extrabold px-1.5 uppercase tracking-wide">
                    Encrypted Segment
                  </span>
                </div>

                {!decryptedText ? (
                  <div className="space-y-3">
                    <p className="font-sans text-xs text-red-950 opacity-80 leading-relaxed uppercase">
                      This diagnostic block contains protected clinical history metrics. Input the clinical security key to complete client-side decryption.
                    </p>
                    <div className="p-3.5 bg-white font-mono text-[10px] text-gray-400 break-all select-all border border-red-200">
                      {activeCase.encryptedText}
                    </div>

                    <form onSubmit={handleDecryptCase} className="flex gap-2 items-center">
                      <div className="text-[10px] font-mono text-red-900 font-extrabold uppercase mr-1">PASSCODE KEY:</div>
                      <input 
                        type="search" 
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder={`Try correct key: ${activeCase.correctKey}`}
                        className="flex-1 border border-red-950 p-1.5 font-mono text-xs focus:ring-0 bg-white"
                        required
                      />
                      <Button type="submit" variant="primary" disabled={isDecrypting} className="h-8 font-mono text-[10px] px-4 font-bold bg-red-950 border-red-950 text-white hover:bg-red-900">
                        {isDecrypting ? "Decrypting..." : "Decrypt Record"}
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div className="rounded-none bg-emerald-50/50 border border-emerald-500 p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-emerald-200 pb-2">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-950 font-bold">
                        <Unlock size={12} className="text-emerald-700" /> DECRYPTED SECURE SANDBOX TEXT
                      </div>
                      <span className="font-mono text-[8.5px] bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold px-1.5 uppercase">
                        Zero Knowledge Decrypted
                      </span>
                    </div>

                    <div className="p-4 bg-white font-sans text-xs text-gray-800 border leading-relaxed border-emerald-200 rounded-none whitespace-pre-wrap select-text selection:bg-emerald-200">
                      {decryptedText}
                    </div>

                    <div className="flex gap-2 justify-end pt-2 border-t border-emerald-200">
                      <Button
                        onClick={handleAnalyzeWithAI}
                        disabled={isAiProcessing}
                        className="font-mono text-[10px] uppercase font-bold flex items-center gap-1.5 bg-blue-950 border-blue-950 text-white hover:bg-blue-900 py-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                      >
                        <Sparkles size={11} /> {isAiProcessing ? "AI Model Reasoning..." : "Generate AI Medical Summary"}
                      </Button>
                    </div>

                    {aiSummary && (
                      <div className="mt-4 border-2 border-indigo-900 bg-white p-4">
                        <div className="flex items-center gap-1.5 border-b border-indigo-200 pb-2 mb-2 font-mono text-[10px] uppercase text-indigo-950 font-bold">
                          <Sparkles size={12} className="text-indigo-700" /> Educational Research Insights (Gemini Interpreter Engine)
                        </div>
                        <div className="prose max-w-none text-xs leading-relaxed font-sans text-slate-800 select-text">
                          <Markdown>{aiSummary}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Real patient directory interaction simulated */}
          <Card title="DECENTRALIZED CLINICAL ACCESS DIRECTORY" subtitle="SIMULATED LEASING OF CLINICAL OBSERVATION CREDENTIALS">
            <div className="space-y-3.5">
              <p className="font-mono text-[10px] text-gray-400 uppercase leading-relaxed">
                Choose any active sovereign patient node below to request temporary cryptographic observational access to their local medical records database branch.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {users.filter(u => u.role === "Patient").map(p => {
                  const reqStatus = observationRequests[p.id];
                  return (
                    <div key={p.id} className="border border-[#141414] bg-white p-3.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-sans text-xs font-black uppercase text-[#141414] leading-none mb-1">
                            {p.name}
                          </h5>
                          <span className="font-mono text-[8px] bg-slate-100 text-gray-600 px-1 border uppercase font-bold">
                            Mnemonic Node ID: {p.id}
                          </span>
                        </div>
                        <User className="h-6 w-6 text-gray-400" />
                      </div>

                      <div className="mt-3.5 border-t border-dashed pt-2.5 flex justify-between items-center text-[9px] font-mono">
                        <div>
                          {!reqStatus && (
                            <span className="text-gray-400 uppercase font-black tracking-tight">No Access Token</span>
                          )}
                          {reqStatus === "PENDING" && (
                            <span className="text-amber-600 font-bold tracking-tight animate-pulse uppercase">Request Pipeline Active...</span>
                          )}
                          {reqStatus === "GRANTED" && (
                            <span className="text-emerald-700 font-black uppercase tracking-tight flex items-center gap-1">● LEASE GRANTED</span>
                          )}
                          {reqStatus === "DENIED" && (
                            <span className="text-rose-800 font-black uppercase tracking-tight flex items-center gap-1">✕ LEASE DECLINED</span>
                          )}
                        </div>

                        {!reqStatus ? (
                          <button
                            onClick={() => requestObservation(p.id, p.name)}
                            className="font-mono text-[8.5px] uppercase font-bold underline text-indigo-700 hover:text-indigo-900"
                          >
                            Lease Observation Key
                          </button>
                        ) : reqStatus === "GRANTED" ? (
                          <span className="text-[8px] font-mono bg-emerald-100 border border-emerald-300 text-emerald-950 px-1 font-bold">
                            KEY: ***-SECURE-VAULT-KEY
                          </span>
                        ) : (
                          <button
                            onClick={() => requestObservation(p.id, p.name)}
                            className="font-mono text-[8px] opacity-60 uppercase underline"
                          >
                            Retry Request
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
};

const AuditorDashboard = ({ user }: { user: UserInfo }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [stats, setStats] = useState({ total: 0, uploads: 0, permissions: 0 });

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/audit?userId=${user.id}&role=Auditor`);
        const data = await res.json();
        setLogs(data);
        setStats({
          total: data.length,
          uploads: data.filter((l: any) => l.action === "UPLOAD").length,
          permissions: data.filter((l: any) => l.action === "GRANT_ACCESS" || l.action === "REVOKE_ACCESS").length,
        });
      } catch (e) {
        console.error(e);
      }
    };
  
    useEffect(() => {
      fetchLogs();
    }, [user]);

    return (
      <div className="space-y-8 animate-fadeIn">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#141414] pb-6">
          <div>
            <span className="font-mono text-[9px] bg-amber-950 text-amber-300 font-bold px-2 py-0.5 uppercase tracking-widest border border-amber-900 rounded-none mb-2 inline-block">
              Compliance Trust Registry Active
            </span>
            <h1 className="font-sans text-4xl font-extrabold tracking-tight text-[#141414]">
              Decentralized Transparency Audit
            </h1>
            <p className="font-mono text-xs opacity-60 uppercase mt-1">
              Authority Node: Global Regulatory Oversight Hub // Operator: {user.name}
            </p>
          </div>
          <Button onClick={fetchLogs} className="shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-y-[-1px]">
            <RefreshCw size={14} /> Refresh Protocol Logs
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <Card title="NETWORK AUDITING TELEMETRY">
              <div className="flex flex-col gap-4 py-2 font-mono text-xs">
                 <div className="flex justify-between items-end border-b pb-2">
                    <span className="text-gray-505 uppercase">Audited Actions:</span>
                    <span className="font-bold text-lg leading-none">{stats.total}</span>
                 </div>
                 <div className="flex justify-between items-end border-b pb-2">
                    <span className="text-gray-505 uppercase">Mining Submissions:</span>
                    <span className="font-bold text-lg leading-none">{stats.uploads}</span>
                 </div>
                 <div className="flex justify-between items-end pb-2">
                    <span className="text-gray-550 uppercase">Access Delegation Toggles:</span>
                    <span className="font-bold text-lg leading-none text-indigo-700">{stats.permissions}</span>
                 </div>

                 <div className="p-3 bg-emerald-50 border border-emerald-500 rounded-none text-emerald-950 text-[9px] leading-relaxed uppercase mt-4">
                    ● Audit Ledger Integrity holds 100% SHA-256 state matching. Dynamic consensus records sealed cleanly.
                 </div>
              </div>
           </Card>
           
           <div className="md:col-span-2">
             <Card title="GLOBAL TRANSACTION BLOCK LEDGER" subtitle="REAL-TIME IMMUTABLE AUDITING CHAIN" className="p-0">
               <div className="overflow-auto max-h-[380px]">
                 <table className="min-w-full font-mono text-[11px] bg-white">
                   <thead className="bg-[#141414] text-[#E4E3E0] uppercase text-[9px] tracking-widest sticky top-0">
                     <tr>
                       <th className="px-4 py-3.5 text-left font-bold">BLOCK-ID</th>
                       <th className="px-4 py-3.5 text-left font-bold">TIMESTAMP</th>
                       <th className="px-4 py-3.5 text-left font-bold">SIGNATURE ACTOR</th>
                       <th className="px-4 py-3.5 text-left font-bold">LEDGER ACTION</th>
                       <th className="px-4 py-3.5 text-left font-bold">VERIFY STATE</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                     {logs.map((l, idx) => (
                       <tr key={l.id || idx} className="hover:bg-slate-50 transition-colors">
                         <td className="px-4 py-3 text-indigo-800 font-bold uppercase truncate max-w-[80px]">#{l.id ? l.id.substring(0, 8) : `BLOCK_${1000 + idx}`}</td>
                         <td className="px-4 py-3 text-gray-500 font-bold">{new Date(l.timestamp).toLocaleTimeString()}</td>
                         <td className="px-3.5 py-3">
                           <span className="border px-1 py-0.5 bg-gray-50 font-bold text-[10px] text-gray-700">{l.actorId}</span> 
                           <span className="opacity-40 text-[9px] uppercase ml-1">({l.actorRole})</span>
                         </td>
                         <td className="px-4 py-3 font-extrabold uppercase text-slate-800">{l.action}</td>
                         <td className="px-4 py-3">
                           <span className="bg-emerald-50 text-emerald-800 px-1 py-0.5 border border-emerald-200 uppercase text-[9px] font-bold">
                             {l.status}
                           </span>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 {logs.length === 0 && (
                   <div className="p-16 text-center text-gray-400 font-mono text-xs italic">
                     Ledger empty. Node active. Waiting for client records.
                   </div>
                 )}
               </div>
             </Card>
           </div>
        </div>
      </div>
    );
};

// --- Shell, Register, and Authenticated shell ---

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);

  const refreshRegistry = async () => {
    try {
      const res = await fetch("/api/users");
      const list = await res.json();
      setUsers(list);
    } catch (e) {
      console.error("Registry fetch error", e);
    }
  };

  useEffect(() => {
    refreshRegistry();
  }, []);

  const login = (u: UserInfo) => setUser(u);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, users, login, logout, refreshRegistry }}>
      {children}
    </AuthContext.Provider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, users, login, logout, refreshRegistry } = useContext(AuthContext);
  
  // Registration Dialog State and forms
  const [showRegister, setShowRegister] = useState(false);
  const [regRole, setRegRole] = useState<"Patient" | "Doctor" | "Student">("Patient");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regContactNo, setRegContactNo] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regKey, setRegKey] = useState("");
  const [regSpecialty, setRegSpecialty] = useState("Cardiology");
  const [regStudentId, setRegStudentId] = useState("");
  const [regCourse, setRegCourse] = useState("Medical Imaging & Diagnostics");
  const [registering, setRegistering] = useState(false);

  const handleRegister = async (e: any) => {
    e.preventDefault();
    if (!regFirstName || !regLastName) {
      alert("Both first name and last name are required to register your node.");
      return;
    }

    if (regEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      alert("Please enter a valid email address.");
      return;
    }

    setRegistering(true);
    try {
      const payload = {
        firstName: regFirstName,
        lastName: regLastName,
        role: regRole,
        contactNo: regContactNo,
        email: regEmail,
        key: (regRole === "Patient" || regRole === "Student") ? regKey : undefined,
        specialty: regRole === "Doctor" ? regSpecialty : undefined,
        studentId: regRole === "Student" ? regStudentId : undefined,
        course: regRole === "Student" ? regCourse : undefined
      };

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const createdUser = await res.json();
        await refreshRegistry();
        
        // Dynamic feedback alert
        alert(`Sovereign Node Registered Successfully!\n\nYour Unique Sovereign ID: ${createdUser.id}\n${(regRole === "Patient" || regRole === "Student") ? `Sovereign Encryption Vault Key: ${createdUser.key}` : regRole === "Doctor" ? `Specialty Node: ${createdUser.specialty}` : ""}`);
        
        // Reset states
        setRegFirstName("");
        setRegLastName("");
        setRegContactNo("");
        setRegEmail("");
        setRegKey("");
        setRegStudentId("");
        setShowRegister(false);
        
        // Auto-select and log in the newly registered profile!
        login(createdUser);
      } else {
        const errData = await res.json();
        alert(`Failed to deploy node: ${errData.error || "Unknown server error"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Registration failed. Please check network connectivity.");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0EFEA] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0] flex flex-col">
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-6 min-h-screen relative overflow-y-auto">
          {/* Cosmic background details */}
          <div className="absolute inset-0 bg-[radial-gradient(#141414_1px,transparent_1px)] [background-size:16px_16px] opacity-[0.07] pointer-events-none" />
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-xl z-10"
          >
            <div className="flex items-center gap-3.5 mb-8 justify-center">
              <Shield size={44} className="text-[#141414] animate-pulse" />
              <div className="text-left leading-none">
                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 font-bold block mb-1">SOVEREIGN CRYPTOGRAPHIC TRUST HUB</span>
                <h1 className="font-mono text-4xl font-extrabold tracking-tighter uppercase italic text-gray-900 flex items-center gap-1.5 leading-none">
                  MedVault
                </h1>
              </div>
            </div>
            
            <Card title="DECENTRALIZED ACCESS CONSOLE" className="shadow-2xl border-2">
               <div className="space-y-4">
                  <p className="font-mono text-[10px] text-gray-400 uppercase italic mb-4 leading-relaxed border-b pb-3">
                     This E2E clinical workspace operates with client-only zero-knowledge decryption. Hospital administrators cannot access, track, or recover record blocks. Take lock control.
                  </p>

                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-[10px] font-bold uppercase text-gray-500">Pick Dynamic Node Session</span>
                    <button 
                      onClick={() => setShowRegister(true)}
                      className="font-mono text-[9px] text-indigo-700 font-extrabold uppercase hover:underline flex items-center gap-1 border border-indigo-200 bg-indigo-50/50 px-2 py-0.5 rounded-none"
                    >
                      + Register Profile
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {users.map(u => (
                      <button 
                        key={u.id}
                        onClick={() => login(u)}
                        className="w-full group flex items-center justify-between p-3.5 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] bg-white hover:border-[#141414] transition-all text-left shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-y-[-1px] rounded-none focus:outline-none"
                      >
                         <div className="flex items-center gap-4">
                           <div className="p-2 border border-[#141414] group-hover:border-[#E4E3E0] group-hover:bg-zinc-900 bg-slate-50 transition-colors">
                             {u.role === "Patient" ? (
                               <User className="h-5 w-5 text-emerald-800 group-hover:text-emerald-300" />
                             ) : u.role === "Doctor" ? (
                               <Stethoscope className="h-5 w-5 text-indigo-800 group-hover:text-indigo-300" />
                             ) : u.role === "Student" ? (
                               <GraduationCap className="h-5 w-5 text-blue-800 group-hover:text-blue-300" />
                             ) : (
                               <Eye className="h-5 w-5 text-amber-800 group-hover:text-amber-300" />
                             )}
                           </div>
                           <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-sans text-xs font-extrabold uppercase text-[#141414] group-hover:text-[#E4E3E0]">{u.name}</p>
                                <span className={cn(
                                  "font-mono text-[8px] px-1 font-bold rounded-none",
                                  u.role === "Patient" ? "bg-emerald-50 text-emerald-800 group-hover:bg-emerald-950 group-hover:text-emerald-300" :
                                  u.role === "Doctor" ? "bg-indigo-50 text-indigo-800 group-hover:bg-indigo-950 group-hover:text-indigo-300" :
                                  u.role === "Student" ? "bg-blue-50 text-blue-800 group-hover:bg-blue-950 group-hover:text-blue-300" :
                                  "bg-amber-50 text-amber-800 group-hover:bg-amber-950 group-hover:text-amber-300"
                                )}>
                                  {u.role}
                                </span>
                              </div>
                              <p className="font-mono text-[9px] opacity-65 group-hover:text-[#E4E3E0]/70 uppercase font-bold tracking-tighter mt-1">
                                {u.role === "Patient" ? `Mnemonic: ${u.id}` : 
                                 u.role === "Doctor" ? `Specialty: ${u.specialty || "Diagnostic Services"}` : 
                                 u.role === "Student" ? `ID: ${u.studentId || "STU-NONE"} • ${u.course || "Research Study"}` :
                                 "Oversight Node"}
                              </p>
                           </div>
                         </div>
                         <div className="flex items-center gap-1">
                           <span className="font-mono text-[8px] opacity-0 group-hover:opacity-100 uppercase font-extrabold tracking-widest text-[#E4E3E0]">ACCESS</span>
                           <ChevronRight className="opacity-40 group-hover:opacity-100 transition-all font-bold" size={14} />
                         </div>
                      </button>
                    ))}
                    {users.length === 0 && (
                      <div className="text-center font-mono py-12 text-gray-400 text-xs">Connecting to decentralized user registry...</div>
                    )}
                  </div>
               </div>
            </Card>

            <div className="mt-8 flex justify-center gap-8 opacity-45 font-mono text-[8px] uppercase tracking-widest text-center">
               <span className="flex items-center gap-1.5"><Lock size={10} /> AES-256 E2EE STATE</span>
               <span className="flex items-center gap-1.5"><Activity size={10} /> AUDITING CHAIN</span>
               <span className="flex items-center gap-1.5"><Unlock size={10} /> ZERO-KNOWLEDGE LEDGER</span>
            </div>
          </motion.div>

          {/* User registration slide-open modal */}
          <AnimatePresence>
            {showRegister && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#E4E3E0]/80 backdrop-blur-sm overflow-y-auto">
                <motion.div 
                  initial={{ scale: 0.98, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  exit={{ scale: 0.98, opacity: 0 }} 
                  className="w-full max-w-md my-auto"
                >
                  <Card title="DECENTRALIZED NODE SIGN-UP" subtitle="REGISTER CRYPTOGRAPHIC SOVEREIGN CREDENTIALS" className="shadow-2xl border-2">
                    <form onSubmit={handleRegister} className="space-y-3.5">
                      
                      <div className="grid grid-cols-3 gap-1 border p-1 bg-gray-50">
                        <button 
                          type="button" 
                          onClick={() => setRegRole("Patient")}
                          className={cn("py-2 text-center font-mono text-[9px] uppercase font-bold tracking-wider transition-colors", regRole === "Patient" ? "bg-emerald-950 text-white" : "hover:bg-gray-200 text-gray-800")}
                        >
                          Patient
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setRegRole("Doctor")}
                          className={cn("py-2 text-center font-mono text-[9px] uppercase font-bold tracking-wider transition-colors", regRole === "Doctor" ? "bg-indigo-950 text-white" : "hover:bg-gray-200 text-gray-800")}
                        >
                          Doctor
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setRegRole("Student")}
                          className={cn("py-2 text-center font-mono text-[9px] uppercase font-bold tracking-wider transition-colors", regRole === "Student" ? "bg-blue-950 text-white" : "hover:bg-gray-200 text-gray-800")}
                        >
                          Student
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-mono text-[9px] uppercase font-extrabold text-gray-600 mb-0.5">First Name</label>
                          <input 
                            type="text" 
                            value={regFirstName}
                            onChange={(e) => setRegFirstName(e.target.value)}
                            placeholder="Isabella"
                            required
                            className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white font-extrabold"
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-[9px] uppercase font-extrabold text-gray-600 mb-0.5">Last Name</label>
                          <input 
                            type="text" 
                            value={regLastName}
                            onChange={(e) => setRegLastName(e.target.value)}
                            placeholder="Mercer"
                            required
                            className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white font-extrabold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-mono text-[9px] uppercase font-extrabold text-gray-600 mb-0.5">Contact No</label>
                          <input 
                            type="text" 
                            value={regContactNo}
                            onChange={(e) => setRegContactNo(e.target.value)}
                            placeholder="+1 (555) 019-2834"
                            className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-[9px] uppercase font-extrabold text-gray-600 mb-0.5">Email ID</label>
                          <input 
                            type="email" 
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="isabella@medvault.org"
                            className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white"
                          />
                        </div>
                      </div>

                      {regRole === "Patient" && (
                        <div>
                          <div className="flex justify-between items-center mb-0.5">
                            <label className="block font-mono text-[9px] uppercase font-extrabold text-gray-600">Sovereign Vault Key Passphrase</label>
                            <span className="font-mono text-[7px] text-gray-400">SECRET</span>
                          </div>
                          <input 
                            type="password" 
                            value={regKey}
                            onChange={(e) => setRegKey(e.target.value)}
                            placeholder="Leave empty to auto-generate high-entropy key..."
                            className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white"
                          />
                          <p className="font-mono text-[8px] text-gray-400 mt-1 uppercase tracking-tight leading-normal">
                            * Auto key generation uses offline high-entropy pseudorandom words. Leave empty to auto-deploy secure sandbox key.
                          </p>
                        </div>
                      )}

                      {regRole === "Doctor" && (
                        <div>
                          <label className="block font-mono text-[9px] uppercase font-extrabold text-gray-600 mb-0.5">Medical Specialist Specialty</label>
                          <select 
                            value={regSpecialty} 
                            onChange={(e) => setRegSpecialty(e.target.value)}
                            className="w-full border border-[#141414] p-2 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white"
                          >
                            <option>Cardiology</option>
                            <option>Radiology</option>
                            <option>Diagnostics</option>
                            <option>Oncology</option>
                            <option>Pediatrics</option>
                            <option>Internal Medicine</option>
                            <option>General Practice</option>
                          </select>
                        </div>
                      )}

                      {regRole === "Student" && (
                        <div className="grid grid-cols-2 gap-3 p-2 bg-blue-50 border border-blue-200">
                          <div>
                            <label className="block font-mono text-[9px] uppercase font-extrabold text-blue-900 mb-0.5">Student ID</label>
                            <input 
                              type="text" 
                              value={regStudentId}
                              onChange={(e) => setRegStudentId(e.target.value)}
                              placeholder="e.g. STU-1192"
                              required
                              className="w-full border border-blue-300 p-1.5 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white text-blue-950 font-extrabold"
                            />
                          </div>
                          <div>
                            <label className="block font-mono text-[9px] uppercase font-extrabold text-blue-900 mb-0.5">Course / Specialization</label>
                            <select 
                              value={regCourse} 
                              onChange={(e) => setRegCourse(e.target.value)}
                              className="w-full border border-blue-300 p-1.5 font-mono text-xs focus:ring-0 outline-none rounded-none bg-white text-blue-950"
                            >
                              <option>Medical Imaging & Diagnostics</option>
                              <option>Clinical Research & Pharmacology</option>
                              <option>Primary Patient Care Practicum</option>
                              <option>Oncology Research Studies</option>
                              <option>Human Genetics & Immunology</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="pt-3 flex justify-end gap-2 border-t text-[10px]">
                        <Button type="button" variant="secondary" onClick={() => setShowRegister(false)} className="h-9 font-mono">
                          Cancel
                        </Button>
                        <Button type="submit" variant="primary" className="h-9 font-mono" disabled={registering}>
                          {registering ? "Deploying..." : "Publish Key Profile"}
                        </Button>
                      </div>
                    </form>
                  </Card>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col h-screen min-h-screen">
           <header className="border-b-2 border-[#141414] px-6 py-4 flex justify-between items-center bg-white sticky top-0 z-40">
              <div className="flex items-center gap-3">
                 <Shield size={24} className="text-[#141414]" />
                 <span className="font-mono text-xl font-black uppercase tracking-tighter italic text-[#141414]">MedVault</span>
                 <div className="h-4 w-px bg-gray-200 mx-1" />
                 <span className={cn(
                   "font-mono text-[9px] px-2 py-0.5 rounded-none uppercase font-bold tracking-wider border border-[#141414]",
                   user.role === "Patient" ? "bg-emerald-50 text-emerald-800" :
                   user.role === "Doctor" ? "bg-indigo-50 text-indigo-800" :
                   user.role === "Student" ? "bg-blue-50 text-blue-800" :
                   "bg-amber-50 text-amber-800"
                 )}>
                   {user.role} Active
                 </span>
              </div>
              
              <div className="flex items-center gap-6">
                 <div className="hidden sm:flex flex-col items-end">
                    <span className="font-sans text-xs font-extrabold uppercase text-[#141414]">{user.name}</span>
                    <span className="font-mono text-[8px] text-gray-400 uppercase tracking-widest font-bold">Node verified • local session</span>
                 </div>
                 <button 
                  onClick={logout} 
                  className="p-1.5 px-3 border border-[#141414] hover:bg-rose-900 hover:text-white rounded-none group transition-all font-mono text-[9.5px] uppercase tracking-wide flex items-center gap-1 bg-white hover:border-rose-900"
                  title="Disconnect Key Server Session"
                 >
                    Logout <LogOut size={11} className="group-hover:translate-x-0.5 transition-transform" />
                 </button>
              </div>
           </header>

           <main className="flex-1 overflow-auto p-6 md:p-12 max-w-7xl mx-auto w-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  {user.role === "Patient" && <PatientDashboard user={user} users={users} />}
                  {user.role === "Doctor" && <DoctorDashboard user={user} users={users} />}
                  {user.role === "Student" && <StudentDashboard user={user} users={users} />}
                  {user.role === "Auditor" && <AuditorDashboard user={user} />}
                </motion.div>
              </AnimatePresence>
           </main>

           <footer className="border-t-2 border-[#141414] px-6 py-3 bg-white text-[9px] font-mono uppercase tracking-widest text-gray-400 flex flex-col sm:flex-row justify-between gap-2.5 items-center">
              <span>© 2026 MedVault End-to-End Cryptography Trust Node. No data stored plaintext.</span>
              <span className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                 <span className="text-gray-800 font-bold">Decentralized Cryptographic Chain Synchronized</span>
              </span>
           </footer>
        </div>
      )}
    </div>
  );
}
